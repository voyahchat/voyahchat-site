/**
 * AVA tests for build utilities (lib/build/utils.js)
 * Tests the 5 core utility functions used throughout the build system
 */

const test = require('ava');
const path = require('path');
const fs = require('fs');
const { TestDir } = require('./test-dir');

// Import functions from build/utils.js (BUILD utilities - NOT test utilities)
const {
    fileExists,
    readJsonFile,
} = require('../build/utils');

// Import test utilities and mock factory functions
const {
    getSitemap,
    getImageMapping,
    createMockSitemap,
    createMockImageMapping,
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

    // Act
    const result = fileExists(testFile);

    // Assert
    t.true(result, 'Should return true for existing file');
});

test('fileExists() - returns false for non-existing file', (t) => {
    // Arrange
    const dir = new TestDir();
    const nonExistentFile = path.join(dir.getRoot(), 'non-existent-file.txt');

    // Act
    const result = fileExists(nonExistentFile);

    // Assert
    t.false(result, 'Should return false for non-existing file');
});

test('fileExists() - handles directory paths correctly', (t) => {
    // Arrange
    const dir = new TestDir();

    // Create directory
    fs.mkdirSync(dir.getRoot(), { recursive: true });

    // Act
    const result = fileExists(dir.getRoot());

    // Assert
    t.true(result, 'Should return true for existing directory');
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

    // Act
    const result = readJsonFile(jsonFile);

    // Assert
    t.deepEqual(result, testData, 'Should parse JSON correctly');
});

test('readJsonFile() - throws error on corrupted JSON', (t) => {
    // Arrange
    const dir = new TestDir();
    const corruptedFile = path.join(dir.getRoot(), 'corrupted.json');

    fs.mkdirSync(dir.getRoot(), { recursive: true });
    fs.writeFileSync(corruptedFile, '{ invalid json content }');

    // Act & Assert
    const error = t.throws(() => {
        readJsonFile(corruptedFile);
    }, {
        instanceOf: Error,
        message: /Invalid JSON/,
    });

    t.truthy(error.message);
});

test('readJsonFile() - throws error on missing file', (t) => {
    // Arrange
    const dir = new TestDir();
    const missingFile = path.join(dir.getRoot(), 'missing.json');

    // Act & Assert
    const error = t.throws(() => {
        readJsonFile(missingFile);
    }, {
        instanceOf: Error,
        message: /File not found/,
    });

    t.truthy(error.message);
});

/**
 * Tests for getSitemap()
 */

test('getSitemap() - successfully loads valid sitemap', (t) => {
    // Arrange
    const dir = new TestDir();
    const sitemapPath = path.join(dir.getBuild(), 'sitemap.json');

    const validSitemap = createMockSitemap({
        pages: [
            { url: '/', title: 'Home', name: 'Home', file: 'index.md' },
            { url: '/about', title: 'About', name: 'About', file: 'about.md' },
        ],
    });

    fs.writeFileSync(sitemapPath, JSON.stringify(validSitemap));

    // Act - use test utility that accepts TestDir
    const result = getSitemap(dir);

    // Assert
    t.truthy(result, 'Should return sitemap data');
    t.true(Array.isArray(result.sitemap), 'Should have sitemap array');
    t.is(typeof result.pages, 'object', 'Should have pages object');
    t.is(typeof result.md2url, 'object', 'Should have md2url object');
    t.is(typeof result.url2md, 'object', 'Should have url2md object');
    t.deepEqual(result, validSitemap, 'Should return correct structure');
});

test('getSitemap() - throws error when file missing', (t) => {
    // Arrange
    const dir = new TestDir();
    // Don't create sitemap.json

    // Act & Assert
    const error = t.throws(() => {
        getSitemap(dir);
    }, {
        instanceOf: Error,
        message: /Sitemap file not found/,
    });

    t.truthy(error.message);
});

test('getSitemap() - throws error on corrupted JSON', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const sitemapPath = path.join(buildDir, 'sitemap.json');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sitemapPath, '{ corrupted json }');

    // Act & Assert - use test utility that accepts TestDir
    const error = t.throws(() => {
        getSitemap(dir);
    }, {
        instanceOf: Error,
        message: /Invalid JSON/,
    });

    t.truthy(error.message);
});

test('getSitemap() - returns correct structure with all required fields', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const sitemapPath = path.join(buildDir, 'sitemap.json');

    const validSitemap = createMockSitemap({ pages: [] });

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sitemapPath, JSON.stringify(validSitemap));

    // Act - use test utility that accepts TestDir
    const result = getSitemap(dir);

    // Assert
    t.truthy(result.sitemap, 'Should have sitemap field');
    t.truthy(result.pages, 'Should have pages field');
    t.truthy(result.md2url, 'Should have md2url field');
    t.truthy(result.url2md, 'Should have url2md field');
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

    // Act - use test utility that accepts TestDir
    const result = getImageMapping(dir);

    // Assert
    t.truthy(result, 'Should return mapping data');
    t.is(typeof result, 'object', 'Should be an object');
    t.deepEqual(result, validMapping, 'Should return correct mapping');
});

test('getImageMapping() - throws error when file missing', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');

    fs.mkdirSync(buildDir, { recursive: true });
    // Don't create image-mapping.json

    // Act & Assert - use test utility that accepts TestDir
    const error = t.throws(() => {
        getImageMapping(dir);
    }, {
        instanceOf: Error,
        message: /Image mapping file not found/,
    });

    t.truthy(error.message);
});

test('getImageMapping() - throws error on corrupted JSON', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const mappingPath = path.join(buildDir, 'image-mapping.json');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mappingPath, '{ invalid: json }');

    // Act & Assert - use test utility that accepts TestDir
    const error = t.throws(() => {
        getImageMapping(dir);
    }, {
        instanceOf: Error,
        message: /Invalid JSON/,
    });

    t.truthy(error.message);
});

test('getImageMapping() - returns correct structure', (t) => {
    // Arrange
    const dir = new TestDir();
    const buildDir = path.join(dir.getRoot(), '.build');
    const mappingPath = path.join(buildDir, 'image-mapping.json');

    const emptyMapping = {};

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mappingPath, JSON.stringify(emptyMapping));

    // Act - use test utility that accepts TestDir
    const result = getImageMapping(dir);

    // Assert
    t.is(typeof result, 'object', 'Should return an object');
    t.deepEqual(result, emptyMapping, 'Should handle empty mapping');
});
