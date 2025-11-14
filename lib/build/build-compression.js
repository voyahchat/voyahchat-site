/**
 * Build Script: Asset Compression
 *
 * Responsibilities:
 * - Compress HTML, CSS, JS, SVG, XML files
 * - Generate Brotli (.br) compressed versions with maximum compression (level 11)
 * - Generate Gzip (.gz) compressed versions with maximum compression (level 9)
 * - Generate Zstd (.zst) compressed versions ONLY when better than Brotli (level 22)
 * - Track compression statistics
 *
 * Strategy:
 * - Brotli and Gzip are always generated (universal browser support)
 * - Zstd is only saved if it compresses better than Brotli
 * - This optimizes storage while keeping best compression for each file
 *
 * Dependencies: zlib (Node.js built-in), @mongodb-js/zstd
 * Output: site/brotli/*.br, site/gzip/*.gz, site/zstd/*.zst (conditional), .build/build-compression.json
 *
 * @module build/build-compression
 */

const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const { promisify } = require('util');
const zlib = require('zlib');
const zstd = require('@mongodb-js/zstd');
const { Dir } = require('./dir');
const { Stats } = require('./stats');

const brotliCompress = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

/**
 * Compression Build Script
 *
 * Compresses static assets for optimal web performance
 * - Uses brotli and gzip compression (always)
 * - Uses zstd compression (only when better than brotli)
 * - Outputs to site/brotli/, site/gzip/, and site/zstd/ directories
 * - Tracks compression statistics with conditional zstd metrics
 */
class CompressionBuilder {
    constructor(options = {}) {
        this.options = options;
        this.siteDir = process.env.SITE_DIR || Dir.getSite();
        this.brotliDir = path.join(this.siteDir, 'brotli');
        this.gzipDir = path.join(this.siteDir, 'gzip');
        this.zstdDir = path.join(this.siteDir, 'zstd');
        this.compressibleExtensions = ['.html', '.css', '.js', '.svg', '.xml', '.txt'];
    }

    /**
     * Ensure compression directories exist
     * @returns {Promise<void>}
     */
    async ensureDirectories() {
        await Dir.ensure(Dir.getBuild());
        await Dir.ensure(this.siteDir);

        // Create compression directories
        fssync.mkdirSync(this.brotliDir, { recursive: true });
        fssync.mkdirSync(this.gzipDir, { recursive: true });
        fssync.mkdirSync(this.zstdDir, { recursive: true });
    }

    /**
     * Find all compressible files in site directory
     * @returns {Promise<string[]>} Array of relative file paths
     */
    async findCompressibleFiles() {
        const files = [];

        async function findFiles(dir, baseDir, builder) {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(baseDir, fullPath);

                // Skip compression directories themselves
                const skipDirs = ['brotli', 'gzip', 'zstd'];
                if (skipDirs.some(dir => relativePath.startsWith(dir))) {
                    return;
                }

                if (entry.isDirectory()) {
                    await findFiles(fullPath, baseDir, builder);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);

                    // Skip robots.txt from compression - it's too small to benefit from compression
                    if (entry.name === 'robots.txt') {
                        return;
                    }

                    if (builder.compressibleExtensions.includes(ext)) {
                        files.push(relativePath);
                    }
                }
            }));
        }

        await findFiles(this.siteDir, this.siteDir, this);
        return files;
    }

    /**
     * Convert file path to flat filename for compression
     * @param {string} file - Relative file path
     * @returns {string} Flat filename
     */
    getFlatFilename(file) {
        // For HTML files, use flat filename (already created by build-html.js)
        // For other files (CSS, JS, SVG), keep original path
        let flatFilename = file;

        if (path.extname(file) === '.html' && file.includes(path.sep)) {
            // Convert path to flat filename: free/index.html -> free.html
            flatFilename = file.replace(/[/\\]/g, '_').replace(/_index\.html$/, '.html');
        }

        return flatFilename;
    }

    /**
     * Compress a single file with brotli, gzip, and conditionally zstd
     * Zstd is only saved if it compresses better than brotli
     * @param {string} file - Relative file path
     * @param {Stats} stats - Statistics collector
     * @returns {Promise<void>}
     */
    async compressFile(file, stats) {
        const sourcePath = path.join(this.siteDir, file);
        const content = await fs.readFile(sourcePath);

        // Skip empty files - no point in compressing them
        if (content.length === 0) {
            return;
        }

        const flatFilename = this.getFlatFilename(file);

        // Create brotli version with .br extension (maximum compression level 11)
        const brotliContent = await brotliCompress(content, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            },
        });
        const brotliPath = path.join(this.brotliDir, `${flatFilename}.br`);

        if (!this.options.skipWrite) {
            await fs.writeFile(brotliPath, brotliContent);
        }

        // Create gzip version with .gz extension (maximum compression level 9)
        const gzipContent = await gzip(content, {
            level: 9,
        });
        const gzipPath = path.join(this.gzipDir, `${flatFilename}.gz`);

        if (!this.options.skipWrite) {
            await fs.writeFile(gzipPath, gzipContent);
        }

        // Create zstd version with .zst extension (maximum compression level 22)
        // Only save if it compresses better than brotli
        const zstdContent = await zstd.compress(content, 22);
        const zstdPath = path.join(this.zstdDir, `${flatFilename}.zst`);

        // Track compression statistics - key includes compression directory
        const originalSize = content.length;
        const brotliSize = brotliContent.length;
        const gzipSize = gzipContent.length;
        const zstdSize = zstdContent.length;

        // Only save zstd if it's better than brotli
        const zstdBetterThanBrotli = zstdSize < brotliSize;

        if (zstdBetterThanBrotli && !this.options.skipWrite) {
            await fs.writeFile(zstdPath, zstdContent);
        }

        // Brotli file entry (always saved)
        stats.add(
            `brotli/${flatFilename}.br`,
            file,
            brotliSize,
            {
                algorithm: 'brotli',
                originalSize,
                compressionRatio: ((1 - brotliSize / originalSize) * 100).toFixed(2),
            },
        );

        // Gzip file entry (always saved)
        stats.add(
            `gzip/${flatFilename}.gz`,
            file,
            gzipSize,
            {
                algorithm: 'gzip',
                originalSize,
                compressionRatio: ((1 - gzipSize / originalSize) * 100).toFixed(2),
            },
        );

        // Zstd file entry (only if better than brotli)
        if (zstdBetterThanBrotli) {
            stats.add(
                `zstd/${flatFilename}.zst`,
                file,
                zstdSize,
                {
                    algorithm: 'zstd',
                    originalSize,
                    compressionRatio: ((1 - zstdSize / originalSize) * 100).toFixed(2),
                    betterThanBrotli: true,
                    savingsVsBrotli: brotliSize - zstdSize,
                },
            );
        }
    }

    /**
     * Build compressed assets with the current options
     * @returns {Promise<Object>} Build result with statistics
     */
    async build() {
        // Ensure compression directories exist
        await this.ensureDirectories();

        // Statistics tracking using collector
        const stats = new Stats('build-compression.json');

        // Find all compressible files
        const files = await this.findCompressibleFiles();

        // Compress each file
        for (const file of files) {
            await this.compressFile(file, stats);
        }

        // Save compression statistics using collector (only if not skipWrite)
        if (!this.options.skipWrite) {
            await stats.save();
        }

        // Count actual zstd files saved from statistics
        const statsData = stats.getData ? stats.getData() : { files: [] };
        const zstdFiles = statsData.files.filter(f => f.metadata && f.metadata.algorithm === 'zstd').length;

        // Return summary for benchmarking
        return {
            filesCompressed: files.length,
            brotliFiles: files.length,
            gzipFiles: files.length,
            zstdFiles: zstdFiles,
            totalFiles: files.length * 2 + zstdFiles, // brotli + gzip always, zstd conditionally
        };
    }
}

module.exports = {
    CompressionBuilder,
};

// Only run if called directly (not when imported for testing)
if (require.main === module) {
    const builder = new CompressionBuilder();
    builder.build().catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
}
