/**
 * AVA unit tests for AssetsBuilder individual methods
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { Dir } = require('../build/dir');
const { TestDir } = require('./test-dir');
const { AssetsBuilder } = require('../build/build-assets');
const { createMockAssetsBuilder } = require('./fixtures/mock-assets-builder');
const { copyFixture } = require('./utils');

test.beforeEach(async (t) => {
    const dir = new TestDir();
    t.context.testDir = dir.getRoot();
});

test.afterEach.always(async (t) => {
    // Restore mocked functions
    if (t.context.originalGetBuild) {
        Dir.getBuild = t.context.originalGetBuild;
    }
});

test('AssetsBuilder.ensureDir() - should create directory if not exists', async (t) => {
    const builder = createMockAssetsBuilder();
    const testDir = t.context.testDir;

    // Ensure directory doesn't exist
    try {
        await fs.rm(testDir, { recursive: true });
    } catch (error) {
        // Directory doesn't exist, which is fine
    }

    await builder.ensureDir(testDir);

    const dirExists = await fs.access(testDir).then(() => true).catch(() => false);

    t.true(dirExists);
});

test('AssetsBuilder.ensureDir() - should handle existing directory', async (t) => {
    const builder = createMockAssetsBuilder();
    const testDir = t.context.testDir;

    // Create directory
    await fs.mkdir(testDir, { recursive: true });

    // Should not throw error
    await t.notThrowsAsync(() => builder.ensureDir(testDir));
});

test('AssetsBuilder.validateAssetsExist() - should find missing assets', async (t) => {
    const builder = createMockAssetsBuilder();
    const testAssetsDir = t.context.testDir;

    // Create one asset file
    const existingAsset = path.join(testAssetsDir, 'existing.pdf');

    await copyFixture('test-asset.pdf', existingAsset);

    const assetsJson = {
        'https://github.com/test/repo1/raw/refs/heads/main/existing.pdf': '/existing.pdf',
        'https://github.com/test/repo1/raw/refs/heads/main/missing.zip': '/missing.zip',
    };

    // Override ASSETS_DIR for this test
    builder.ASSETS_DIR = testAssetsDir;

    const missingAssets = await builder.validateAssetsExist(assetsJson);

    t.deepEqual(missingAssets, ['missing.zip']);
});

test('AssetsBuilder.validateAssetsExist() - should return empty array when all exist', async (t) => {
    const builder = createMockAssetsBuilder();
    const testAssetsDir = t.context.testDir;

    // Create asset files
    await copyFixture('test-asset.pdf', path.join(testAssetsDir, 'asset1.pdf'));
    await copyFixture('test-asset.zip', path.join(testAssetsDir, 'asset2.zip'));

    const assetsJson = {
        'https://github.com/test/repo1/raw/refs/heads/main/asset1.pdf': '/asset1.pdf',
        'https://github.com/test/repo1/raw/refs/heads/main/asset2.zip': '/asset2.zip',
    };

    // Override ASSETS_DIR for this test
    builder.ASSETS_DIR = testAssetsDir;

    const missingAssets = await builder.validateAssetsExist(assetsJson);

    t.deepEqual(missingAssets, []);
});

test('AssetsBuilder.copyAssets() - should copy only supported file types', async (t) => {
    const builder = createMockAssetsBuilder();
    const testAssetsDir = t.context.testDir;
    const testRepoDir = path.join(t.context.testDir, 'repo');
    const testRepo2Dir = path.join(t.context.testDir, 'repo2');

    await fs.mkdir(testRepoDir, { recursive: true });
    await fs.mkdir(testRepo2Dir, { recursive: true });

    // Create test files including unsupported types
    await copyFixture('test-asset.pdf', path.join(testRepoDir, 'asset1.pdf'));
    await copyFixture('test-asset.zip', path.join(testRepoDir, 'asset2.zip'));
    await fs.writeFile(path.join(testRepoDir, 'asset3.txt'), 'txt content'); // Should be ignored
    await fs.writeFile(path.join(testRepoDir, 'asset4.doc'), 'doc content'); // Should be ignored

    // Override SOURCE_REPOS and ASSETS_DIR for this test
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo-1',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/repo1/raw/refs/heads/main',
        }, {
            name: 'test-repo-2',
            path: testRepo2Dir,
            baseUrl: 'https://github.com/test/repo2/raw/refs/heads/main',
        },
    ];
    builder.ASSETS_DIR = testAssetsDir;

    const assetMap = await builder.copyAssets();

    // Should only include PDF and ZIP files
    t.deepEqual(assetMap['https://github.com/test/repo1/raw/refs/heads/main/asset1.pdf'], '/asset1.pdf');
    t.deepEqual(assetMap['https://github.com/test/repo1/raw/refs/heads/main/asset2.zip'], '/asset2.zip');
    t.false(Object.prototype.hasOwnProperty.call(
        assetMap,
        'https://github.com/test/repo1/raw/refs/heads/main/asset3.txt',
    ));
    t.false(Object.prototype.hasOwnProperty.call(
        assetMap,
        'https://github.com/test/repo1/raw/refs/heads/main/asset4.doc',
    ));

    // Verify files were copied
    const pdfExists = await fs.access(path.join(testAssetsDir, 'asset1.pdf')).then(() => true).catch(() => false);
    const zipExists = await fs.access(path.join(testAssetsDir, 'asset2.zip')).then(() => true).catch(() => false);
    const txtExists = await fs.access(path.join(testAssetsDir, 'asset3.txt')).then(() => true).catch(() => false);

    t.true(pdfExists);
    t.true(zipExists);
    t.false(txtExists);
});

test('AssetsBuilder.copyAssets() - should handle missing source directory', async (t) => {
    const builder = createMockAssetsBuilder();

    // Use non-existent directory
    builder.SOURCE_REPOS = [
        {
            name: 'nonexistent-repo',
            path: path.join(__dirname, 'nonexistent'),
            baseUrl: 'https://github.com/test/nonexistent/raw/refs/heads/main',
        },
    ];

    await t.throwsAsync(() => builder.copyAssets(), {message: /Source directory not found/});
});

test('AssetsBuilder.generateAssetsJson() - should create proper JSON file', async (t) => {
    const builder = createMockAssetsBuilder();
    const testAssetsDir = t.context.testDir;

    // Override both ASSETS_JSON_PATH and ASSETS_DIR for this test
    builder.ASSETS_JSON_PATH = path.join(testAssetsDir, 'assets.json');
    builder.ASSETS_DIR = testAssetsDir;

    const assetMap = {
        'https://github.com/test/repo1/raw/refs/heads/main/asset1.pdf': '/asset1.pdf',
        'https://github.com/test/repo1/raw/refs/heads/main/asset2.zip': '/asset2.zip',
    };

    await builder.generateAssetsJson(assetMap);

    const jsonExists = await fs.access(builder.ASSETS_JSON_PATH)
        .then(() => true)
        .catch(() => false);

    t.true(jsonExists);

    const jsonContent = JSON.parse(await fs.readFile(builder.ASSETS_JSON_PATH, 'utf8'));

    t.deepEqual(jsonContent, assetMap);
});

test('AssetsBuilder.copyAssetsToSite() - should copy assets to site directory', async (t) => {
    const builder = createMockAssetsBuilder();
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');

    await fs.mkdir(testSiteDir, { recursive: true });

    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;

    // Create source assets
    await copyFixture('test-asset.pdf', path.join(testAssetsDir, 'asset1.pdf'));
    await copyFixture('test-asset.zip', path.join(testAssetsDir, 'asset2.zip'));

    const assetsJson = {
        'https://github.com/test/repo1/raw/refs/heads/main/asset1.pdf': '/asset1.pdf',
        'https://github.com/test/repo1/raw/refs/heads/main/asset2.zip': '/asset2.zip',
    };

    await builder.copyAssetsToSite(assetsJson);

    // Verify files were copied to site directory
    const pdfExists = await fs.access(path.join(testSiteDir, 'asset1.pdf')).then(() => true).catch(() => false);
    const zipExists = await fs.access(path.join(testSiteDir, 'asset2.zip')).then(() => true).catch(() => false);

    t.true(pdfExists);
    t.true(zipExists);
});

test('AssetsBuilder() - should validate all assets exist', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });

    // Create test assets
    await copyFixture('test-asset.pdf', path.join(testAssetsDir, 'asset1.pdf'));
    await copyFixture('test-asset.zip', path.join(testAssetsDir, 'asset2.zip'));

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;

    const assetsJson = {
        'https://github.com/test/repo/raw/refs/heads/main/asset1.pdf': '/asset1.pdf',
        'https://github.com/test/repo/raw/refs/heads/main/asset2.zip': '/asset2.zip',
    };

    const missingAssets = await builder.validateAssetsExist(assetsJson);

    t.deepEqual(missingAssets, [], 'All assets should exist');
});

test('AssetsBuilder() - should detect missing assets', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });

    // Create only one asset
    await copyFixture('test-asset.pdf', path.join(testAssetsDir, 'existing.pdf'));

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;

    const assetsJson = {
        'https://github.com/test/repo/raw/refs/heads/main/existing.pdf': '/existing.pdf',
        'https://github.com/test/repo/raw/refs/heads/main/missing1.zip': '/missing1.zip',
        'https://github.com/test/repo/raw/refs/heads/main/missing2.pdf': '/missing2.pdf',
    };

    const missingAssets = await builder.validateAssetsExist(assetsJson);

    t.is(missingAssets.length, 2, 'Should detect 2 missing assets');
    t.true(missingAssets.includes('missing1.zip'), 'Should detect missing1.zip');
    t.true(missingAssets.includes('missing2.pdf'), 'Should detect missing2.pdf');
});

test('AssetsBuilder() - should map GitHub URLs correctly', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create test assets in repo
    await copyFixture('test-asset.pdf', path.join(testRepoDir, 'manual.pdf'));
    await copyFixture('test-asset.zip', path.join(testRepoDir, 'installer.zip'));

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo',
            path: testRepoDir,
            baseUrl: 'https://github.com/voyahchat/test-repo/raw/refs/heads/main',
        },
    ];

    const assetMap = await builder.copyAssets();

    // Verify GitHub URL mapping
    t.is(
        assetMap['https://github.com/voyahchat/test-repo/raw/refs/heads/main/manual.pdf'],
        '/manual.pdf',
        'PDF should map to local URL',
    );
    t.is(
        assetMap['https://github.com/voyahchat/test-repo/raw/refs/heads/main/installer.zip'],
        '/installer.zip',
        'ZIP should map to local URL',
    );

    // Verify files were copied
    const pdfExists = await fs.access(path.join(testAssetsDir, 'manual.pdf'))
        .then(() => true)
        .catch(() => false);
    const zipExists = await fs.access(path.join(testAssetsDir, 'installer.zip'))
        .then(() => true)
        .catch(() => false);

    t.true(pdfExists, 'PDF should be copied to assets directory');
    t.true(zipExists, 'ZIP should be copied to assets directory');
});

test('AssetsBuilder() - should fail when external repos missing', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');
    const nonExistentDir = path.join(t.context.testDir, 'nonexistent');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'missing-repo',
            path: nonExistentDir,
            baseUrl: 'https://github.com/test/missing/raw/refs/heads/main',
        },
    ];

    // Verify that an error is thrown when source directory is missing
    await t.throwsAsync(
        async () => {
            await builder.copyAssets();
        },
        {
            message: /Source directory not found/,
        },
        'Should throw error when source directory is missing',
    );
});

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

    // Verify both old and new stats are present
    t.truthy(stats.stats['existing-file.pdf'], 'Existing stats should be preserved');
    t.truthy(stats.stats['new-file.zip'], 'New stats should be added');

    // Verify the stats object has correct structure
    t.is(stats.stats['existing-file.pdf'].size, 1024, 'Existing file size should match');
    t.is(stats.stats['new-file.zip'].size, 2048, 'New file size should match');
});

test('AssetsBuilder() - should create .assets directory if missing', async (t) => {
    // Use a unique path that doesn't exist yet
    const testRoot = t.context.testDir;
    const testAssetsDir = path.join(testRoot, 'assets-dir-test');
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    // Create only the directories we need, not the assets dir
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create a test asset
    await copyFixture('test-asset.pdf', path.join(testRepoDir, 'test.pdf'));

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.ASSETS_JSON_PATH = path.join(testAssetsDir, 'assets.json');
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/repo/raw/refs/heads/main',
        },
    ];

    // Verify directory doesn't exist yet
    const existsBefore = await fs.access(testAssetsDir)
        .then(() => true)
        .catch(() => false);
    t.false(existsBefore, 'Assets directory should not exist before build');

    // Run build
    await builder.build();

    // Verify directory was created
    const existsAfter = await fs.access(testAssetsDir)
        .then(() => true)
        .catch(() => false);
    t.true(existsAfter, 'Assets directory should be created by build');

    // Verify assets.json was created
    const jsonExists = await fs.access(builder.ASSETS_JSON_PATH)
        .then(() => true)
        .catch(() => false);
    t.true(jsonExists, 'assets.json should be created in new directory');
});

test('AssetsBuilder() - should handle permission errors during file copy', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create a test asset
    const assetPath = path.join(testRepoDir, 'restricted.pdf');
    await copyFixture('test-asset.pdf', assetPath);

    // Remove read permissions
    await fs.chmod(assetPath, 0o000);

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/repo/raw/refs/heads/main',
        },
    ];

    // Should handle permission error
    await t.throwsAsync(async () => {
        await builder.copyAssets();
    });

    // Restore permissions for cleanup
    await fs.chmod(assetPath, 0o644);
});

test('AssetsBuilder() - should handle empty source repositories', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Don't create any assets in the repo

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'empty-repo',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/empty/raw/refs/heads/main',
        },
    ];

    // Should handle empty repo gracefully
    const assetMap = await builder.copyAssets();

    t.deepEqual(assetMap, {}, 'Asset map should be empty for empty repo');
});

test('AssetsBuilder() - should handle very large asset files', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create a large file (5MB)
    const largeContent = Buffer.alloc(5 * 1024 * 1024, 'x');
    await fs.writeFile(path.join(testRepoDir, 'large.pdf'), largeContent);

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/repo/raw/refs/heads/main',
        },
    ];

    // Should handle large file without errors
    await t.notThrowsAsync(async () => {
        await builder.copyAssets();
    });

    // Verify file was copied
    const copiedExists = await fs.access(path.join(testAssetsDir, 'large.pdf'))
        .then(() => true)
        .catch(() => false);

    t.true(copiedExists, 'Large file should be copied');
});

test('AssetsBuilder() - should handle concurrent asset operations', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create multiple assets
    const assets = ['asset1.pdf', 'asset2.zip', 'asset3.pdf', 'asset4.zip'];
    for (const asset of assets) {
        const fixtureName = asset.endsWith('.pdf') ? 'test-asset.pdf' : 'test-asset.zip';
        await copyFixture(fixtureName, path.join(testRepoDir, asset));
    }

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/repo/raw/refs/heads/main',
        },
    ];

    // Should handle concurrent operations
    await t.notThrowsAsync(async () => {
        await builder.copyAssets();
    });

    // Verify all assets were copied
    for (const asset of assets) {
        const exists = await fs.access(path.join(testAssetsDir, asset))
            .then(() => true)
            .catch(() => false);
        t.true(exists, `${asset} should be copied`);
    }
});

test('AssetsBuilder() - should handle assets with special characters', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create asset with special characters (valid in filesystem)
    const specialName = 'asset-with-special-chars-@#$.pdf';
    await copyFixture('test-asset.pdf', path.join(testRepoDir, specialName));

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/repo/raw/refs/heads/main',
        },
    ];

    // Should handle special characters
    await t.notThrowsAsync(async () => {
        await builder.copyAssets();
    });

    const exists = await fs.access(path.join(testAssetsDir, specialName))
        .then(() => true)
        .catch(() => false);

    t.true(exists, 'Asset with special characters should be copied');
});

test('AssetsBuilder() - should handle read-only destination directory', async (t) => {
    const testAssetsDir = t.context.testDir;
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create a test asset
    await copyFixture('test-asset.pdf', path.join(testRepoDir, 'test.pdf'));

    // Make assets directory read-only
    await fs.chmod(testAssetsDir, 0o444);

    const builder = new AssetsBuilder({ skipWrite: true });
    builder.ASSETS_DIR = testAssetsDir;
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/repo/raw/refs/heads/main',
        },
    ];

    // Should handle read-only directory error
    await t.throwsAsync(async () => {
        await builder.copyAssets();
    });

    // Restore permissions for cleanup
    await fs.chmod(testAssetsDir, 0o755);
});
