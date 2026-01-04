/**
 * Build Script: Assets Processing
 *
 * Responsibilities:
 * - Copy PDF and ZIP files from external repositories
 * - Copy assets to site directory
 * - Copy configuration files (robots.txt, .htaccess, etc.)
 * - Track build statistics
 *
 * Dependencies: None (uses Node.js built-ins)
 * Output: site/*.pdf, site/*.zip, site/robots.txt, site/.htaccess, .build/build-assets.json
 *
 * @module build/build-assets
 */

const fs = require('fs').promises;
const path = require('path');
const { Dir } = require('./dir');
const { Stats } = require('./stats');
const { Timestamp } = require('./timestamp');

/**
 * Assets Build Script
 *
 * Processes external asset files and configuration files for deployment
 * - Uses .assets/ for processing workspace
 * - Outputs final assets to site/ directory
 * - Never modifies source files
 */
class AssetsBuilder {
    constructor(options = {}, dir = Dir) {
        this.options = options;
        this.dir = dir;
        this.projectRoot = dir.getRoot();
        this.siteDir = dir.getSite();
        this.ASSETS_DIR = path.resolve(this.projectRoot, '.assets');
        this.CONFIG_DIR = path.resolve(this.projectRoot, 'config');

        this.SOURCE_REPOS = [
            {
                name: 'voyahchat-install',
                path: path.resolve(this.projectRoot, 'external/voyahchat-install'),
            },
            {
                name: 'voyahchat-docs',
                path: path.resolve(this.projectRoot, 'external/voyahchat-docs'),
            },
            {
                name: 'voyahchat-content',
                path: path.resolve(this.projectRoot, 'external/voyahchat-content'),
            },
        ];
    }

    /**
     * Copy a single static config file to site directory
     * @param {string} filename - Name of the config file
     * @param {Stats} stats - Statistics collector instance
     * @returns {Promise<boolean>} True if file was copied, false if skipped
     */
    async copyStaticConfigFile(filename, stats) {
        const sourcePath = path.join(this.CONFIG_DIR, filename);
        const destPath = path.join(this.siteDir, filename);

        try {
            await fs.access(sourcePath);
            await fs.copyFile(sourcePath, destPath);

            // Set timestamp from source config file - CRITICAL: build must fail if timestamp cannot be set
            try {
                await Timestamp.setTimestamp(destPath, sourcePath);
            } catch (timestampError) {
                throw new Error(
                    `CRITICAL: Failed to set timestamp for ${filename} from ${sourcePath}: ${timestampError.message}`,
                );
            }

            // Collect statistics
            const fileStats = await fs.stat(destPath);
            const relativeSourcePath = path.relative(this.projectRoot, sourcePath);
            const ext = path.extname(filename).substring(1) || 'txt'; // Default to txt if no extension

            stats.add(
                filename,
                relativeSourcePath,
                fileStats.size,
                {
                    url: `/${filename}`,
                    sourceUrl: `file://${relativeSourcePath}`,
                    type: ext,
                },
            );

            return true;
        } catch (error) {
            // File doesn't exist, skip silently
            return false;
        }
    }

    /**
     * Copy configuration files (robots.txt, .htaccess, etc.) to site directory
     * @param {Stats} stats - Statistics collector instance to use
     * @returns {Promise<void>}
     */
    async copyConfigFiles(stats) {
        await this.dir.ensure(this.siteDir);

        // List of static config files to copy
        const configFiles = ['robots.txt', '.htaccess'];

        for (const filename of configFiles) {
            await this.copyStaticConfigFile(filename, stats);
        }
    }

    /**
     * Recursively find asset files in a directory
     * @param {string} dirPath - Directory path to search
     * @param {string} basePath - Base path for calculating relative paths
     * @returns {Promise<Array>} Array of objects with file info
     */
    async findAssetFiles(dirPath, basePath = dirPath) {
        const results = [];

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Recursively search subdirectories
                    const subDirFiles = await this.findAssetFiles(fullPath, basePath);
                    results.push(...subDirFiles);
                } else if (entry.isFile() && (
                    entry.name.endsWith('.pdf') ||
                    entry.name.endsWith('.zip') ||
                    entry.name.endsWith('.ini')
                )) {
                    // Add file info to results
                    results.push({
                        filename: entry.name,
                        fullPath: fullPath,
                        relativePath: path.relative(basePath, fullPath),
                    });
                }
            }
        } catch (error) {
            // Directory access error, return empty results
        }

        return results;
    }

    /**
     * Copy assets from external repositories to site directory
     * @param {Stats} stats - Statistics collector instance
     * @returns {Promise<void>}
     */
    async copyAssets(stats) {
        await this.dir.ensure(this.siteDir);

        for (const repo of this.SOURCE_REPOS) {
            try {
                await fs.access(repo.path);

                try {
                    // Find asset files recursively
                    const assetFiles = await this.findAssetFiles(repo.path);

                    if (assetFiles.length > 0) {
                        for (const fileInfo of assetFiles) {
                            const sourcePath = fileInfo.fullPath;
                            const destPath = path.join(this.siteDir, fileInfo.filename);

                            await fs.copyFile(sourcePath, destPath);

                            // Set timestamp from source asset - CRITICAL: build must fail if timestamp cannot be set
                            try {
                                await Timestamp.setTimestamp(destPath, sourcePath);
                            } catch (timestampError) {
                                throw new Error(
                                    `CRITICAL: Failed to set timestamp for ${fileInfo.filename} from ${sourcePath}: `
                                    + `${timestampError.message}`,
                                );
                            }

                            // Collect statistics for this file
                            const fileStats = await fs.stat(sourcePath);
                            const ext = path.extname(fileInfo.filename).substring(1); // Remove leading dot
                            const relativeSourcePath = path.relative(this.projectRoot, sourcePath);

                            stats.add(
                                fileInfo.filename,
                                relativeSourcePath,
                                fileStats.size,
                                {
                                    url: `/${fileInfo.filename}`,
                                    sourceUrl: `file://${relativeSourcePath}`,
                                    type: ext,
                                },
                            );
                        }
                    }
                } catch (error) {
                    // During tests, don't output warnings - tests must be silent
                    if (process.env.NODE_ENV !== 'test') {
                        console.warn(`Warning: Failed to process assets from ${repo.name}: ${error.message}`);
                    }
                }
            } catch {
                // Directory doesn't exist, skip silently
                if (process.env.NODE_ENV !== 'test') {
                    console.warn(`Warning: Directory not found for ${repo.name}, skipping...`);
                }
            }
        }
    }

    /**
     * Build assets with the current options
     * @returns {Promise<Object>} Build result with statistics
     */
    async build() {
        // Create a single Stats instance for the entire build process
        const buildDir = this.dir.getBuild();
        const stats = new Stats('build-assets.json', buildDir);

        // Load existing stats to merge with new data
        let existingStats = {};
        try {
            const statsPath = path.join(buildDir, 'build-assets.json');
            const content = await fs.readFile(statsPath, 'utf8');
            existingStats = JSON.parse(content);
        } catch (error) {
            // File doesn't exist, start with empty stats
        }

        stats.stats = existingStats; // Load existing data

        // Copy assets from external repos
        await this.copyAssets(stats);

        // Copy config files (robots.txt, .htaccess, etc.)
        await this.copyConfigFiles(stats);

        // Save statistics using collector (only if not skipWrite)
        if (!this.options.skipWrite) {
            await stats.save();
        }

        // Count how many config files were actually copied
        const configFilesCount = Object.keys(stats.stats).filter(
            key => key === 'robots.txt' || key === '.htaccess',
        ).length;

        // Return summary for benchmarking
        return {
            assetsProcessed: Object.keys(stats.stats).length - configFilesCount,
            configFilesProcessed: configFilesCount,
            totalFiles: Object.keys(stats.stats).length,
        };
    }
}

module.exports = {
    AssetsBuilder,
};

// Only run if called directly (not when imported for testing)
if (require.main === module) {
    const builder = new AssetsBuilder();
    builder.build().catch((error) => {
        console.error('Error in build-assets:', error.message);
        process.exit(1);
    });
}
