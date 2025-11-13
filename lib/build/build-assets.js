/**
 * Build Script: Assets Processing
 *
 * Responsibilities:
 * - Copy PDF and ZIP files from external repositories
 * - Generate assets.json mapping file
 * - Copy assets to site directory
 * - Copy configuration files (robots.txt, .htaccess, etc.)
 * - Track build statistics
 *
 * Dependencies: None (uses Node.js built-ins)
 * Output: site/*.pdf, site/*.zip, site/robots.txt, site/.htaccess, .assets/assets.json, .build/build-assets.json
 *
 * @module build/build-assets
 */

const fs = require('fs').promises;
const path = require('path');
const { Dir } = require('./dir');
const { Stats } = require('./stats');

/**
 * Assets Build Script
 *
 * Processes external asset files and configuration files for deployment
 * - Uses .assets/ for processing workspace
 * - Outputs final assets to site/ directory
 * - Never modifies source files
 */
class AssetsBuilder {
    constructor(options = {}) {
        this.options = options;
        this.projectRoot = Dir.getRoot();
        this.siteDir = Dir.getSite();
        this.ASSETS_DIR = path.resolve(this.projectRoot, '.assets');
        this.ASSETS_JSON_PATH = path.join(this.ASSETS_DIR, 'assets.json');
        this.CONFIG_DIR = path.resolve(this.projectRoot, 'config');

        this.SOURCE_REPOS = [
            {
                name: 'voyahchat-install',
                path: path.resolve(this.projectRoot, 'external/voyahchat-install'),
                baseUrl: 'https://github.com/voyahchat/voyahchat-install/raw/refs/heads/main',
            },
            {
                name: 'voyahchat-docs',
                path: path.resolve(this.projectRoot, 'external/voyahchat-docs'),
                baseUrl: 'https://github.com/voyahchat/voyahchat-docs/raw/refs/heads/main',
            },
        ];
    }

    /**
     * Validate that all assets in the JSON mapping exist in the assets directory
     * @param {Object} assetsJson - Assets mapping object
     * @returns {Promise<string[]>} Array of missing asset filenames
     */
    async validateAssetsExist(assetsJson) {
        const missingAssets = [];

        for (const localPath of Object.values(assetsJson)) {
            const fileName = path.basename(localPath);
            const assetPath = path.join(this.ASSETS_DIR, fileName);

            try {
                await fs.access(assetPath);
            } catch {
                missingAssets.push(fileName);
            }
        }

        return missingAssets;
    }

    /**
     * Copy assets from external repositories to assets directory
     * @returns {Promise<Object>} Asset mapping object {sourceUrl: localPath}
     */
    async copyAssets() {
        const assetMap = {};

        for (const repo of this.SOURCE_REPOS) {
            try {
                await fs.access(repo.path);
            } catch {
                throw new Error(`Source directory not found: ${repo.path}`);
            }

            const files = await fs.readdir(repo.path);
            const assetFiles = files.filter((file) => file.endsWith('.pdf') || file.endsWith('.zip'));

            for (const file of assetFiles) {
                const sourcePath = path.join(repo.path, file);
                const destPath = path.join(this.ASSETS_DIR, file);
                const fullSourceUrl = `${repo.baseUrl}/${file}`;
                const localUrl = `/${file}`;

                await fs.copyFile(sourcePath, destPath);
                assetMap[fullSourceUrl] = localUrl;
            }
        }

        return assetMap;
    }

    /**
     * Generate assets.json mapping file
     * @param {Object} assetMap - Asset mapping object
     * @returns {Promise<void>}
     */
    async generateAssetsJson(assetMap) {
        const content = JSON.stringify(assetMap, null, 4);
        await fs.writeFile(this.ASSETS_JSON_PATH, content, 'utf8');
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
     * @returns {Promise<Stats>} Statistics collector instance
     */
    async copyConfigFiles() {
        await Dir.ensure(this.siteDir);

        // Load existing stats to merge with config files
        let existingStats = {};
        try {
            existingStats = await Stats.loadFromFile('build-assets.json');
        } catch (error) {
            // File doesn't exist, start with empty stats
        }

        const stats = new Stats('build-assets.json');
        stats.stats = existingStats; // Load existing data

        // List of static config files to copy
        const configFiles = ['robots.txt', '.htaccess'];

        for (const filename of configFiles) {
            await this.copyStaticConfigFile(filename, stats);
        }

        // Save statistics using collector (only if not skipWrite)
        if (!this.options.skipWrite) {
            await stats.save();
        }

        return stats;
    }

    /**
     * Copy processed assets to site directory
     * @param {Object} assetsJson - Assets mapping object
     * @returns {Promise<Stats>} Statistics collector instance
     */
    async copyAssetsToSite(assetsJson) {
        await Dir.ensure(this.siteDir);
        const stats = new Stats('build-assets.json');

        for (const [sourceUrl, localPath] of Object.entries(assetsJson)) {
            const fileName = path.basename(localPath);
            const sourcePath = path.join(this.ASSETS_DIR, fileName);
            const destPath = path.join(this.siteDir, fileName);

            if (!this.options.skipWrite) {
                await fs.copyFile(sourcePath, destPath);
            }

            // Collect statistics for this file
            const fileStats = await fs.stat(sourcePath);
            const ext = path.extname(fileName).substring(1); // Remove leading dot

            // Find the original source file path
            let originalSourcePath = null;

            for (const repo of this.SOURCE_REPOS) {
                const repoFilePath = path.join(repo.path, fileName);

                try {
                    await fs.access(repoFilePath);
                    originalSourcePath = path.relative(this.projectRoot, repoFilePath);
                    break;
                } catch {
                    // File not found in this repo, continue
                }
            }

            stats.add(
                fileName,
                originalSourcePath || path.relative(this.projectRoot, sourcePath),
                fileStats.size,
                {
                    url: localPath,
                    sourceUrl,
                    type: ext,
                },
            );
        }

        // Save statistics using collector (only if not skipWrite)
        if (!this.options.skipWrite) {
            await stats.save();
        }

        return stats;
    }

    /**
     * Build assets with the current options
     * @returns {Promise<Object>} Build result with statistics
     */
    async build() {
        await Dir.ensure(this.ASSETS_DIR);

        let assetsJson = null;
        let needsInitialBuild = false;

        try {
            const content = await fs.readFile(this.ASSETS_JSON_PATH, 'utf8');
            assetsJson = JSON.parse(content);

            const missingAssets = await this.validateAssetsExist(assetsJson);

            if (missingAssets.length > 0) {
                // Silent for tests - console.error(`Missing assets: ${missingAssets.join(', ')}`);
                needsInitialBuild = true;
            }
        } catch {
            needsInitialBuild = true;
        }

        if (needsInitialBuild) {
            const assetMap = await this.copyAssets();
            await this.generateAssetsJson(assetMap);
            assetsJson = assetMap;
        }

        // Copy assets from external repos
        await this.copyAssetsToSite(assetsJson);

        // Copy config files (robots.txt, .htaccess, etc.)
        const configStats = await this.copyConfigFiles();

        // Count how many config files were actually copied
        const configFilesCount = Object.keys(configStats.stats).filter(
            key => key === 'robots.txt' || key === '.htaccess',
        ).length;

        // Return summary for benchmarking
        return {
            assetsProcessed: Object.keys(assetsJson || {}).length,
            configFilesProcessed: configFilesCount,
            totalFiles: Object.keys(assetsJson || {}).length + configFilesCount,
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
