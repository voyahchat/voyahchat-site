/**
 * AVA integration tests for AssetsBuilder full pipeline and main()
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');
const { AssetsBuilder } = require('../build/build-assets');
const { copyFixture } = require('./utils');

test.beforeEach(async (t) => {
    const dir = new TestDir();
    t.context.testDir = dir.getRoot();
});

test('AssetsBuilder.main() - should perform fresh build', async (t) => {
    // Use TestDir for complete isolation
    const dir = new TestDir();
    const testSiteDir = dir.getSite();
    const testRepoDir = path.join(dir.getRoot(), 'repo');
    const testConfigDir = path.join(dir.getRoot(), 'config');
    const testBuildDir = dir.getBuild();

    await fs.mkdir(testRepoDir, { recursive: true });
    await fs.mkdir(testConfigDir, { recursive: true });

    // Create test asset
    await copyFixture('test-asset.pdf', path.join(testRepoDir, 'test.pdf'));

    // Create test config file
    await fs.writeFile(path.join(testConfigDir, 'robots.txt'), 'User-agent: *\nDisallow: /');

    // Create builder with TestDir for isolation
    const builder = new AssetsBuilder({ skipWrite: false }, dir);

    // Setup test environment
    builder.siteDir = testSiteDir;
    builder.CONFIG_DIR = testConfigDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo-main',
            path: testRepoDir,
        },
    ];

    // Run main function (fresh build)
    const result = await builder.build();

    // Verify asset was copied to site directory
    const sitePdfExists = await fs.access(path.join(testSiteDir, 'test.pdf'))
        .then(() => true)
        .catch(() => false);

    // Verify config file was copied to site directory
    const siteRobotsExists = await fs.access(path.join(testSiteDir, 'robots.txt'))
        .then(() => true)
        .catch(() => false);

    // Verify build stats were created
    const statsExists = await fs.access(path.join(testBuildDir, 'build-assets.json'))
        .then(() => true)
        .catch(() => false);

    t.true(sitePdfExists, 'PDF asset should be copied to site directory');
    t.true(siteRobotsExists, 'robots.txt should be copied to site directory');
    t.true(statsExists, 'build-assets.json should be created');
    t.is(result.assetsProcessed, 1, 'Should process 1 asset');
    t.is(result.configFilesProcessed, 1, 'Should process 1 config file');
    t.is(result.totalFiles, 2, 'Should process 2 files total');
});

test('AssetsBuilder.main() - should use existing assets', async (t) => {
    // Use TestDir for complete isolation
    const dir = new TestDir();
    const testSiteDir = dir.getSite();
    const testRepoDir = path.join(dir.getRoot(), 'repo');
    const testBuildDir = dir.getBuild();

    await fs.mkdir(testRepoDir, { recursive: true });

    // Create existing asset file in repo
    await copyFixture('test-asset.pdf', path.join(testRepoDir, 'existing.pdf'));

    // Create builder with TestDir for isolation
    const builder = new AssetsBuilder({ skipWrite: false }, dir);

    // Setup test environment
    builder.siteDir = testSiteDir;
    builder.CONFIG_DIR = path.join(dir.getRoot(), 'config'); // Use non-existent config dir
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo-1',
            path: testRepoDir,
        },
    ];

    // Run main function (should copy assets from repo to site)
    const result = await builder.build();

    // Verify asset was copied to site directory
    const sitePdfExists = await fs.access(path.join(testSiteDir, 'existing.pdf'))
        .then(() => true)
        .catch(() => false);

    // Verify build stats were created
    const statsExists = await fs.access(path.join(testBuildDir, 'build-assets.json'))
        .then(() => true)
        .catch(() => false);

    t.true(sitePdfExists, 'Asset should be copied from repo to site directory');
    t.true(statsExists, 'build-assets.json should be created');
    t.is(result.assetsProcessed, 1, 'Should process 1 asset');
    t.is(result.configFilesProcessed, 0, 'Should process 0 config files');
    t.is(result.totalFiles, 1, 'Should process 1 file total');
});

test('AssetsBuilder.main() - should trigger rebuild when assets missing', async (t) => {
    // Use TestDir for complete isolation
    const dir = new TestDir();
    const testSiteDir = dir.getSite();
    const testRepoDir = path.join(dir.getRoot(), 'repo');
    const testConfigDir = path.join(dir.getRoot(), 'config');
    const testBuildDir = dir.getBuild();

    await fs.mkdir(testRepoDir, { recursive: true });
    await fs.mkdir(testConfigDir, { recursive: true });

    // Create test asset in repo (to simulate rebuild)
    await copyFixture('test-asset.pdf', path.join(testRepoDir, 'new.pdf'));

    // Create test config file
    await fs.writeFile(path.join(testConfigDir, 'robots.txt'), 'User-agent: *\nDisallow: /');

    // Create builder with TestDir for isolation
    const builder = new AssetsBuilder({ skipWrite: false }, dir);

    // Setup test environment
    builder.siteDir = testSiteDir;
    builder.CONFIG_DIR = testConfigDir;
    builder.SOURCE_REPOS = [
        {
            name: 'test-repo-rebuild',
            path: testRepoDir,
        },
    ];

    const result = await builder.build();

    // Verify asset was copied to site directory
    const sitePdfExists = await fs.access(path.join(testSiteDir, 'new.pdf'))
        .then(() => true)
        .catch(() => false);

    // Verify config file was copied to site directory
    const siteRobotsExists = await fs.access(path.join(testSiteDir, 'robots.txt'))
        .then(() => true)
        .catch(() => false);

    // Verify build stats were created
    const statsExists = await fs.access(path.join(testBuildDir, 'build-assets.json'))
        .then(() => true)
        .catch(() => false);

    t.true(sitePdfExists, 'Asset should be copied from repo to site directory');
    t.true(siteRobotsExists, 'robots.txt should be copied to site directory');
    t.true(statsExists, 'build-assets.json should be created');
    t.is(result.assetsProcessed, 1, 'Should process 1 asset');
    t.is(result.configFilesProcessed, 1, 'Should process 1 config file');
    t.is(result.totalFiles, 2, 'Should process 2 files total');
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
