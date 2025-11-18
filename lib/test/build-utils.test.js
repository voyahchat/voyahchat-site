/**
 * AVA tests for build utilities (lib/build/utils.js)
 * Tests the 5 core utility functions used throughout the build system
 */

const test = require('ava');
const path = require('path');
const fs = require('fs');
const { Dir } = require('../build/dir');
const { TestDir } = require('./test-dir');
const { cleanupTestDir } = require('./utils');

// Import functions from build/utils.js (BUILD utilities - NOT test utilities)
const {
    fileExists,
    readJsonFile,
    getSitemap,
    getImageMapping,
    getAssetsMapping,
} = require('../build/utils');

// Import mock factory functions
const {
    createMockSitemap,
    createMockImageMapping,
    createMockAssetsMapping,
} = require('./utils');

/**
 * Tests for fileExists()
 */

test('fileExists() - returns true for existing file', (t) => {
    // Arrange
    const dir = new TestDir();
    const testFile = path.join(dir.getRoot(), 'test-file.txt');

    // Create test file
    fs.mkdirSync(dir.getRoot(), { recursive: true });
    fs.writeFileSync(testFile, 'test content');

    try {
        // Act
        const result = fileExists(testFile);

        // Assert
        t.true(result, 'Should return true for existing file');
    } finally {
        // Cleanup
        cleanupTestDir(dir);
    }
});

test('fileExists() - returns false for non-existing file', (t) => {
    // Arrange
    const dir = new TestDir();
    const nonExistentFile = path.join(dir.getRoot(), 'non-existent-file.txt');

    try {
        // Act
        const result = fileExists(nonExistentFile);

        // Assert
        t.false(result, 'Should return false for non-existing file');
    } finally {
        // Cleanup
        cleanupTestDir(dir);
    }
});

test('fileExists() - handles directory paths correctly', (t) => {
    // Arrange
    const dir = new TestDir();

    // Create directory
    fs.mkdirSync(dir.getRoot(), { recursive: true });

    try {
        // Act
        const result = fileExists(dir.getRoot());

        // Assert
        t.true(result, 'Should return true for existing directory');
    } finally {
        // Cleanup
        cleanupTestDir(dir);
    }
});

/**
 * Tests for readJsonFile()
 */

test('readJsonFile() - successfully reads valid JSON', (t) => {
    // Arrange
    const dir = new TestDir();
    const jsonFile = path.join(dir.getRoot(), 'valid.json');
    const testData = { key: 'value', number: 42, array: [1, 2, 3] };

    fs.mkdirSync(dir.getRoot(), { recursive: true });
    fs.writeFileSync(jsonFile, JSON.stringify(testData));

    try {
        // Act
        const result = readJsonFile(jsonFile);

        // Assert
        t.deepEqual(result, testData, 'Should parse JSON correctly');
    } finally {
        // Cleanup
        cleanupTestDir(dir);
    }
});

test('readJsonFile() - throws error on corrupted JSON', (t) => {
    // Arrange
    const dir = new TestDir();
    const corruptedFile = path.join(dir.getRoot(), 'corrupted.json');

    fs.mkdirSync(dir.getRoot(), { recursive: true });
    fs.writeFileSync(corruptedFile, '{ invalid json content }');

    try {
        // Act & Assert
        const error = t.throws(() => {
            readJsonFile(corruptedFile);
        }, {
            instanceOf: Error,
            message: /Invalid JSON/,
        });

        t.truthy(error.message);
    } finally {
        // Cleanup
        cleanupTestDir(dir);
    }
});

test('readJsonFile() - throws error on missing file', (t) => {
    // Arrange
    const dir = new TestDir();
    const missingFile = path.join(dir.getRoot(), 'missing.json');

    try {
        // Act & Assert
        const error = t.throws(() => {
            readJsonFile(missingFile);
        }, {
            instanceOf: Error,
            message: /File not found/,
        });

        t.truthy(error.message);
    } finally {
        // Cleanup
        cleanupTestDir(dir);
    }
});

/**
 * Tests for getSitemap()
 */

test('getSitemap() - successfully loads valid sitemap', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const sitemapPath = path.join(buildDir, 'sitemap.json');

    const validSitemap = createMockSitemap({
        pages: [
            { url: '/', title: 'Home', name: 'Home', file: 'index.md' },
            { url: '/about', title: 'About', name: 'About', file: 'about.md' },
        ],
    });

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sitemapPath, JSON.stringify(validSitemap));

    // Temporarily override Dir.getBuild() to use test directory
    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        // Act
        const result = getSitemap();

        // Assert
        t.truthy(result, 'Should return sitemap data');
        t.true(Array.isArray(result.sitemap), 'Should have sitemap array');
        t.is(typeof result.pages, 'object', 'Should have pages object');
        t.is(typeof result.md2url, 'object', 'Should have md2url object');
        t.is(typeof result.url2md, 'object', 'Should have url2md object');
        t.deepEqual(result, validSitemap, 'Should return correct structure');
    } finally {
        // Restore and cleanup
        Dir.getBuild = originalGetBuild;
        cleanupTestDir(dir);
    }
});

test('getSitemap() - throws error when file missing', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');

    fs.mkdirSync(buildDir, { recursive: true });
    // Don't create sitemap.json

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        // Act & Assert
        const error = t.throws(() => {
            getSitemap();
        }, {
            instanceOf: Error,
            message: /Sitemap file not found/,
        });

        t.truthy(error.message);
    } finally {
        // Restore and cleanup
        Dir.getBuild = originalGetBuild;
        cleanupTestDir(dir);
    }
});

test('getSitemap() - throws error on corrupted JSON', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const sitemapPath = path.join(buildDir, 'sitemap.json');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sitemapPath, '{ corrupted json }');

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        // Act & Assert
        const error = t.throws(() => {
            getSitemap();
        }, {
            instanceOf: Error,
            message: /Invalid JSON/,
        });

        t.truthy(error.message);
    } finally {
        // Restore and cleanup
        Dir.getBuild = originalGetBuild;
        cleanupTestDir(dir);
    }
});

test('getSitemap() - returns correct structure with all required fields', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const sitemapPath = path.join(buildDir, 'sitemap.json');

    const validSitemap = createMockSitemap({ pages: [] });

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sitemapPath, JSON.stringify(validSitemap));

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        // Act
        const result = getSitemap();

        // Assert
        t.truthy(result.sitemap, 'Should have sitemap field');
        t.truthy(result.pages, 'Should have pages field');
        t.truthy(result.md2url, 'Should have md2url field');
        t.truthy(result.url2md, 'Should have url2md field');
    } finally {
        // Restore and cleanup
        Dir.getBuild = originalGetBuild;
        cleanupTestDir(dir);
    }
});

/**
 * Tests for getImageMapping()
 */

test('getImageMapping() - successfully loads valid mapping', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const mappingPath = path.join(buildDir, 'image-mapping.json');

    const validMapping = createMockImageMapping();

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mappingPath, JSON.stringify(validMapping));

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        // Act
        const result = getImageMapping();

        // Assert
        t.truthy(result, 'Should return mapping data');
        t.is(typeof result, 'object', 'Should be an object');
        t.deepEqual(result, validMapping, 'Should return correct mapping');
    } finally {
        // Restore and cleanup
        Dir.getBuild = originalGetBuild;
        cleanupTestDir(dir);
    }
});

test('getImageMapping() - throws error when file missing', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');

    fs.mkdirSync(buildDir, { recursive: true });
    // Don't create image-mapping.json

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        // Act & Assert
        const error = t.throws(() => {
            getImageMapping();
        }, {
            instanceOf: Error,
            message: /Image mapping file not found/,
        });

        t.truthy(error.message);
    } finally {
        // Restore and cleanup
        Dir.getBuild = originalGetBuild;
        cleanupTestDir(dir);
    }
});

test('getImageMapping() - throws error on corrupted JSON', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const mappingPath = path.join(buildDir, 'image-mapping.json');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mappingPath, '{ invalid: json }');

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        // Act & Assert
        const error = t.throws(() => {
            getImageMapping();
        }, {
            instanceOf: Error,
            message: /Invalid JSON/,
        });

        t.truthy(error.message);
    } finally {
        // Restore and cleanup
        Dir.getBuild = originalGetBuild;
        cleanupTestDir(dir);
    }
});

test('getImageMapping() - returns correct structure', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const mappingPath = path.join(buildDir, 'image-mapping.json');

    const emptyMapping = {};

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mappingPath, JSON.stringify(emptyMapping));

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        // Act
        const result = getImageMapping();

        // Assert
        t.is(typeof result, 'object', 'Should return an object');
        t.deepEqual(result, emptyMapping, 'Should handle empty mapping');
    } finally {
        // Restore and cleanup
        Dir.getBuild = originalGetBuild;
        cleanupTestDir(dir);
    }
});

/**
 * Tests for getAssetsMapping()
 */

test('getAssetsMapping() - successfully loads valid assets', (t) => {
    // Arrange
    const dir = new TestDir();
    const assetsDir = path.join(dir.getRoot(), '.assets');
    const assetsPath = path.join(assetsDir, 'assets.json');

    const validAssets = createMockAssetsMapping();

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetsPath, JSON.stringify(validAssets));

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => dir.getRoot();

    try {
        // Act
        const result = getAssetsMapping();

        // Assert
        t.truthy(result, 'Should return assets data');
        t.is(typeof result, 'object', 'Should be an object');
        t.deepEqual(result, validAssets, 'Should return correct assets');
    } finally {
        // Restore and cleanup
        Dir.getRoot = originalGetRoot;
        cleanupTestDir(dir);
    }
});

test('getAssetsMapping() - returns empty object when file missing', (t) => {
    // Arrange
    const dir = new TestDir();

    fs.mkdirSync(dir.getRoot(), { recursive: true });
    // Don't create .assets/assets.json

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => dir.getRoot();

    try {
        // Act
        const result = getAssetsMapping();

        // Assert
        t.deepEqual(result, {}, 'Should return empty object when file missing');
    } finally {
        // Restore and cleanup
        Dir.getRoot = originalGetRoot;
        cleanupTestDir(dir);
    }
});

test('getAssetsMapping() - returns empty object on corrupted JSON', (t) => {
    // Arrange
    const dir = new TestDir();
    const assetsDir = path.join(dir.getRoot(), '.assets');
    const assetsPath = path.join(assetsDir, 'assets.json');

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetsPath, '{ invalid json }');

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => dir.getRoot();

    try {
        // Act
        const result = getAssetsMapping();

        // Assert
        t.deepEqual(result, {}, 'Should return empty object for corrupted JSON');
    } finally {
        // Restore and cleanup
        Dir.getRoot = originalGetRoot;
        cleanupTestDir(dir);
    }
});

test('getAssetsMapping() - handles empty file gracefully', (t) => {
    // Arrange
    const dir = new TestDir();
    const assetsDir = path.join(dir.getRoot(), '.assets');
    const assetsPath = path.join(assetsDir, 'assets.json');

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetsPath, '');

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => dir.getRoot();

    try {
        // Act
        const result = getAssetsMapping();

        // Assert
        t.deepEqual(result, {}, 'Should return empty object for empty file');
    } finally {
        // Restore and cleanup
        Dir.getRoot = originalGetRoot;
        cleanupTestDir(dir);
    }
});

test('getAssetsMapping() - returns correct structure', (t) => {
    // Arrange
    const dir = new TestDir();
    const assetsDir = path.join(dir.getRoot(), '.assets');
    const assetsPath = path.join(assetsDir, 'assets.json');

    const emptyAssets = {};

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetsPath, JSON.stringify(emptyAssets));

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => dir.getRoot();

    try {
        // Act
        const result = getAssetsMapping();

        // Assert
        t.is(typeof result, 'object', 'Should return an object');
        t.deepEqual(result, emptyAssets, 'Should handle empty assets');
    } finally {
        // Restore and cleanup
        Dir.getRoot = originalGetRoot;
        cleanupTestDir(dir);
    }
});
