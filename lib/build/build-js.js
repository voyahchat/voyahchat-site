/**
 * Build Script: JavaScript Processing
 *
 * Responsibilities:
 * - Process JavaScript files
 * - Minify with Terser
 * - Generate content-based hashes
 *
 * Dependencies: terser
 * Output: site/{hash}.js, .build/hash-js.json, .build/build-js.json
 *
 * @module build/build-js
 */

const fs = require('fs').promises;
const path = require('path');
const { minify } = require('terser');
const levels = require('../../config/levels.json');
const jsMinifyConfig = require('../../config/config-minify-js');
const { generateHash } = require('./hash');
const { Dir } = require('./dir');
const { Stats } = require('./stats');

/**
 * JavaScript Builder
 *
 * Processes JavaScript files and generates minified output with hash-based cache busting.
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

            // 4. Generate JS bundle based on BEM declaration (legacy functionality)
            const bundleResult = await this.generateBundle();

            if (!bundleResult.content) {
                // No JS files found for this bundle
                return { files: jsFiles, inline: false };
            }

            // 5. Save final artifacts to site/ (minification and hash generation done inside)
            await this.saveArtifacts(bundleResult.content, bundleResult.sourceFiles);

            return { files: jsFiles, inline: false };
        } catch (error) {
            console.error('JavaScript build failed:', error);
            throw error; // Don't call process.exit(), let the caller handle it
        }
    }

    async generateBundle() {
        // Load BEM declaration based on bundle
        const blocksLevel = levels.find((level) => level === 'blocks') || levels[levels.length - 1];
        const projectRoot = this.dir.getRoot();
        const bemdeclPath = path.join(
            projectRoot,
            blocksLevel,
            this.bundle,
            `${this.bundle}.bemdecl.js`,
        );

        let bemdecl = [];

        try {
            bemdecl = require(bemdeclPath);
        } catch (error) {
            return { content: null, sourceFiles: [] };
        }

        let jsContent = '';
        const sourceFiles = [];

        for (const block of bemdecl) {
            let hasJS = false;

            // Parse BEM block and element
            const parts = block.split('__');
            const blockName = parts[0];
            const elementName = parts[1];

            // Add JS for each source level
            for (const sourcePath of this.sourcePaths) {
                // Construct path based on whether it's a block or element
                let jsPath;

                if (elementName) {
                    // It's a BEM element
                    jsPath = path.join(sourcePath, blockName, `__${elementName}`, `${block}.js`);
                } else {
                    // It's a BEM block
                    jsPath = path.join(sourcePath, block, `${block}.js`);
                }

                // Check if file exists before adding
                try {
                    await fs.access(jsPath);
                    const content = await fs.readFile(jsPath, 'utf8');

                    jsContent += `/* ${block} */\n${content}\n\n`;
                    sourceFiles.push(jsPath);
                    hasJS = true;
                } catch (error) {
                    // File doesn't exist, skip
                }
            }

            // Add separator between blocks if we had content
            if (hasJS) {
                jsContent += '\n';
            }
        }

        return {
            content: jsContent.trim() || null,
            sourceFiles,
        };
    }

    /**
     * Minify JavaScript using Terser
     * @param {string} js - JavaScript code to minify
     * @returns {Promise<string>} Minified JavaScript code
     */
    static async minifyJS(js) {
        try {
            const result = await minify(js, jsMinifyConfig);

            if (result.error) {
                throw new Error(`Terser error: ${result.error}`);
            }

            return result.code;
        } catch (error) {
            console.warn(
                'JavaScript minification failed, using original code:',
                error.message,
            );

            return js; // Fallback to original code if minification fails
        }
    }

    static generateHash(js) {
        return generateHash(js);
    }

    async saveArtifacts(js, sourceFiles) {
        // Minify JavaScript before saving
        const minifiedJS = await JSBuilder.minifyJS(js);

        // Generate hash from minified content for consistency
        const finalHash = JSBuilder.generateHash(minifiedJS);
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
            url: `/${hashedFilename}`,
            source: sourceFiles.map((file) => path.relative(this.dir.getRoot(), file)),
        };

        // Save updated hash info to build directory
        await fs.writeFile(buildHashPath, JSON.stringify(allHashes, null, 2));

        // Save to site directory root for 11ty
        const siteHashedPath = path.join(this.dir.getSite(), hashedFilename);

        await fs.writeFile(siteHashedPath, minifiedJS);

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
            // File doesn't exist, start with empty object
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
            // console.error(`Warning: Could not access directory ${dirPath}:`, error.message);
        }

        return jsFiles;
    }
}

// Main execution block
if (require.main === module) {
    const { BUNDLES } = require('./constants');

    (async () => {
        try {
            const stats = new Stats('build-js.json');

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
                        const siteFilePath = path.join(Dir.getSite(), bundleInfo.filename);
                        const fileStats = await fs.stat(siteFilePath);

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
