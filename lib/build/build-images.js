/**
 * Build Script: Image Processing
 *
 * Responsibilities:
 * - Find all images from source directories
 * - Copy images to site/ directory
 * - Generate image mapping file
 * - Track image statistics
 *
 * Dependencies: None (uses Node.js built-ins)
 * Output: site/{hash}.{ext}, site/avif/{hash}.avif, site/webp/{hash}.webp,
 *         .build/image-mapping.json, .build/build-images.json
 *
 * @module build/build-images
 */

const fs = require('fs').promises;
const path = require('path');
const levels = require('../../config/levels.json');
const { generateHash } = require('./hash');
const { Dir } = require('./dir');
const { Stats } = require('./stats');

/**
 * Image Builder
 *
 * Processes images from source directories and copies them to site/ directory.
 *
 * @class
 */
class ImageBuilder {
    /**
     * Create a new image processor
     * @param {Object} [options={}] - Configuration options
     * @param {string[]} [options.sourceDirs] - Source directories to scan
     * @param {string} [options.buildDir] - Build directory path
     * @param {string} [options.outputDir] - Output directory path
     * @param {boolean} [options.skipWrite] - Skip writing files to disk
     */
    constructor(options = {}) {
        const projectRoot = Dir.getRoot();

        this.sourceDirs = options.sourceDirs
            || levels.map((level) => path.join(projectRoot, level));
        this.buildDir = options.buildDir || Dir.getBuild();
        this.outputDir = options.outputDir || Dir.getSite();
        this.avifDir = path.join(this.outputDir, 'avif');
        this.webpDir = path.join(this.outputDir, 'webp');

        this.supportedFormats = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
        this.svgFormat = '.svg';

        this.stats = {
            filesScanned: 0,
            filesProcessed: 0,
            duplicatesFound: 0,
            totalSize: 0,
            errors: 0,
            cacheHits: 0,
        };

        this.imageList = [];
        this.imageMapping = new Map();
        this.hashToFilename = new Map();
        this.imageStats = new Map();
        this.cache = {};
        this.skipWrite = options.skipWrite || false;
    }

    /**
     * Build image assets
     *
     * @returns {Promise<Object>} Build result with mapping and stats
     * @throws {Error} If build fails
     */
    async build() {
        await this.ensureDirectories();

        // 1. Recursively find all images from all source directories
        await Promise.all(this.sourceDirs.map((sourceDir) => this.collectImagePaths(sourceDir)));

        // 2. Process all images in parallel
        const processingPromises = this.imageList.map((imagePath) => this.processImage(imagePath));

        await Promise.all(processingPromises);

        // 3. Generate the mapping file
        await this.generateMappingFile();

        return {
            mapping: Object.fromEntries(this.imageMapping),
            stats: this.stats,
            imageStats: this.imageStats,
        };
    }

    async ensureDirectories() {
        await Dir.ensure(this.buildDir);
        await Dir.ensure(this.outputDir);
        await Dir.ensure(this.avifDir);
        await Dir.ensure(this.webpDir);
    }

    /**
     * Find all images recursively
     *
     * @param {string} dirPath - Directory to search
     * @returns {Promise<void>}
     */
    async collectImagePaths(dirPath) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        await Promise.all(entries.map(async (entry) => {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === '.git') {
                    return;
                }
                await this.collectImagePaths(fullPath);

                return;
            }

            if (!entry.isFile()) {
                return;
            }

            const ext = path.extname(entry.name).toLowerCase();

            if (this.supportedFormats.includes(ext) || ext === this.svgFormat) {
                this.imageList.push(fullPath);
            }
        }));
    }

    /**
     * Process a single image
     *
     * @param {string} imagePath - Path to image
     * @returns {Promise<void>}
     */
    async processImage(imagePath) {
        // Find which source directory this image belongs to
        const sourceDirEntry = this.sourceDirs.find((dir) => imagePath.startsWith(dir));

        if (!sourceDirEntry) {
            console.warn(`Warning: Could not determine source directory for image: ${imagePath}`);

            return;
        }

        const sourceDir = sourceDirEntry;
        const relativePath = path.relative(sourceDir, imagePath);

        if (!sourceDir || !relativePath) {
            console.warn(`Warning: Could not determine source directory for image: ${imagePath}`);

            return;
        }

        this.stats.filesScanned += 1;

        try {
            // Check cache first
            const fileStat = await fs.stat(imagePath);
            const mtime = fileStat.mtime.toISOString();
            const cacheKey = relativePath;

            if (this.cache[cacheKey] && this.cache[cacheKey].mtime === mtime) {
                // Cache hit - use existing cached data
                const cachedData = this.cache[cacheKey];

                this.imageMapping.set(relativePath, cachedData.hashedFilename);
                this.stats.cacheHits += 1;

                return;
            }

            // Cache miss - process the image
            const imageBuffer = await fs.readFile(imagePath);
            const hash = generateHash(imageBuffer);
            const ext = path.extname(imagePath);
            const isSvg = ext.toLowerCase() === this.svgFormat;

            // SVG files are treated like CSS/JS: _s{hash} without extension
            // Other images: _i{hash} reference, but stored as {hash}.ext
            const imageRef = isSvg ? `_s${hash}` : `_i${hash}`;
            const hashedFilename = isSvg ? `_s${hash}` : `${hash}${ext}`;

            this.stats.totalSize += imageBuffer.length;

            // Handle duplicates without re-writing the file
            if (this.hashToFilename.has(hash)) {
                this.stats.duplicatesFound += 1;
            } else {
                // Copy the file directly instead of writing buffer (unless skipWrite)
                if (!this.skipWrite) {
                    const outputPath = path.join(this.outputDir, hashedFilename);

                    await fs.copyFile(imagePath, outputPath);

                    // Check for AVIF and WebP versions (only for non-SVG images)
                    const avifExists = !isSvg ? await this.checkModernFormat(imagePath, hash, 'avif') : false;
                    const webpExists = !isSvg ? await this.checkModernFormat(imagePath, hash, 'webp') : false;

                    // Store stats for this image
                    const stats = await fs.stat(outputPath);

                    this.imageStats.set(hashedFilename, {
                        source: relativePath,
                        size: stats.size,
                        hash,
                        ref: imageRef,
                        format: ext.substring(1),
                        avif: avifExists,
                        webp: webpExists,
                    });
                } else {
                    // When skipWrite, use buffer size for stats
                    this.imageStats.set(hashedFilename, {
                        source: relativePath,
                        size: imageBuffer.length,
                        hash,
                        ref: imageRef,
                        format: ext.substring(1),
                        avif: false,
                        webp: false,
                    });
                }
                this.hashToFilename.set(hash, hashedFilename);
            }

            // Update cache
            this.cache[cacheKey] = {
                mtime,
                hash,
                hashedFilename,
                imageRef,
            };

            // Update mappings and stats - use imageRef for reference
            this.imageMapping.set(relativePath, imageRef);
            this.stats.filesProcessed += 1;
        } catch (error) {
            // Silent error handling for tests
            // console.error(`Error processing image ${imagePath}:`, error.message);
            this.stats.errors += 1;
        }
    }

    async generateMappingFile() {
        if (!this.skipWrite) {
            const mappingPath = path.join(this.buildDir, 'image-mapping.json');

            await fs.writeFile(
                mappingPath,
                JSON.stringify(Object.fromEntries(this.imageMapping), null, 2),
            );
        }
    }

    /**
     * Check if modern format (AVIF/WebP) exists for original image
     * Looks in the same directory as the original image
     * @param {string} imagePath - Original image path
     * @param {string} hash - Image hash
     * @param {string} format - Format to check ('avif' or 'webp')
     * @returns {Promise<boolean>} True if format exists
     */
    async checkModernFormat(imagePath, hash, format) {
        try {
            // Get the directory and base name of the original image
            const imageDir = path.dirname(imagePath);
            const imageExt = path.extname(imagePath);
            const imageBaseName = path.basename(imagePath, imageExt);

            // Look for format file with same base name in same directory
            const formatPath = path.join(imageDir, `${imageBaseName}.${format}`);

            try {
                await fs.access(formatPath);

                // If file exists, copy it to output directory
                const outputPath = path.join(
                    format === 'avif' ? this.avifDir : this.webpDir,
                    `${hash}.${format}`,
                );

                await fs.copyFile(formatPath, outputPath);

                return true;
            } catch (error) {
                // File doesn't exist
                return false;
            }
        } catch (error) {
            // Error accessing file
            return false;
        }
    }
}

/**
 * Run image processing with optional parameters
 * @param {Object} options - Options object
 * @param {boolean} options.skipWrite - Skip writing files to disk
 * @param {Array} options.sourceDirs - Custom source directories
 * @param {string} options.buildDir - Custom build directory
 * @param {string} options.outputDir - Custom output directory
 */
async function runImageProcessing(options = {}) {
    const builder = new ImageBuilder(options);
    const result = await builder.build();

    // Generate unified statistics format
    const allStats = {};

    // Convert imageStats to unified format
    result.imageStats.forEach((imageData, hashedFilename) => {
        allStats[hashedFilename] = {
            source: imageData.source,
            size: imageData.size,
            metadata: {
                hash: imageData.hash,
                url: `/${imageData.ref || hashedFilename}`,
                ref: imageData.ref,
                format: imageData.format,
                avif: imageData.avif || false,
                webp: imageData.webp || false,
            },
        };
    });

    // Save statistics in unified format unless skipWrite
    if (!options.skipWrite) {
        await Stats.saveToFile('build-images.json', allStats);
    }

    return {
        mapping: result.imageMapping ? Object.fromEntries(result.imageMapping) : {},
        stats: result.stats,
        imageStats: result.imageStats,
        allStats,
    };
}

// Run the script if called directly
if (require.main === module) {
    runImageProcessing().catch((error) => {
        console.error('Image processing failed:', error);
        process.exit(1);
    });
}

module.exports = {
    ImageBuilder,
    ImageProcessor: ImageBuilder, // Backward compatibility alias
    runImageProcessing,
};
