/**
 * AVA tests for build utilities (lib/build/utils.js)
 * Tests the 5 core utility functions used throughout the build system
 */

const test = require('ava');
const path = require('path');
const fs = require('fs');
const { Dir } = require('../build/dir');
const { TestDir } = require('./test-dir');

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
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'test-file.txt');

    // Create test file
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFile, 'test content');

    const result = fileExists(testFile);

    t.true(result, 'Should return true for existing file');
});

test('fileExists() - returns false for non-existing file', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const nonExistentFile = path.join(testDir, 'non-existent-file.txt');

    const result = fileExists(nonExistentFile);

    t.false(result, 'Should return false for non-existing file');
});

test('fileExists() - handles directory paths correctly', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    // Create directory
    fs.mkdirSync(testDir, { recursive: true });

    const result = fileExists(testDir);

    t.true(result, 'Should return true for existing directory');
});

/**
 * Tests for readJsonFile()
 */

test('readJsonFile() - successfully reads valid JSON', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const jsonFile = path.join(testDir, 'valid.json');

    const testData = { key: 'value', number: 42, array: [1, 2, 3] };

    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(jsonFile, JSON.stringify(testData));

    const result = readJsonFile(jsonFile);

    t.deepEqual(result, testData, 'Should parse JSON correctly');
});

test('readJsonFile() - throws error on corrupted JSON', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const corruptedFile = path.join(testDir, 'corrupted.json');

    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(corruptedFile, '{ invalid json content }');

    const error = t.throws(() => {
        readJsonFile(corruptedFile);
    }, {
        instanceOf: Error,
        message: /Invalid JSON/,
    });

    t.truthy(error.message);
});

test('readJsonFile() - throws error on missing file', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const missingFile = path.join(testDir, 'missing.json');

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
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
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
        const result = getSitemap();

        t.truthy(result, 'Should return sitemap data');
        t.true(Array.isArray(result.sitemap), 'Should have sitemap array');
        t.is(typeof result.pages, 'object', 'Should have pages object');
        t.is(typeof result.md2url, 'object', 'Should have md2url object');
        t.is(typeof result.url2md, 'object', 'Should have url2md object');
        t.deepEqual(result, validSitemap, 'Should return correct structure');
    } finally {
        Dir.getBuild = originalGetBuild;
    }
});

test('getSitemap() - throws error when file missing', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');

    fs.mkdirSync(buildDir, { recursive: true });
    // Don't create sitemap.json

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const error = t.throws(() => {
            getSitemap();
        }, {
            instanceOf: Error,
            message: /Sitemap file not found/,
        });

        t.truthy(error.message);
    } finally {
        Dir.getBuild = originalGetBuild;
    }
});

test('getSitemap() - throws error on corrupted JSON', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const sitemapPath = path.join(buildDir, 'sitemap.json');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sitemapPath, '{ corrupted json }');

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const error = t.throws(() => {
            getSitemap();
        }, {
            instanceOf: Error,
            message: /Invalid JSON/,
        });

        t.truthy(error.message);
    } finally {
        Dir.getBuild = originalGetBuild;
    }
});

test('getSitemap() - returns correct structure with all required fields', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const sitemapPath = path.join(buildDir, 'sitemap.json');

    const validSitemap = createMockSitemap({ pages: [] });

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(sitemapPath, JSON.stringify(validSitemap));

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const result = getSitemap();

        t.truthy(result.sitemap, 'Should have sitemap field');
        t.truthy(result.pages, 'Should have pages field');
        t.truthy(result.md2url, 'Should have md2url field');
        t.truthy(result.url2md, 'Should have url2md field');
    } finally {
        Dir.getBuild = originalGetBuild;
    }
});

/**
 * Tests for getImageMapping()
 */

test('getImageMapping() - successfully loads valid mapping', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const mappingPath = path.join(buildDir, 'image-mapping.json');

    const validMapping = createMockImageMapping();

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mappingPath, JSON.stringify(validMapping));

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const result = getImageMapping();

        t.truthy(result, 'Should return mapping data');
        t.is(typeof result, 'object', 'Should be an object');
        t.deepEqual(result, validMapping, 'Should return correct mapping');
    } finally {
        Dir.getBuild = originalGetBuild;
    }
});

test('getImageMapping() - throws error when file missing', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');

    fs.mkdirSync(buildDir, { recursive: true });
    // Don't create image-mapping.json

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const error = t.throws(() => {
            getImageMapping();
        }, {
            instanceOf: Error,
            message: /Image mapping file not found/,
        });

        t.truthy(error.message);
    } finally {
        Dir.getBuild = originalGetBuild;
    }
});

test('getImageMapping() - throws error on corrupted JSON', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const mappingPath = path.join(buildDir, 'image-mapping.json');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mappingPath, '{ invalid: json }');

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const error = t.throws(() => {
            getImageMapping();
        }, {
            instanceOf: Error,
            message: /Invalid JSON/,
        });

        t.truthy(error.message);
    } finally {
        Dir.getBuild = originalGetBuild;
    }
});

test('getImageMapping() - returns correct structure', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const mappingPath = path.join(buildDir, 'image-mapping.json');

    const emptyMapping = {};

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(mappingPath, JSON.stringify(emptyMapping));

    const originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const result = getImageMapping();

        t.is(typeof result, 'object', 'Should return an object');
        t.deepEqual(result, emptyMapping, 'Should handle empty mapping');
    } finally {
        Dir.getBuild = originalGetBuild;
    }
});

/**
 * Tests for getAssetsMapping()
 */

test('getAssetsMapping() - successfully loads valid assets', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const assetsDir = path.join(testDir, '.assets');
    const assetsPath = path.join(assetsDir, 'assets.json');

    const validAssets = createMockAssetsMapping();

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetsPath, JSON.stringify(validAssets));

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => testDir;

    try {
        const result = getAssetsMapping();

        t.truthy(result, 'Should return assets data');
        t.is(typeof result, 'object', 'Should be an object');
        t.deepEqual(result, validAssets, 'Should return correct assets');
    } finally {
        Dir.getRoot = originalGetRoot;
    }
});

test('getAssetsMapping() - returns empty object when file missing', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    fs.mkdirSync(testDir, { recursive: true });
    // Don't create .assets/assets.json

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => testDir;

    try {
        const result = getAssetsMapping();

        t.deepEqual(result, {}, 'Should return empty object when file missing');
    } finally {
        Dir.getRoot = originalGetRoot;
    }
});

test('getAssetsMapping() - returns empty object on corrupted JSON', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const assetsDir = path.join(testDir, '.assets');
    const assetsPath = path.join(assetsDir, 'assets.json');

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetsPath, '{ invalid json }');

    const originalGetRoot = Dir.getRoot;
    const originalConsoleWarn = console.warn;
    Dir.getRoot = () => testDir;
    console.warn = () => {}; // Suppress expected warnings

    try {
        const result = getAssetsMapping();

        t.deepEqual(result, {}, 'Should return empty object for corrupted JSON');
    } finally {
        Dir.getRoot = originalGetRoot;
        console.warn = originalConsoleWarn;
    }
});

test('getAssetsMapping() - handles empty file gracefully', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const assetsDir = path.join(testDir, '.assets');
    const assetsPath = path.join(assetsDir, 'assets.json');

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetsPath, '');

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => testDir;

    try {
        const result = getAssetsMapping();

        t.deepEqual(result, {}, 'Should return empty object for empty file');
    } finally {
        Dir.getRoot = originalGetRoot;
    }
});

test('getAssetsMapping() - returns correct structure', (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const assetsDir = path.join(testDir, '.assets');
    const assetsPath = path.join(assetsDir, 'assets.json');

    const emptyAssets = {};

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(assetsPath, JSON.stringify(emptyAssets));

    const originalGetRoot = Dir.getRoot;
    Dir.getRoot = () => testDir;

    try {
        const result = getAssetsMapping();

        t.is(typeof result, 'object', 'Should return an object');
        t.deepEqual(result, emptyAssets, 'Should handle empty assets');
    } finally {
        Dir.getRoot = originalGetRoot;
    }
});
