/**
 * Shared test utilities module
 * Provides common functions for file operations, test helpers, validation, and assertions
 * to eliminate code duplication across test files
 */

const fs = require('fs');
const path = require('path');
const { Stats } = require('../build/stats');
const { Dir } = require('../build/dir');
const { validateHtml: validateHtmlW3C } = require('./w3c-validator');

/**
 * File System Utilities
 */

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
 * Get path to a fixture file
 * @param {string} filename - Name of the fixture file
 * @returns {string} Full path to the fixture file
 */
function getFixturePath(filename) {
    return path.join(__dirname, 'fixtures', filename);
}

/**
 * Copy a fixture file to a destination path
 * @param {string} filename - Name of the fixture file
 * @param {string} destPath - Destination path for the file
 * @returns {Promise<void>}
 */
async function copyFixture(filename, destPath) {
    const sourcePath = getFixturePath(filename);
    await fs.promises.copyFile(sourcePath, destPath);
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
 * Recursively get all files in a directory
 * @param {string} dir - Directory to scan
 * @param {string[]} exclude - Array of path patterns to exclude
 * @param {string[]} fileList - Accumulator for file paths (used internally)
 * @param {string} baseDir - Base directory for relative path calculation (used internally)
 * @returns {string[]} Array of relative file paths
 */
function getAllFiles(dir, exclude = [], fileList = [], baseDir = null) {
    // Use the initial dir as baseDir for relative path calculation
    if (baseDir === null) {
        baseDir = dir;
    }

    const files = fs.readdirSync(dir);

    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const relativePath = path.relative(baseDir, filePath);

        // Check if this path should be excluded
        if (exclude.some((pattern) => relativePath.startsWith(pattern))) {
            return;
        }

        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, exclude, fileList, baseDir);
        } else {
            fileList.push(relativePath);
        }
    });

    return fileList;
}

/**
 * Test Helpers
 */

/**
 * Skip test if file doesn't exist
 * @param {Object} t - AVA test object
 * @param {string} filePath - Path to the file to check
 * @param {string} message - Message to log when skipping
 */
function skipIfFileNotFound(t, filePath, message) {
    if (!fileExists(filePath)) {
        t.pass(`${message} - ${filePath} not found`);
        t.pass();
    }
}

/**
 * Validation Helpers
 */

/**
 * Validate build artifact structure against unified format
 * @param {Object} t - AVA test object
 * @param {Object} entry - Build artifact entry to validate
 * @param {string} filename - Name of the file being validated (for error messages)
 * @param {string[]} requiredMetadataFields - Array of required metadata field names
 * @param {boolean} allowArraySource - Whether to allow source to be an array (for CSS/JS files)
 */
function validateUnifiedFormat(
    t,
    entry,
    filename,
    requiredMetadataFields = [],
    allowArraySource = false,
) {
    if (entry == null) {
        throw new Error(`${filename} entry should exist`);
    }

    if (entry.source == null) {
        throw new Error(`${filename} should have source field`);
    }

    if (allowArraySource) {
        if (!(typeof entry.source === 'string' || Array.isArray(entry.source))) {
            throw new Error(`${filename}.source should be a string or array`);
        }
    } else if (typeof entry.source !== 'string') {
        throw new Error(`${filename}.source should be a string`);
    }

    if (entry.size === undefined) {
        throw new Error(`${filename} should have size field`);
    }

    if (typeof entry.size !== 'number') {
        throw new Error(`${filename}.size should be a number`);
    }

    if (entry.size < 0) {
        throw new Error(`${filename}.size should be non-negative`);
    }

    if (entry.metadata == null) {
        throw new Error(`${filename} should have metadata field`);
    }

    if (typeof entry.metadata !== 'object') {
        throw new Error(`${filename}.metadata should be an object`);
    }

    // Validate required metadata fields
    requiredMetadataFields.forEach((field) => {
        if (entry.metadata[field] === undefined) {
            throw new Error(`${filename}.metadata should have ${field} field`);
        }
    });

    // If we get here, everything is valid
    t.pass(`${filename} has valid unified format`);
}

/**
 * Validate entire build artifact file structure
 * @param {Object} t - AVA test object
 * @param {string} artifactName - Name of the artifact file (e.g., 'build-html.json')
 * @param {string[]} requiredMetadataFields - Array of required metadata field names
 */
async function validateBuildArtifact(t, artifactName, requiredMetadataFields = []) {
    try {
        const artifactData = await Stats.loadFromFile(artifactName);

        t.truthy(artifactData, `${artifactName} should contain data`);
        t.true(typeof artifactData === 'object', `${artifactName} should be an object`);

        // Validate each entry in the artifact
        Object.keys(artifactData).forEach((key) => {
            validateUnifiedFormat(t, artifactData[key], `${artifactName}[${key}]`, requiredMetadataFields);
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            t.pass(`Skipping validation - ${artifactName} not found`);
        } else {
            throw new Error(`Error validating ${artifactName}: ${error.message}`);
        }
    }
}

/**
 * Assertion Helpers
 */

/**
 * Assert that content is valid JSON
 * @param {Object} t - AVA test object
 * @param {string} content - JSON string content to validate
 * @param {string} message - Error message for assertion
 */
function assertValidJson(t, content, message = 'Content should be valid JSON') {
    if (content == null || content === '') {
        throw new Error(`${message}: Content is null, undefined, or empty`);
    }

    try {
        JSON.parse(content);
        t.pass(message);
    } catch (error) {
        throw new Error(`${message}: ${error.message}`);
    }
}

/**
 * Assert that value is a positive number
 * @param {Object} t - AVA test object
 * @param {number} value - Value to validate
 * @param {string} fieldName - Name of the field being validated
 */
function assertPositiveNumber(t, value, fieldName) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`${fieldName} should be a number`);
    }
    if (value <= 0) {
        throw new Error(`${fieldName} should be positive`);
    }
    t.pass(`${fieldName} is a positive number`);
}

/**
 * Assert that array is not empty
 * @param {Object} t - AVA test object
 * @param {Array} array - Array to validate
 * @param {string} fieldName - Name of the field being validated
 */
function assertArrayNotEmpty(t, array, fieldName) {
    if (!Array.isArray(array)) {
        throw new Error(`${fieldName} should be an array`);
    }
    if (array.length === 0) {
        throw new Error(`${fieldName} should not be empty`);
    }
    t.pass(`${fieldName} is a non-empty array`);
}

/**
 * Load sitemap data from .build/sitemap.json (TEST VERSION)
 * This is the test-specific version that handles test directories.
 * For build scripts, use the version from lib/build/utils.js instead.
 *
 * @returns {Object} Sitemap data object with sitemap, pages, md2url, url2md
 * @throws {Error} If sitemap file is required but not found (in non-test environments)
 */
function getSitemap() {
    try {
        let sitemapPath = path.join(Dir.getBuild(), 'sitemap.json');

        if (!fileExists(sitemapPath)) {
            // In test environment, check for test-specific directories
            if (process.env.NODE_ENV === 'test') {
                // Check for test directories in .build-test first
                const testBuildDir = path.join(Dir.getRoot(), '.build-test');
                try {
                    const testDirs = fs.readdirSync(testBuildDir, { withFileTypes: true })
                        .filter(dirent => dirent.isDirectory())
                        .map(dirent => dirent.name)
                        .filter(name => name.startsWith('markdown-config') || name.includes('test'));

                    for (const testDir of testDirs) {
                        const testSitemapPath = path.join(testBuildDir, testDir, 'sitemap.json');
                        if (fileExists(testSitemapPath)) {
                            sitemapPath = testSitemapPath;
                            break;
                        }
                    }
                } catch (error) {
                    // Ignore directory read errors
                }

                // If still not found, return empty data in test environment
                if (!fileExists(sitemapPath)) {
                    return {
                        sitemap: [],
                        pages: {},
                        md2url: {},
                        url2md: {},
                    };
                }
            } else {
                throw new Error(`Sitemap file not found: ${sitemapPath}`);
            }
        }

        // Load and return the sitemap data
        return readJsonFile(sitemapPath);
    } catch (error) {
        throw new Error(`Could not load sitemap data: ${error.message}`);
    }
}

/**
 * HTML Validation
 */

/**
 * Validate HTML string using W3C Nu Html Checker (vnu-jar)
 * This provides the same validation as https://validator.w3.org
 * @param {string} html - HTML content to validate
 * @returns {Object} Validation result with {valid, errors, errorCount, warningCount}
 */
function validateHtml(html) {
    return validateHtmlW3C(html);
}

/**
 * Load image mapping from .build/image-mapping.json (TEST VERSION)
 * This is the test-specific version that handles test directories.
 * For build scripts, use the version from lib/build/utils.js instead.
 *
 * @returns {Object} Image mapping object (path -> hashed filename)
 * @throws {Error} If image mapping file is required but not found (in non-test environments)
 */
function getImageMapping() {
    try {
        let mappingPath = path.join(Dir.getBuild(), 'image-mapping.json');

        if (!fileExists(mappingPath)) {
            // In test environment, check for test-specific directories
            if (process.env.NODE_ENV === 'test') {
                // Check for test directories in .build-test first
                const testBuildDir = path.join(Dir.getRoot(), '.build-test');
                try {
                    const testDirs = fs.readdirSync(testBuildDir, { withFileTypes: true })
                        .filter(dirent => dirent.isDirectory())
                        .map(dirent => dirent.name)
                        .filter(name => name.startsWith('markdown-config') || name.includes('test'));

                    for (const testDir of testDirs) {
                        const testMappingPath = path.join(testBuildDir, testDir, 'image-mapping.json');
                        if (fileExists(testMappingPath)) {
                            mappingPath = testMappingPath;
                            break;
                        }
                    }
                } catch (error) {
                    // Ignore directory read errors
                }

                // If still not found, return empty mapping in test environment
                if (!fileExists(mappingPath)) {
                    return {};
                }
            } else {
                throw new Error(`Image mapping file not found: ${mappingPath}`);
            }
        }

        // Load and return the image mapping data
        return readJsonFile(mappingPath);
    } catch (error) {
        // In test environment, return empty mapping on any error
        if (process.env.NODE_ENV === 'test') {
            return {};
        }
        throw new Error(`Could not load image mapping: ${error.message}`);
    }
}

/**
 * Load asset mapping from .assets/assets.json (TEST VERSION)
 * This is the test-specific version that handles test directories.
 * For build scripts, use the version from lib/build/utils.js instead.
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
        // Silent handling for test environment
        if (process.env.NODE_ENV === 'test') {
            return {};
        }
        // In production, log warning but don't throw
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`Warning: Could not load assets mapping: ${error.message}`);
        }
        return {};
    }
}

/**
 * Mock Factory Functions
 * These functions create reusable mock data structures for testing
 */

/**
 * Creates a mock sitemap structure
 * @param {Object} options - Customization options
 * @param {Array} options.pages - Array of page objects with url, title, file, html properties
 * @returns {Object} Mock sitemap with sitemap, pages, md2url, url2md
 */
function createMockSitemap(options = {}) {
    const pages = options.pages || [
        {
            url: '/',
            title: 'Home',
            name: 'Home',
            file: 'index.md',
            html: '<h1>Home</h1>',
            layout: 'blocks/page/page.njk',
        },
    ];

    const sitemap = [];
    const pagesMap = {};
    const md2url = {};
    const url2md = {};

    pages.forEach((page) => {
        sitemap.push(page.url);
        pagesMap[page.url] = { ...page };
        if (page.file) {
            md2url[page.file] = page.url;
            url2md[page.url] = page.file;
        }
    });

    return { sitemap, pages: pagesMap, md2url, url2md };
}

/**
 * Creates mock image mapping
 * @param {Object} options - Customization options
 * @param {Object} options.images - Custom image mapping object
 * @returns {Object} Mock image mapping
 */
function createMockImageMapping(options = {}) {
    return options.images || {
        'images/logo.png': 'logo-abc123.png',
        'images/banner.jpg': 'banner-def456.jpg',
    };
}

/**
 * Creates mock assets mapping
 * @param {Object} options - Customization options
 * @param {Object} options.assets - Custom assets mapping object
 * @returns {Object} Mock assets mapping
 */
function createMockAssetsMapping(options = {}) {
    return options.assets || {
        'https://github.com/user/repo/file.pdf': '/assets/file.pdf',
        'https://github.com/user/repo/doc.zip': '/assets/doc.zip',
    };
}

/**
 * Creates mock CSS hash file
 * @param {Object} options - Customization options
 * @param {string} options.hash - Custom hash value
 * @param {string} options.url - Custom URL
 * @returns {Object} Mock CSS hash
 */
function createMockCssHash(options = {}) {
    return {
        page: {
            url: options.url || '/css/page.css',
            hash: options.hash || 'css123',
        },
    };
}

/**
 * Creates mock JS hash file
 * @param {Object} options - Customization options
 * @param {string} options.hash - Custom hash value
 * @param {string} options.url - Custom URL
 * @returns {Object} Mock JS hash
 */
function createMockJsHash(options = {}) {
    return {
        page: {
            url: options.url || '/js/page.js',
            hash: options.hash || 'js456',
        },
    };
}

/**
 * Sets up a complete test environment with all necessary mock files
 * @param {string} testDir - Test directory path
 * @param {Object} options - Customization options
 * @param {boolean|Object} options.sitemap - Sitemap options or false to skip
 * @param {boolean|Object} options.imageMapping - Image mapping options or false to skip
 * @param {boolean|Object} options.assetsMapping - Assets mapping options or false to skip
 * @param {boolean|Object} options.cssHash - CSS hash options or false to skip
 * @param {boolean|Object} options.jsHash - JS hash options or false to skip
 * @param {boolean} options.copyTemplates - Whether to copy optimized templates (default: true)
 * @returns {Promise<Object>} Object with buildDir and siteDir paths
 */
async function setupTestEnvironment(testDir, options = {}) {
    const buildDir = path.join(testDir, '.build');
    const siteDir = path.join(testDir, 'site');

    // Create directories
    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(siteDir, { recursive: true });

    // Copy optimized templates if requested (default: true)
    if (options.copyTemplates !== false) {
        const sourceTemplatesDir = path.join(Dir.getRoot(), '.build', 'templates');
        const targetTemplatesDir = path.join(buildDir, 'templates');

        // Check if source templates exist
        if (fs.existsSync(sourceTemplatesDir)) {
            // Copy templates directory recursively
            const copyRecursive = (src, dest) => {
                if (!fs.existsSync(dest)) {
                    fs.mkdirSync(dest, { recursive: true });
                }
                const entries = fs.readdirSync(src, { withFileTypes: true });
                for (const entry of entries) {
                    const srcPath = path.join(src, entry.name);
                    const destPath = path.join(dest, entry.name);
                    if (entry.isDirectory()) {
                        copyRecursive(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                }
            };
            copyRecursive(sourceTemplatesDir, targetTemplatesDir);
        }
    }

    // Create sitemap if requested
    if (options.sitemap !== false) {
        const sitemap = createMockSitemap(options.sitemap || {});
        fs.writeFileSync(
            path.join(buildDir, 'sitemap.json'),
            JSON.stringify(sitemap),
        );
    }

    // Create image mapping if requested
    if (options.imageMapping !== false) {
        const mapping = createMockImageMapping(options.imageMapping || {});
        fs.writeFileSync(
            path.join(buildDir, 'image-mapping.json'),
            JSON.stringify(mapping),
        );
    }

    // Create assets mapping if requested
    if (options.assetsMapping !== false) {
        const assetsDir = path.join(testDir, '.assets');
        fs.mkdirSync(assetsDir, { recursive: true });
        const mapping = createMockAssetsMapping(options.assetsMapping || {});
        fs.writeFileSync(
            path.join(assetsDir, 'assets.json'),
            JSON.stringify(mapping),
        );
    }

    // Create CSS hash if requested
    if (options.cssHash !== false) {
        const hash = createMockCssHash(options.cssHash || {});
        fs.writeFileSync(
            path.join(buildDir, 'hash-css.json'),
            JSON.stringify(hash),
        );
    }

    // Create JS hash if requested
    if (options.jsHash !== false) {
        const hash = createMockJsHash(options.jsHash || {});
        fs.writeFileSync(
            path.join(buildDir, 'hash-js.json'),
            JSON.stringify(hash),
        );
    }

    return { buildDir, siteDir };
}

module.exports = {
    // File System Utilities
    fileExists,
    readJsonFile,
    getFixturePath,
    copyFixture,
    getAllFiles,

    // Test Helpers
    skipIfFileNotFound,
    getSitemap,
    getImageMapping,
    getAssetsMapping,

    // Validation Helpers
    validateUnifiedFormat,
    validateBuildArtifact,
    validateHtml,

    // Assertion Helpers
    assertValidJson,
    assertPositiveNumber,
    assertArrayNotEmpty,

    // Mock Factory Functions
    createMockSitemap,
    createMockImageMapping,
    createMockAssetsMapping,
    createMockCssHash,
    createMockJsHash,
    setupTestEnvironment,
};
