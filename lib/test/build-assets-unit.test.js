/**
 * AVA unit tests for AssetsBuilder individual methods
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { Dir } = require('../build/dir');
const { TestDir } = require('./test-dir');
const { AssetsBuilder } = require('../build/build-assets');

test.beforeEach(async (t) => {
    const dir = new TestDir();
    t.context.testDir = dir.getRoot();
    t.context.dir = dir;
});

test.afterEach.always(async (t) => {
    // Restore mocked functions
    if (t.context.originalGetBuild) {
        Dir.getBuild = t.context.originalGetBuild;
    }
});

test('AssetsBuilder.ensureDir() - should create directory if not exists', async (t) => {
    const builder = new AssetsBuilder({ skipWrite: true });
    const testDir = t.context.testDir;

    // Ensure directory doesn't exist
    try {
        await fs.rm(testDir, { recursive: true });
    } catch (error) {
        // Directory doesn't exist, which is fine
    }

    await builder.dir.ensure(testDir);

    const dirExists = await fs.access(testDir).then(() => true).catch(() => false);

    t.true(dirExists);
});

test('AssetsBuilder.ensureDir() - should handle existing directory', async (t) => {
    const builder = new AssetsBuilder({ skipWrite: true });
    const testDir = t.context.testDir;

    // Create directory
    await fs.mkdir(testDir, { recursive: true });

    // Should not throw error
    await t.notThrowsAsync(() => builder.dir.ensure(testDir));
});

// validateAssetsExist is no longer used - tests removed

// copyAssets, generateAssetsJson, copyAssetsToSite, and validateAssetsExist are no longer used - tests removed

test('AssetsBuilder() - should merge statistics correctly', async (t) => {
    const { Stats } = require('../build/stats');
    const testBuildDir = path.join(t.context.testDir, 'build');

    await fs.mkdir(testBuildDir, { recursive: true });

    // Create existing stats file
    const existingStats = {
        'existing-file.pdf': {
            source: 'external/test/existing-file.pdf',
            size: 1024,
            metadata: { url: '/existing-file.pdf', type: 'pdf' },
        },
    };
    await fs.writeFile(
        path.join(testBuildDir, 'build-assets.json'),
        JSON.stringify(existingStats, null, 2),
    );

    // Override Dir.getBuild() temporarily
    t.context.originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => testBuildDir;

    try {
        // Act
        // Load existing stats
        const loadedStats = await Stats.loadFromFile('build-assets.json');

        // Create new stats instance and merge
        const stats = new Stats('build-assets.json');
        stats.stats = loadedStats; // Load existing data

        // Add new entry
        stats.add('new-file.zip', 'external/test/new-file.zip', 2048, {
            url: '/new-file.zip',
            type: 'zip',
        });

        // Assert
        // Verify both old and new stats are present
        t.truthy(stats.stats['existing-file.pdf'], 'Existing stats should be preserved');
        t.truthy(stats.stats['new-file.zip'], 'New stats should be added');

        // Verify the stats object has correct structure
        t.is(stats.stats['existing-file.pdf'].size, 1024, 'Existing file size should match');
        t.is(stats.stats['new-file.zip'].size, 2048, 'New file size should match');
    } finally {
        // Restore Dir.getBuild() in finally block
        Dir.getBuild = t.context.originalGetBuild;
        t.context.originalGetBuild = null;
    }
});

test('AssetsBuilder.copyStaticConfigFile() - should copy .htaccess when it exists', async (t) => {
    const testRoot = t.context.testDir;
    const configDir = path.join(testRoot, 'config');
    const siteDir = path.join(testRoot, 'site');

    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });

    // Create test .htaccess
    const htaccessContent = 'RewriteEngine On\nRewriteRule ^$ index.html [L]';
    await fs.writeFile(path.join(configDir, '.htaccess'), htaccessContent, 'utf8');

    const builder = new AssetsBuilder({ skipWrite: false });
    builder.projectRoot = testRoot;
    builder.CONFIG_DIR = configDir;
    builder.siteDir = siteDir;

    const { Stats } = require('../build/stats');
    const stats = new Stats('build-assets.json');
    const copied = await builder.copyStaticConfigFile('.htaccess', stats);

    t.true(copied);
    t.true(await fs.access(path.join(siteDir, '.htaccess')).then(() => true).catch(() => false));

    const copiedContent = await fs.readFile(path.join(siteDir, '.htaccess'), 'utf8');
    t.is(copiedContent, htaccessContent);
});

test('AssetsBuilder.copyStaticConfigFile() - should return false when file does not exist', async (t) => {
    const testRoot = t.context.testDir;
    const configDir = path.join(testRoot, 'config');
    const siteDir = path.join(testRoot, 'site');

    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });

    const builder = new AssetsBuilder({ skipWrite: false });
    builder.projectRoot = testRoot;
    builder.CONFIG_DIR = configDir;
    builder.siteDir = siteDir;

    const { Stats } = require('../build/stats');
    const stats = new Stats('build-assets.json');
    const copied = await builder.copyStaticConfigFile('.htaccess', stats);

    t.false(copied);
    t.false(await fs.access(path.join(siteDir, '.htaccess')).then(() => true).catch(() => false));
});

test('AssetsBuilder.copyConfigFiles() - should copy both robots.txt and .htaccess', async (t) => {
    const testRoot = t.context.testDir;
    const configDir = path.join(testRoot, 'config');
    const siteDir = path.join(testRoot, 'site');

    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });

    // Create both files
    await fs.writeFile(path.join(configDir, 'robots.txt'), 'User-agent: *\nDisallow:', 'utf8');
    await fs.writeFile(path.join(configDir, '.htaccess'), 'RewriteEngine On', 'utf8');

    const builder = new AssetsBuilder({ skipWrite: false });
    builder.projectRoot = testRoot;
    builder.CONFIG_DIR = configDir;
    builder.siteDir = siteDir;

    const { Stats } = require('../build/stats');
    const stats = new Stats('build-assets.json');
    await builder.copyConfigFiles(stats);

    t.true(await fs.access(path.join(siteDir, 'robots.txt')).then(() => true).catch(() => false));
    t.true(await fs.access(path.join(siteDir, '.htaccess')).then(() => true).catch(() => false));
});

test('AssetsBuilder.build() - should include .htaccess in config files count', async (t) => {
    const testRoot = t.context.testDir;

    // Setup directories
    const configDir = path.join(testRoot, 'config');
    const siteDir = path.join(testRoot, 'site');
    const buildDir = path.join(testRoot, '.build');

    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });

    // Create config files
    await fs.writeFile(path.join(configDir, 'robots.txt'), 'User-agent: *', 'utf8');
    await fs.writeFile(path.join(configDir, '.htaccess'), 'RewriteEngine On', 'utf8');

    // Override Dir.getBuild() to use our test build directory
    t.context.originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const builder = new AssetsBuilder({ skipWrite: false });
        builder.projectRoot = testRoot;
        builder.CONFIG_DIR = configDir;
        builder.siteDir = siteDir;
        builder.SOURCE_REPOS = []; // No external repos for this test

        const result = await builder.build();

        t.is(result.configFilesProcessed, 2); // robots.txt + .htaccess
        t.is(result.assetsProcessed, 0);
        t.is(result.totalFiles, 2);
    } finally {
        // Restore Dir.getBuild() in finally block
        Dir.getBuild = t.context.originalGetBuild;
        t.context.originalGetBuild = null;
    }
});

test('AssetsBuilder.build() - should copy .ini files from voyahchat-content repository', async (t) => {
    const testRoot = t.context.testDir;

    // Setup directories
    const externalDir = path.join(testRoot, 'external');
    const voyahchatContentDir = path.join(externalDir, 'voyahchat-content');
    const siteDir = path.join(testRoot, 'site');
    const buildDir = path.join(testRoot, '.build');

    await fs.mkdir(voyahchatContentDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });

    // Create test .ini file in voyahchat-content
    const iniContent = 'mode=device\nsetting=value';
    await fs.writeFile(path.join(voyahchatContentDir, '.usb.ini'), iniContent, 'utf8');

    // Override Dir methods to use our test directories
    t.context.originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const builder = new AssetsBuilder({ skipWrite: false });
        builder.projectRoot = testRoot;
        builder.siteDir = siteDir;
        builder.SOURCE_REPOS = [
            {
                name: 'voyahchat-content',
                path: path.resolve(testRoot, 'external/voyahchat-content'),
            },
        ];

        const result = await builder.build();

        // Verify file was copied
        const copiedIniExists = await fs.access(path.join(siteDir, '.usb.ini')).then(() => true).catch(() => false);

        t.true(copiedIniExists, '.usb.ini file should be copied to site directory');

        // Verify content is correct
        const copiedIniContent = await fs.readFile(path.join(siteDir, '.usb.ini'), 'utf8');
        t.is(copiedIniContent, iniContent, '.usb.ini content should match');

        // Verify statistics
        t.true(result.assetsProcessed >= 1, 'Should process at least 1 asset');
        t.true(result.totalFiles >= 1, 'Should have at least 1 total file');
    } finally {
        // Restore Dir.getBuild() in finally block
        Dir.getBuild = t.context.originalGetBuild;
        t.context.originalGetBuild = null;
    }
});

test('AssetsBuilder.build() - should copy .ini files from subdirectories', async (t) => {
    const testRoot = t.context.testDir;

    // Setup directories
    const externalDir = path.join(testRoot, 'external');
    const voyahchatContentDir = path.join(externalDir, 'voyahchat-content');
    const commonDir = path.join(voyahchatContentDir, 'common');
    const siteDir = path.join(testRoot, 'site');
    const buildDir = path.join(testRoot, '.build');

    await fs.mkdir(commonDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });

    // Create test .ini file in subdirectory
    const iniContent = 'mode=device\nsetting=value';
    await fs.writeFile(path.join(commonDir, '.usb.ini'), iniContent, 'utf8');

    // Override Dir methods to use our test directories
    t.context.originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const builder = new AssetsBuilder({ skipWrite: false });
        builder.projectRoot = testRoot;
        builder.siteDir = siteDir;
        builder.SOURCE_REPOS = [
            {
                name: 'voyahchat-content',
                path: path.resolve(testRoot, 'external/voyahchat-content'),
            },
        ];

        await builder.build();

        // Verify file was copied
        const copiedIniExists = await fs.access(path.join(siteDir, '.usb.ini')).then(() => true).catch(() => false);

        t.true(copiedIniExists, '.usb.ini file from subdirectory should be copied to site directory');

        // Verify content is correct
        const copiedIniContent = await fs.readFile(path.join(siteDir, '.usb.ini'), 'utf8');
        t.is(copiedIniContent, iniContent, '.usb.ini content should match');
    } finally {
        // Restore Dir.getBuild() in finally block
        Dir.getBuild = t.context.originalGetBuild;
        t.context.originalGetBuild = null;
    }
});

test('AssetsBuilder.build() - should copy .zip files from subdirectories', async (t) => {
    const testRoot = t.context.testDir;

    // Setup directories
    const externalDir = path.join(testRoot, 'external');
    const voyahchatContentDir = path.join(externalDir, 'voyahchat-content');
    const commonDir = path.join(voyahchatContentDir, 'common');
    const siteDir = path.join(testRoot, 'site');
    const buildDir = path.join(testRoot, '.build');

    await fs.mkdir(commonDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });

    // Create test .zip file in subdirectory
    const zipContent = 'fake zip content';
    await fs.writeFile(path.join(commonDir, 'usb-ini.zip'), zipContent, 'utf8');

    // Override Dir methods to use our test directories
    t.context.originalGetBuild = Dir.getBuild;
    Dir.getBuild = () => buildDir;

    try {
        const builder = new AssetsBuilder({ skipWrite: false });
        builder.projectRoot = testRoot;
        builder.siteDir = siteDir;
        builder.SOURCE_REPOS = [
            {
                name: 'voyahchat-content',
                path: path.resolve(testRoot, 'external/voyahchat-content'),
            },
        ];

        await builder.build();

        // Verify file was copied
        const copiedZipExists = await fs.access(path.join(siteDir, 'usb-ini.zip')).then(() => true).catch(() => false);

        t.true(copiedZipExists, 'usb-ini.zip file from subdirectory should be copied to site directory');

        // Verify content is correct
        const copiedZipContent = await fs.readFile(path.join(siteDir, 'usb-ini.zip'), 'utf8');
        t.is(copiedZipContent, zipContent, 'usb-ini.zip content should match');
    } finally {
        // Restore Dir.getBuild() in finally block
        Dir.getBuild = t.context.originalGetBuild;
        t.context.originalGetBuild = null;
    }
});
