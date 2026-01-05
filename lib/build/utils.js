/**
 * Build utilities module
 * Provides common functions for loading build artifacts
 * Used by build scripts to access sitemap, image mapping, and assets mapping
 *
 * @module build/utils
 */

const fs = require('fs');
const path = require('path');
const { Dir } = require('./dir');

/**
 * Check if file exists synchronously
 * @param {string} filePath - Path to the file to check
 * @returns {boolean} True if file exists, false otherwise
 */
function fileExists(filePath) {
    try {
        fs.accessSync(filePath);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Read and parse JSON file with error handling
 * @param {string} filePath - Path to the JSON file
 * @returns {Object} Parsed JSON object
 * @throws {Error} If file doesn't exist or contains invalid JSON
 */
function readJsonFile(filePath) {
    if (!fileExists(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Invalid JSON in file: ${filePath}`);
        }
        throw error;
    }
}

/**
 * Load sitemap data from .build/sitemap.json
 * This function reads fresh data from disk on each call (no caching).
 *
 * @returns {Object} Sitemap data object with sitemap, pages, md2url, url2md
 * @throws {Error} If sitemap file is not found
 */
function getSitemap() {
    const sitemapPath = path.join(Dir.getBuild(), 'sitemap.json');

    if (!fileExists(sitemapPath)) {
        throw new Error(`Sitemap file not found: ${sitemapPath}`);
    }

    return readJsonFile(sitemapPath);
}

/**
 * Load image mapping from .build/image-mapping.json
 * This function reads fresh data from disk on each call (no caching).
 *
 * @returns {Object} Image mapping object (path -> hashed filename)
 * @throws {Error} If image mapping file is not found
 */
function getImageMapping() {
    const mappingPath = path.join(Dir.getBuild(), 'image-mapping.json');

    if (!fileExists(mappingPath)) {
        throw new Error(`Image mapping file not found: ${mappingPath}`);
    }

    return readJsonFile(mappingPath);
}


/**
 * Extract repository name from Git URL
 * @param {string} repoUrl - Git repository URL
 * @returns {string} Repository name
 * @example
 * getRepoName('git@github.com:voyahchat/voyahchat-content.git') // 'voyahchat-content'
 * getRepoName('https://github.com/voyahchat/voyahchat-content.git') // 'voyahchat-content'
 */
function getRepoName(repoUrl) {
    const match = repoUrl.match(/([^/:]+)\.git$/);
    if (!match) {
        throw new Error(`Could not parse repository name from URL: ${repoUrl}`);
    }
    return match[1];
}

/**
 * Load external repository paths from config
 * @returns {string[]} Array of absolute paths to external repositories
 */
function loadExternalRepos() {
    try {
        const configPath = path.join(Dir.getRoot(), 'config', 'external.json');
        const repoUrls = readJsonFile(configPath);
        const externalDir = path.join(Dir.getRoot(), 'external');

        return repoUrls.map(repoUrl => {
            const repoName = getRepoName(repoUrl);
            return path.join(externalDir, repoName);
        });
    } catch (error) {
        // If config doesn't exist, return empty array
        return [];
    }
}

/**
 * Load BEM declaration file
 * @param {string} bundle - Bundle name (e.g., 'page', 'page-index')
 * @param {Object} dir - Directory utility (defaults to Dir)
 * @returns {string[]} Array of block names
 */
function loadBemDeclaration(bundle, dir = Dir) {
    const levels = require('../../config/levels.json');
    const blocksLevel = levels.find((level) => level === 'blocks') || levels[levels.length - 1];
    const projectRoot = dir.getRoot();
    const bemdeclPath = path.resolve(
        projectRoot,
        blocksLevel,
        bundle,
        `${bundle}.bemdecl.js`,
    );

    try {
        // Clear require cache to ensure fresh load
        delete require.cache[require.resolve(bemdeclPath)];
        return require(bemdeclPath);
    } catch (error) {
        // Only show warning in non-test environment
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`Warning: Could not load BEM declaration from ${bemdeclPath}: ${error.message}`);
        }
        return [];
    }
}

/**
 * Get template files for BEM blocks
 * @param {string[]} blocks - Array of block names
 * @param {Object} dir - Directory utility (defaults to Dir)
 * @returns {string[]} Array of template file paths
 */
function getTemplateFilesForBlocks(blocks, dir = Dir) {
    const templateFiles = [];
    const projectRoot = dir.getRoot();

    for (const block of blocks) {
        // Try to find .njk file for this block
        const blockTemplate = path.join(projectRoot, 'blocks', block, `${block}.njk`);
        if (fs.existsSync(blockTemplate)) {
            templateFiles.push(blockTemplate);
        }

        // Also check external blocks
        const externalBlockTemplate = path.join(
            projectRoot,
            'external',
            'adaptive-layout',
            'blocks',
            block,
            `${block}.njk`,
        );
        if (fs.existsSync(externalBlockTemplate)) {
            templateFiles.push(externalBlockTemplate);
        }
    }

    return templateFiles;
}

module.exports = {
    fileExists,
    readJsonFile,
    getSitemap,
    getImageMapping,
    getRepoName,
    loadExternalRepos,
    loadBemDeclaration,
    getTemplateFilesForBlocks,
};
