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
 * Load asset mapping from .assets/assets.json
 * This function reads fresh data from disk on each call (no caching).
 *
 * @returns {Object} Asset mapping object (GitHub URL -> local URL)
 */
function getAssetsMapping() {
    try {
        const projectRoot = Dir.getRoot();
        const assetsPath = path.join(projectRoot, '.assets', 'assets.json');

        if (!fileExists(assetsPath)) {
            // Assets file might not exist for all projects
            return {};
        }

        const content = fs.readFileSync(assetsPath, 'utf8').trim();
        if (!content) {
            // Empty file is OK, just no assets
            return {};
        }

        return JSON.parse(content);
    } catch (error) {
        // During tests, don't output to console - tests must be silent
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`Warning: Could not load assets mapping: ${error.message}`);
        }
        return {};
    }
}

module.exports = {
    fileExists,
    readJsonFile,
    getSitemap,
    getImageMapping,
    getAssetsMapping,
};
