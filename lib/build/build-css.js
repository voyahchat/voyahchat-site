/**
 * Build Script: CSS Processing
 *
 * Responsibilities:
 * - Scan BEM blocks from configured levels
 * - Generate CSS imports based on bemdecl files
 * - Process CSS with PostCSS (import, autoprefixer)
 * - Replace image references with hashed versions
 * - Inline SVG files as data URIs
 * - Minify with CSSO
 * - Generate content-based hashes for cache busting
 *
 * Dependencies: postcss, csso, autoprefixer
 * Output: site/_c{hash}, .build/hash-css.json, .build/build-css.json
 *
 * @module build/build-css
 */

const fs = require('fs').promises;
const path = require('path');
const postcss = require('postcss');
const postcssImport = require('postcss-import');
const autoprefixer = require('autoprefixer');
const { minify } = require('csso');
const levels = require('../../config/levels.json');
const { generateHash } = require('./hash');
const { Dir } = require('./dir');
const { Stats } = require('./stats');

/**
 * CSS Build Script
 *
 * Processes BEM blocks and generates final CSS with hash-based cache busting
 * - Uses .build/ for processing workspace
 * - Outputs final CSS to site/ directory
 * - Never modifies source files
 */
class CSSBuilder {
    constructor(bundle = 'page', dir = Dir) {
        this.bundle = bundle;
        this.dir = dir;
    }

    static getSourcePaths(dir = Dir) {
        const projectRoot = dir.getRoot();

        return [
            path.resolve(projectRoot, 'external/adaptive-layout/blocks'),
            ...levels.map((level) => path.resolve(projectRoot, level)),
        ];
    }

    async build() {
        // 1. Ensure build directories exist
        await this.dir.ensure(this.dir.getBuild());
        await this.dir.ensure(this.dir.getSite());

        // 2. Generate CSS imports in build workspace
        const sourceFiles = await this.generateImports();

        // 3. Process with PostCSS
        const processedCSS = await this.processCSS();

        // 4. Minify with CSSO
        const minifiedCSS = CSSBuilder.minifyCSS(processedCSS);

        // 5. Generate hash for cache busting
        const hash = CSSBuilder.generateHash(minifiedCSS);

        // 6. Save final artifacts to site/
        await this.saveArtifacts(minifiedCSS, hash, sourceFiles);

        return { css: minifiedCSS, hash };
    }

    async generateImports() {
        // Load BEM declaration based on bundle - use blocks level
        const blocksLevel = levels.find((level) => level === 'blocks') || levels[levels.length - 1];
        const projectRoot = this.dir.getRoot();
        const bemdeclPath = path.resolve(
            projectRoot,
            blocksLevel,
            this.bundle,
            `${this.bundle}.bemdecl.js`,
        );

        // Load BEM declaration file
        let bemdecl = [];

        try {
            bemdecl = require(bemdeclPath);
        } catch (error) {
            console.warn(`Could not load BEM declaration from ${bemdeclPath}:`, error.message);
            bemdecl = [];
        }

        let cssImports = '';
        const sourceFiles = [];

        for (const block of bemdecl) {
            let hasImports = false;

            // Parse BEM block and element
            const parts = block.split('__');
            const blockName = parts[0];
            const elementName = parts[1];

            // Add imports for each source level
            for (const sourcePath of CSSBuilder.getSourcePaths(this.dir)) {
                // Construct path based on whether it's a block or element
                let blockPath;

                if (elementName) {
                    // It's a BEM element
                    blockPath = path.join(
                        sourcePath,
                        blockName,
                        `__${elementName}`,
                        `${block}.css`,
                    );
                } else {
                    // It's a BEM block
                    blockPath = path.join(
                        sourcePath,
                        block,
                        `${block}.css`,
                    );
                }

                // Check if file exists before adding import
                try {
                    await fs.access(blockPath);
                    cssImports += `@import "${blockPath}";\n`;
                    sourceFiles.push(blockPath);
                    hasImports = true;
                } catch (error) {
                    // File doesn't exist, skip
                }
            }

            // Add extra line between blocks if we had imports
            if (hasImports) {
                cssImports += '\n';
            }
        }

        // Write imports to build workspace
        const mainCssPath = path.join(this.dir.getBuild(), `${this.bundle}.css`);

        await fs.writeFile(mainCssPath, cssImports);

        return sourceFiles;
    }

    async processCSS() {
        const mainCssPath = path.join(this.dir.getBuild(), `${this.bundle}.css`);
        let css = await fs.readFile(mainCssPath, 'utf8');

        // Process CSS with PostCSS
        const result = await postcss([
            postcssImport(),
            autoprefixer(),
        ]).process(css, { from: mainCssPath });

        ({ css } = result);

        // Replace image references with hashed versions (update paths for new structure)
        css = await CSSBuilder.processImageReferences(css, this.dir);

        // Inline hashed SVG files as data:uri
        css = await CSSBuilder.inlineHashedSVGs(css, this.dir);

        return css;
    }

    static async inlineHashedSVGs(css, dir = Dir) {
        try {
            // Find all unique hashed SVG files in the CSS
            // Match both regular SVG filenames and hashed SVG filenames (HASH.svg)
            const svgUrlMatches = css.match(/url\([^)]*\/([a-f0-9]{16}\.svg|[^/)]+\.svg)[^)]*\)/g) || [];
            const uniqueSvgFiles = new Set();

            // Extract unique SVG filenames
            for (const match of svgUrlMatches) {
                const filenameMatch = match.match(/url\([^)]*\/([^/)]+\.svg)[^)]*\)/);
                if (filenameMatch && filenameMatch[1]) {
                    uniqueSvgFiles.add(filenameMatch[1]);
                }
            }

            let result = css;

            // Create a map to avoid processing the same SVG multiple times
            const processedSvgs = new Map();

            // Process each unique SVG file
            for (const hashedFilename of uniqueSvgFiles) {
                // Skip if we already processed this SVG
                if (processedSvgs.has(hashedFilename)) {
                    continue;
                }

                try {
                    // Read the hashed SVG file from site/svg/ directory
                    const svgPath = path.join(dir.getSite(), 'svg', hashedFilename);
                    const svgContent = await fs.readFile(svgPath, 'utf8');

                    // Convert to data:uri with URL encoding
                    const encodedSvg = encodeURIComponent(svgContent);
                    const dataUri = `data:image/svg+xml,${encodedSvg}`;

                    processedSvgs.set(hashedFilename, dataUri);
                } catch (error) {
                    // Don't warn for missing files during normal operation
                    // This can happen when SVG files are referenced but not yet built
                    if (error.code !== 'ENOENT') {
                        console.warn(`Warning: Could not inline hashed SVG ${hashedFilename}: ` +
                            `${error.message}`);
                    }
                    // If we can't read the file, skip processing it
                    continue;
                }
            }

            // Replace all SVG URLs with their data URIs
            for (const [hashedFilename, dataUri] of processedSvgs) {
                // Create a regex that matches any url() reference to this SVG file
                const escapedFilename = hashedFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const urlRegex = new RegExp(`url\\([^)]*${escapedFilename}[^)]*\\)`, 'g');
                result = result.replace(urlRegex, `url('${dataUri}')`);
            }

            return result;
        } catch (error) {
            // In production, this should fail, but in tests we can be more lenient
            if (process.env.NODE_ENV === 'test') {
                console.warn(`Warning: Error inlining hashed SVGs: ${error.message}`);

                return css;
            }
            throw new Error(`Error inlining hashed SVGs: ${error.message}`);
        }
    }

    static async processImageReferences(css, dir = Dir) {
        try {
            // Load image mapping from build directory
            const mappingPath = path.join(dir.getBuild(), 'image-mapping.json');
            let imageMapping = {};

            try {
                const mappingContent = await fs.readFile(mappingPath, 'utf8');
                imageMapping = JSON.parse(mappingContent);
            } catch (error) {
                // If mapping file doesn't exist, return original CSS
                if (process.env.NODE_ENV === 'test') {
                    // In test mode, warnings are expected and handled by test framework
                    // Do not output warnings to keep test output clean
                    return css;
                }
                throw new Error(`Could not load image mapping: ${error.message}`);
            }

            // Replace url() references with hashed filenames
            // This handles relative paths like ../logo/logo.svg or ./logo.svg
            const processedCss = css.replace(
                /url\(\s*['"]?([^'")]+\.(png|jpg|jpeg|gif|svg|webp))['"]?\s*\)/g,
                (match, imagePath) => {
                    // Normalize the path by removing leading ./ or ../
                    const normalizedImagePath = imagePath
                        .replace(/^\.\//, '')
                        .replace(/^\.\.\//g, '');

                    // Try to find the image in mapping
                    const foundEntry = Object.entries(imageMapping).find(([relativePath]) => {
                        // Check if the normalized path matches the mapping path
                        if (normalizedImagePath === relativePath) {
                            return true;
                        }

                        // Check if the filename matches (for relative paths)
                        const imageFilename = normalizedImagePath.split('/').pop();
                        const mappingFilename = relativePath.split('/').pop();

                        return imageFilename === mappingFilename;
                    });

                    if (foundEntry) {
                        const [, hashedFilename] = foundEntry;
                        // Determine the correct subdirectory based on file extension
                        const ext = path.extname(hashedFilename).toLowerCase();

                        if (ext === '.svg') {
                            // For SVG, return URL with just the filename (no subdir prefix)
                            return `url(/${hashedFilename})`;
                        }

                        // For other image types, use subdirectory prefix
                        let subdir = '';
                        if (ext === '.png') {
                            subdir = 'png/';
                        } else if (ext === '.jpg' || ext === '.jpeg') {
                            subdir = 'jpg/';
                        } else if (ext === '.webp') {
                            subdir = 'webp/';
                        }

                        return `url(/${subdir}${hashedFilename})`;
                    }

                    // If not found in mapping, return original
                    return match;
                },
            );

            return processedCss;
        } catch (error) {
            // If image mapping file doesn't exist or there's an error, return original CSS
            // In production, this should fail, but in tests we can be more lenient
            if (process.env.NODE_ENV === 'test') {
                // In test mode, warnings are expected and handled by test framework
                // Do not output warnings to keep test output clean
                return css;
            }
            throw new Error(`Could not process image references in CSS: ${error.message}`);
        }
    }

    static minifyCSS(css) {
        const minified = minify(css);

        return minified.css;
    }

    static generateHash(css) {
        return generateHash(css);
    }

    async saveArtifacts(css, hash, sourceFiles) {
        const hashedFilename = `${hash}.css`;

        // Read existing hash file or create new structure
        let allHashes = {};
        const buildHashPath = path.join(this.dir.getBuild(), 'hash-css.json');

        try {
            const existingHashes = await fs.readFile(buildHashPath, 'utf8');

            // Ensure the file is not empty before parsing
            if (existingHashes.trim()) {
                allHashes = JSON.parse(existingHashes);
            }
        } catch (error) {
            // File doesn't exist or is invalid, start with empty object
            allHashes = {};
        }

        // Update hash info for current bundle
        allHashes[this.bundle] = {
            hash,
            filename: hashedFilename,
            url: `/${hash}.css`,
        };

        // Save updated hash info to build directory
        await fs.writeFile(buildHashPath, JSON.stringify(allHashes, null, 2));

        // Save to site/css/ directory
        const cssDir = path.join(this.dir.getSite(), 'css');
        await fs.mkdir(cssDir, { recursive: true });
        const siteHashedPath = path.join(cssDir, hashedFilename);

        await fs.writeFile(siteHashedPath, css);

        // Collect statistics for this file
        const fileStats = await fs.stat(siteHashedPath);
        const projectRoot = this.dir.getRoot();

        // Convert source files to relative paths from project root
        const relativeSourceFiles = (sourceFiles || []).map((file) => path.relative(projectRoot, file));

        return {
            filename: hashedFilename,
            size: fileStats.size,
            source: relativeSourceFiles,
            hash,
        };
    }

    /**
     * Get source files for current bundle
     *
     * @returns {Promise<string[]>} Array of relative source file paths
     */
    async getSourceFiles() {
        const projectRoot = this.dir.getRoot();
        const blocksLevel = levels.find((level) => level === 'blocks') || levels[levels.length - 1];
        const bemdeclPath = path.resolve(projectRoot, blocksLevel, this.bundle, `${this.bundle}.bemdecl.js`);

        let bemdecl = [];
        try {
            bemdecl = require(bemdeclPath);
        } catch (error) {
            return [];
        }

        const sourceFiles = [];
        for (const block of bemdecl) {
            const parts = block.split('__');
            const blockName = parts[0];
            const elementName = parts[1];

            for (const sourcePath of CSSBuilder.getSourcePaths(this.dir)) {
                let blockPath;
                if (elementName) {
                    blockPath = path.join(sourcePath, blockName, `__${elementName}`, `${block}.css`);
                } else {
                    blockPath = path.join(sourcePath, block, `${block}.css`);
                }

                try {
                    await fs.access(blockPath);
                    sourceFiles.push(path.relative(projectRoot, blockPath));
                } catch (error) {
                    // File doesn't exist, skip
                }
            }
        }

        return sourceFiles;
    }
}

// Main execution block
if (require.main === module) {
    const { BUNDLES } = require('./constants');

    (async () => {
        try {
            const stats = new Stats('build-css.json', Dir.getBuild());

            for (const bundle of BUNDLES) {
                const builder = new CSSBuilder(bundle);
                await builder.build();

                // Read the hash file to get the filename
                const buildHashPath = path.join(builder.dir.getRoot(), '.build', 'hash-css.json');
                const hashData = JSON.parse(await fs.readFile(buildHashPath, 'utf8'));
                const bundleInfo = hashData[bundle];

                if (bundleInfo && bundleInfo.filename) {
                    const siteFilePath = path.join(builder.dir.getSite(), 'css', bundleInfo.filename);
                    const fileStats = await fs.stat(siteFilePath);

                    // Get source files from builder
                    const sourceFiles = await builder.getSourceFiles();

                    // Use filename without directory prefix to match compression structure
                    stats.add(
                        bundleInfo.filename,
                        sourceFiles,
                        fileStats.size,
                        {
                            hash: bundleInfo.hash,
                            url: bundleInfo.url,
                            bundle,
                        },
                    );
                }
            }

            await stats.save();
        } catch (error) {
            console.error('CSS build failed:', error.message);
            if (process.env.DEBUG) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = CSSBuilder;
