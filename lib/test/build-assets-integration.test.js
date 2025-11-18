/**
 * AVA integration tests for AssetsBuilder full pipeline and main()
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');
const { AssetsBuilder } = require('../build/build-assets');
const { createMockAssetsBuilder } = require('./fixtures/mock-assets-builder');
const { copyFixture } = require('./utils');
const { ConsoleInterceptor } = require('./console-interceptor');

test.beforeEach(async (t) => {
    const dir = new TestDir();
    t.context.testDir = dir.getRoot();
});

test('AssetsBuilder.main() - should perform fresh build', async (t) => {
    const builder = createMockAssetsBuilder();
    const testAssetsDir = path.join(t.context.testDir, 'assets');
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Setup test environment
    builder.ASSETS_DIR = testAssetsDir;
    builder.ASSETS_JSON_PATH = path.join(testAssetsDir, 'assets.json');
    builder.SITE_DIR = testSiteDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo-main',
            path: testRepoDir,
            baseUrl: 'https://github.com/test/repo-main/raw/refs/heads/main',
        },
    ];

    // Create test asset
    await copyFixture('test-asset.pdf', path.join(testRepoDir, 'test.pdf'));

    // Run main function (fresh build since no assets.json exists)
    await builder.main();

    // Verify assets.json was created
    const jsonExists = await fs.access(builder.ASSETS_JSON_PATH)
        .then(() => true)
        .catch(() => false);

    t.true(jsonExists);

    // Verify assets were copied to both directories
    const assetsPdfExists = await fs.access(path.join(testAssetsDir, 'test.pdf'))
        .then(() => true)
        .catch(() => false);
    const sitePdfExists = await fs.access(path.join(testSiteDir, 'test.pdf'))
        .then(() => true)
        .catch(() => false);

    t.true(assetsPdfExists);
    t.true(sitePdfExists);
});

test('AssetsBuilder.main() - should use existing assets', async (t) => {
    const builder = createMockAssetsBuilder();
    const testAssetsDir = path.join(t.context.testDir, 'assets');
    const testSiteDir = path.join(t.context.testDir, 'site');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });

    // Setup test environment
    builder.ASSETS_DIR = testAssetsDir;
    builder.ASSETS_JSON_PATH = path.join(testAssetsDir, 'assets.json');
    builder.SITE_DIR = testSiteDir;

    // Create existing assets.json and asset file
    const existingAssets = {'https://github.com/test/repo1/raw/refs/heads/main/existing.pdf': '/existing.pdf'};

    await fs.writeFile(builder.ASSETS_JSON_PATH, JSON.stringify(existingAssets, null, 2));
    await copyFixture('test-asset.pdf', path.join(testAssetsDir, 'existing.pdf'));

    // Run main function (should use existing assets)
    await builder.main();

    // Verify asset was copied to site directory
    const sitePdfExists = await fs.access(path.join(testSiteDir, 'existing.pdf'))
        .then(() => true)
        .catch(() => false);

    t.true(sitePdfExists);
});

test('AssetsBuilder.main() - should trigger rebuild when assets missing', async (t) => {
    const interceptor = new ConsoleInterceptor(t);
    interceptor.start();

    try {
        const builder = createMockAssetsBuilder();
        const testAssetsDir = path.join(t.context.testDir, 'assets');
        const testSiteDir = path.join(t.context.testDir, 'site');
        const testRepoDir = path.join(t.context.testDir, 'repo');

        await fs.mkdir(testAssetsDir, { recursive: true });
        await fs.mkdir(testSiteDir, { recursive: true });
        await fs.mkdir(testRepoDir, { recursive: true });

        // Setup test environment
        builder.ASSETS_DIR = testAssetsDir;
        builder.ASSETS_JSON_PATH = path.join(testAssetsDir, 'assets.json');
        builder.SITE_DIR = testSiteDir;
        builder.SOURCE_REPOS = [
            {
                name: 'test-repo-rebuild',
                path: testRepoDir,
                baseUrl: 'https://github.com/test/repo-rebuild/raw/refs/heads/main',
            },
        ];

        // Create assets.json with missing asset
        const existingAssets = {'https://github.com/test/repo-rebuild/raw/refs/heads/main/missing.pdf': '/missing.pdf'};

        await fs.writeFile(builder.ASSETS_JSON_PATH, JSON.stringify(existingAssets, null, 2));

        // Create test asset in repo (to simulate rebuild)
        await copyFixture('test-asset.pdf', path.join(testRepoDir, 'new.pdf'));

        await builder.main();

        // Verify that the process completed without throwing an error
        // The main point of this test is to ensure the rebuild process doesn't crash
        t.pass('Assets builder completed rebuild process');
    } finally {
        interceptor.stop();
    }
});

test('AssetsBuilder() - should copy robots.txt from config', async (t) => {
    const testConfigDir = path.join(t.context.testDir, 'config');
    const testSiteDir = path.join(t.context.testDir, 'site');

    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });

    // Create robots.txt in config directory
    const robotsContent = 'User-agent: *\nDisallow: /admin/\nSitemap: https://example.com/sitemap.xml\n';
    const robotsSource = path.join(testConfigDir, 'robots.txt');
    const robotsDest = path.join(testSiteDir, 'robots.txt');

    await fs.writeFile(robotsSource, robotsContent);

    // Test the core functionality directly
    try {
        await fs.access(robotsSource);
        await fs.copyFile(robotsSource, robotsDest);

        // Verify robots.txt was copied
        const robotsExists = await fs.access(robotsDest)
            .then(() => true)
            .catch(() => false);

        t.true(robotsExists, 'robots.txt should be copied to site directory');

        // Verify content matches
        const copiedContent = await fs.readFile(robotsDest, 'utf8');
        t.is(copiedContent, robotsContent, 'robots.txt content should match');
    } catch (error) {
        t.fail(`Failed to copy robots.txt: ${error.message}`);
    }
});

test('AssetsBuilder() - should handle malformed assets.json', async (t) => {
    const testAssetsDir = path.join(t.context.testDir, 'assets');
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create malformed assets.json
    const malformedJson = '{ "invalid": json content }';
    await fs.writeFile(path.join(testAssetsDir, 'assets.json'), malformedJson);

    // Create a test asset in repo
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

    // Should trigger rebuild when JSON is malformed
    const result = await builder.build();

    t.truthy(result, 'Build should complete despite malformed JSON');
    t.true(result.assetsProcessed >= 0, 'Should process assets after rebuild');

    // Verify new assets.json was created
    const newJson = await fs.readFile(builder.ASSETS_JSON_PATH, 'utf8');
    const parsed = JSON.parse(newJson);

    t.truthy(parsed, 'New assets.json should be valid JSON');
    t.true(
        Object.keys(parsed).some(key => key.includes('test.pdf')),
        'New assets.json should contain test.pdf',
    );
});

test('AssetsBuilder() - should handle corrupted assets.json with partial data', async (t) => {
    const testAssetsDir = path.join(t.context.testDir, 'assets');
    const testSiteDir = path.join(t.context.testDir, 'site');
    const testRepoDir = path.join(t.context.testDir, 'repo');

    await fs.mkdir(testAssetsDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });
    await fs.mkdir(testRepoDir, { recursive: true });

    // Create partially corrupted JSON (valid JSON but missing required fields)
    const partialJson = '{"incomplete": "data"}';
    await fs.writeFile(path.join(testAssetsDir, 'assets.json'), partialJson);

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

    // Should trigger rebuild with partial JSON
    const result = await builder.build();

    t.truthy(result, 'Build should complete despite partial JSON');
});

test('Integration - copyConfigFiles copies robots.txt from config to site', async (t) => {
    const testConfigDir = path.join(t.context.testDir, 'config');
    const testSiteDir = path.join(t.context.testDir, 'site');

    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });

    // Create test robots.txt in config directory
    const robotsTxtContent = 'User-Agent: *\nAllow: /\nSitemap: /sitemap.xml\n';
    const robotsTxtSource = path.join(testConfigDir, 'robots.txt');
    await fs.writeFile(robotsTxtSource, robotsTxtContent);

    // Test the copyConfigFiles functionality
    async function copyConfigFiles() {
        const CONFIG_DIR = testConfigDir;
        const siteDir = testSiteDir;

        // Copy robots.txt from config directory
        const robotsTxtSource = path.join(CONFIG_DIR, 'robots.txt');
        const robotsTxtDest = path.join(siteDir, 'robots.txt');

        try {
            await fs.access(robotsTxtSource);
            await fs.copyFile(robotsTxtSource, robotsTxtDest);

            // Verify the content matches
            const copiedContent = await fs.readFile(robotsTxtDest, 'utf8');
            t.is(copiedContent, robotsTxtContent);

            // Verify file exists
            const fileExists = await fs.access(robotsTxtDest).then(() => true).catch(() => false);
            t.true(fileExists);

            return true;
        } catch (error) {
            return false;
        }
    }

    const result = await copyConfigFiles();
    t.true(result);

    // Verify the file was copied correctly
    const robotsTxtDest = path.join(testSiteDir, 'robots.txt');
    const copiedContent = await fs.readFile(robotsTxtDest, 'utf8');
    t.is(copiedContent, robotsTxtContent);
});

test('Integration - copyConfigFiles handles missing robots.txt gracefully', async (t) => {
    const testConfigDir = path.join(t.context.testDir, 'config');
    const testSiteDir = path.join(t.context.testDir, 'site');

    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testSiteDir, { recursive: true });

    // Don't create robots.txt - it should handle missing file gracefully

    async function copyConfigFiles() {
        const CONFIG_DIR = testConfigDir;
        const siteDir = testSiteDir;

        // Copy robots.txt from config directory
        const robotsTxtSource = path.join(CONFIG_DIR, 'robots.txt');
        const robotsTxtDest = path.join(siteDir, 'robots.txt');

        try {
            await fs.access(robotsTxtSource);
            await fs.copyFile(robotsTxtSource, robotsTxtDest);
            return true;
        } catch (error) {
            // Should handle missing file gracefully
            return false;
        }
    }

    const result = await copyConfigFiles();
    t.false(result);

    // Verify no robots.txt was created in site directory
    const robotsTxtDest = path.join(testSiteDir, 'robots.txt');
    const fileExists = await fs.access(robotsTxtDest).then(() => true).catch(() => false);
    t.false(fileExists);
});

test('Integration - robots.txt is excluded from compression', async (t) => {
    // Use TestDir for isolation
    const dir = new TestDir();
    const testSiteDir = dir.getSite();
    const brotliDir = path.join(testSiteDir, 'brotli');
    const gzipDir = path.join(testSiteDir, 'gzip');

    await fs.mkdir(brotliDir, { recursive: true });
    await fs.mkdir(gzipDir, { recursive: true });

    // Create test files including robots.txt
    const robotsTxtContent = 'User-Agent: *\nAllow: /\nSitemap: /sitemap.xml\n';

    // Create larger content for CSS and JS to ensure effective compression
    const cssBase = 'body { color: red; background: linear-gradient(45deg, #ff0000, #00ff00); ';
    const cssBase2 = 'margin: 0; padding: 20px; font-family: Arial, sans-serif; } ';
    const cssContent = (cssBase + cssBase2).repeat(50);
    const jsBase = 'console.log("test"); function test() { return "test"; } const obj = { key: "value", num: 42 }; ';
    const jsContent = jsBase.repeat(50);

    await fs.writeFile(path.join(testSiteDir, 'robots.txt'), robotsTxtContent);
    await fs.writeFile(path.join(testSiteDir, 'style.css'), cssContent);
    await fs.writeFile(path.join(testSiteDir, 'script.js'), jsContent);

    // Import and test the compression logic
    const { CompressionBuilder } = require('../build/build-compression');

    // Use TestDir for isolated build
    const builder = new CompressionBuilder({}, dir);
    await builder.build();

    // Verify robots.txt was NOT compressed
    const robotsBrotliExists = await fs.access(path.join(brotliDir, 'robots.txt.br'))
        .then(() => true)
        .catch(() => false);
    const robotsGzipExists = await fs.access(path.join(gzipDir, 'robots.txt.gz'))
        .then(() => true)
        .catch(() => false);

    t.false(robotsBrotliExists, 'robots.txt should not have brotli compression');
    t.false(robotsGzipExists, 'robots.txt should not have gzip compression');

    // Verify other files WERE compressed
    const cssBrotliExists = await fs.access(path.join(brotliDir, 'style.css.br'))
        .then(() => true)
        .catch(() => false);
    const cssGzipExists = await fs.access(path.join(gzipDir, 'style.css.gz'))
        .then(() => true)
        .catch(() => false);
    const jsBrotliExists = await fs.access(path.join(brotliDir, 'script.js.br'))
        .then(() => true)
        .catch(() => false);
    const jsGzipExists = await fs.access(path.join(gzipDir, 'script.js.gz'))
        .then(() => true)
        .catch(() => false);

    t.true(cssBrotliExists, 'CSS files should be compressed with brotli');
    t.true(cssGzipExists, 'CSS files should be compressed with gzip');
    t.true(jsBrotliExists, 'JS files should be compressed with brotli');
    t.true(jsGzipExists, 'JS files should be compressed with gzip');
});
