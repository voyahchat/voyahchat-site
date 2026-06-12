/**
 * Build Script: JavaScript Processing
 *
 * Responsibilities:
 * - Process JavaScript files using esbuild
 * - Bundle npm dependencies (resolves imports from node_modules)
 * - Minify and generate content-based hashes
 *
 * Dependencies: esbuild
 * Output: site/js/{hash}.js, .build/hash-js.json, .build/build-js.json
 *
 * @module build/build-js
 */

const fs = require('fs').promises;
const path = require('path');
const esbuild = require('esbuild');
const levels = require('../../config/levels.json');
const { generateHash } = require('../utils/hash');
const { Dir } = require('../utils/dir');
const { Stats } = require('./stats');
const { Timestamp } = require('./timestamp');
const { loadBemDeclaration } = require('./utils');

/**
 * JavaScript Builder
 *
 * Processes JavaScript files and generates minified output with hash-based cache busting.
 * Uses esbuild for bundling and minification (supports npm imports).
 *
 * @class
 */
class JSBuilder {
    /**
     * Create a new JS builder
     * @param {string} [bundle='page'] - Bundle name
     * @param {Object} [dir=Dir] - Directory utility (for dependency injection)
     */
    constructor(bundle = 'page', dir = Dir) {
        this.bundle = bundle;
        this.dir = dir;
        this.sourcePaths = levels.map((level) => path.join(this.dir.getRoot(), level));
        this.jsExtensions = ['.js', '.mjs', '.ts'];
    }

    /**
     * Build JavaScript bundle
     * @returns {Promise<Object>} Build result
     * @throws {Error} If build fails
     */
    async build() {
        try {
            // 1. Ensure build directory exists
            await this.dir.ensure(this.dir.getBuild());
            await this.dir.ensure(this.dir.getSite());

            // 2. Scan for JavaScript files
            const jsFiles = await this.scanForJavaScriptFiles();

            if (jsFiles.length === 0) {
                // No JS files found - create empty hash file anyway
                await this.saveEmptyHashFile();

                return { files: [], inline: true };
            }

            // 3. Generate JS bundle using esbuild
            const bundleResult = await this.generateBundle();

            if (!bundleResult.content) {
                // No JS files found for this bundle
                return { files: jsFiles, inline: false };
            }

            // 4. Save final artifacts to site/
            await this.saveArtifacts(bundleResult.content, bundleResult.sourceFiles);

            return { files: jsFiles, inline: false };
        } catch (error) {
            console.error('JavaScript build failed:', error);
            throw error; // Don't call process.exit(), let the caller handle it
        }
    }

    async generateBundle() {
        // Load BEM declaration using utility function
        const bemdecl = loadBemDeclaration(this.bundle, this.dir);
        if (bemdecl.length === 0) {
            return { content: null, sourceFiles: [] };
        }

        // Collect JS entry points from BEM blocks
        const entryPoints = [];
        for (const block of bemdecl) {
            const parts = block.split('__');
            const blockName = parts[0];
            const elementName = parts[1];

            for (const sourcePath of this.sourcePaths) {
                let jsPath;
                if (elementName) {
                    jsPath = path.join(sourcePath, blockName, `__${elementName}`, `${block}.js`);
                } else {
                    jsPath = path.join(sourcePath, block, `${block}.js`);
                }

                try {
                    await fs.access(jsPath);
                    entryPoints.push(jsPath);
                } catch {
                    // File doesn't exist, skip
                }
            }
        }

        if (entryPoints.length === 0) {
            return { content: null, sourceFiles: [] };
        }

        // Generate temp entry file that imports all block JS files
        const entryContent = entryPoints.map(p => `import ${JSON.stringify(p)};`).join('\n');
        const entryPath = path.join(this.dir.getBuild(), `${this.bundle}-entry.js`);
        await this.dir.ensure(this.dir.getBuild());
        await fs.writeFile(entryPath, entryContent);

        try {
            const result = await esbuild.build({
                entryPoints: [entryPath],
                bundle: true,
                minify: true,
                write: false,
                format: 'iife',
                target: ['es2018'],
            });

            const jsContent = result.outputFiles[0].text;

            return { content: jsContent, sourceFiles: entryPoints };
        } catch (error) {
            return { content: null, sourceFiles: [] };
        }
    }

    /**
     * Minify JavaScript using esbuild
     * @param {string} js - JavaScript source code
     * @returns {Promise<string>} Minified JavaScript
     */
    static async minifyJS(js) {
        try {
            const result = await esbuild.transform(js, {
                minify: true,
                target: ['es2018'],
            });

            return result.code.trim();
        } catch {
            // Fallback to original code on minification error
            return js;
        }
    }

    static generateHash(js) {
        return generateHash(js);
    }

    async saveArtifacts(js, sourceFiles) {
        // esbuild already minified the JS
        const finalHash = JSBuilder.generateHash(js);
        const hashedFilename = `${finalHash}.js`;

        // Read existing hash file or create new structure
        let allHashes = {};
        const buildHashPath = path.join(this.dir.getBuild(), 'hash-js.json');

        try {
            const existingHashes = await fs.readFile(buildHashPath, 'utf8');

            allHashes = JSON.parse(existingHashes);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty object
        }

        // Update hash info for current bundle
        allHashes[this.bundle] = {
            hash: finalHash,
            filename: hashedFilename,
            url: `/${finalHash}.js`,
            source: sourceFiles.map((file) => path.relative(this.dir.getRoot(), file)),
        };

        // Save updated hash info to build directory
        await fs.writeFile(buildHashPath, JSON.stringify(allHashes, null, 2));

        // Save to site/js/ directory
        const jsDir = path.join(this.dir.getSite(), 'js');
        await fs.mkdir(jsDir, { recursive: true });
        const siteHashedPath = path.join(jsDir, hashedFilename);

        await fs.writeFile(siteHashedPath, js);

        // Set timestamp from source JS files (use latest) - CRITICAL: build must fail if timestamp cannot be set
        if (sourceFiles && sourceFiles.length > 0) {
            try {
                await Timestamp.setTimestamp(siteHashedPath, sourceFiles);
            } catch (timestampError) {
                const errorMsg = 'CRITICAL: Failed to set timestamp for '
                    + `${hashedFilename} from source JS files: ${timestampError.message}`;
                throw new Error(errorMsg);
            }
        }

        return {
            filename: hashedFilename,
            sourceFiles,
            hash: finalHash,
        };
    }

    async saveEmptyHashFile() {
        // Create empty hash file only for current bundle if no JS files found
        const buildHashPath = path.join(this.dir.getBuild(), 'hash-js.json');

        let allHashes = {};

        try {
            const existingHashes = await fs.readFile(buildHashPath, 'utf8');

            allHashes = JSON.parse(existingHashes);
        } catch (error) {
            // File doesn't exist or start with empty object
        }

        // Only add empty entry for current bundle
        allHashes[this.bundle] = {
            hash: 'empty',
            filename: 'empty.js',
            url: '/empty.js',
            source: [],
        };

        await fs.writeFile(buildHashPath, JSON.stringify(allHashes, null, 2));
    }

    async scanForJavaScriptFiles() {
        const allFiles = [];

        await Promise.all(this.sourcePaths.map(async (sourcePath) => {
            try {
                const files = await this.findJavaScriptFilesRecursively(sourcePath);

                allFiles.push(...files);
            } catch (error) {
                // Continue with other paths if one fails
                console.warn(
                    `Warning: Could not scan ${sourcePath}:`,
                    error.message,
                );
            }
        }));

        return allFiles;
    }

    async findJavaScriptFilesRecursively(dirPath) {
        const jsFiles = [];

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Skip hidden directories and system directories
                    if (entry.name.startsWith('.')
                            || entry.name === 'node_modules'
                            || entry.name === 'scripts'
                            || entry.name === 'lib') {
                        return;
                    }

                    // Recursively scan subdirectories
                    const subFiles = await this.findJavaScriptFilesRecursively(fullPath);

                    jsFiles.push(...subFiles);

                    return;
                }

                if (!entry.isFile()) {
                    return;
                }

                // Check if file has JavaScript extension and is not a system file
                const ext = path.extname(entry.name);
                const basename = path.basename(entry.name, ext);

                if (this.jsExtensions.includes(ext)
                        && !basename.includes('test.bemdecl')
                        && !basename.includes('config')) {
                    jsFiles.push(fullPath);
                }
            }));
        } catch (error) {
            // Handle directory access errors gracefully - silent in tests
        }

        return jsFiles;
    }
}

// Main execution block
if (require.main === module) {
    const { BUNDLES } = require('./constants');

    (async () => {
        try {
            const stats = new Stats('build-js.json', Dir.getBuild());

            // Build all bundles first
            for (const bundle of BUNDLES) {
                const builder = new JSBuilder(bundle);
                await builder.build();
            }

            // Then read hash file and collect stats
            const buildHashPath = path.join(Dir.getRoot(), '.build', 'hash-js.json');

            try {
                const hashData = JSON.parse(await fs.readFile(buildHashPath, 'utf8'));

                for (const bundle of BUNDLES) {
                    const bundleInfo = hashData[bundle];

                    if (bundleInfo && bundleInfo.filename && bundleInfo.filename !== 'empty.js') {
                        const siteFilePath = path.join(Dir.getSite(), 'js', bundleInfo.filename);
                        const fileStats = await fs.stat(siteFilePath);

                        // Use filename without directory prefix to match compression structure
                        stats.add(
                            bundleInfo.filename,
                            bundleInfo.source || [],
                            fileStats.size,
                            {
                                hash: bundleInfo.hash,
                                url: bundleInfo.url,
                                bundle,
                            },
                        );
                    }
                }
            } catch (error) {
                // Hash file doesn't exist or is invalid - no bundles were built
                // This is OK, just save empty stats
            }

            await stats.save();
        } catch (error) {
            console.error('JS build failed:', error.message);
            if (process.env.DEBUG) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = JSBuilder;
