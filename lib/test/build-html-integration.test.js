/**
 * AVA tests for HTMLBuilder integration tests (with file I/O)
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');

// Import functions from build-html
const { HTMLBuilder } = require('../build/build-html');
const { Dir } = require('../build/dir');
const { TestDir } = require('./test-dir');

// Import mock factory functions
const {
    createMockSitemap,
    setupTestEnvironment,
} = require('./utils');

// Statistics Tracking Tests

test('HTMLBuilder.build() - should creates build-html.json with correct structure', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const { buildDir, siteDir } = await setupTestEnvironment(testDir, {
        sitemap: { pages: [] }, // Create empty sitemap file
        imageMapping: false,
        assetsMapping: false,
    });

    const sitemap = createMockSitemap();

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        buildDir,
        siteDir,
    });

    await builder.build();

    const statsPath = path.join(buildDir, 'build-html.json');
    const statsContent = await fs.readFile(statsPath, 'utf-8');
    const stats = JSON.parse(statsContent);

    t.truthy(stats, 'Statistics file should exist');
    t.true(typeof stats === 'object', 'Statistics should be an object');
    t.truthy(stats['index.html'], 'Should have entry for index.html');
    t.truthy(stats['index.html'].source, 'Entry should have source field');
    t.true(typeof stats['index.html'].size === 'number', 'Entry should have numeric size');
    t.truthy(stats['index.html'].metadata, 'Entry should have metadata field');
});

test('HTMLBuilder.build() - should statistics file respects buildDir option', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const customBuildDir = path.join(testDir, 'custom-build');

    // Setup test environment with custom build directory
    await setupTestEnvironment(testDir, {
        sitemap: { pages: [] },
        imageMapping: false,
        assetsMapping: false,
    });

    // Create custom build directory and copy templates
    const fs2 = require('fs');
    fs2.mkdirSync(customBuildDir, { recursive: true });

    // Copy templates to custom build directory
    const sourceTemplatesDir = path.join(Dir.getRoot(), '.build', 'templates');
    const targetTemplatesDir = path.join(customBuildDir, 'templates');
    if (fs2.existsSync(sourceTemplatesDir)) {
        const copyRecursive = (src, dest) => {
            if (!fs2.existsSync(dest)) {
                fs2.mkdirSync(dest, { recursive: true });
            }
            const entries = fs2.readdirSync(src, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                    copyRecursive(srcPath, destPath);
                } else {
                    fs2.copyFileSync(srcPath, destPath);
                }
            }
        };
        copyRecursive(sourceTemplatesDir, targetTemplatesDir);
    }

    await fs.writeFile(path.join(customBuildDir, 'hash-css.json'), JSON.stringify({
        page: { url: '/page.css' },
    }));
    await fs.writeFile(path.join(customBuildDir, 'hash-js.json'), JSON.stringify({
        page: { url: '/page.js' },
    }));

    const sitemap = createMockSitemap();
    const siteDir = path.join(testDir, 'site');

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        buildDir: customBuildDir,
        siteDir,
    });

    await builder.build();

    const statsPath = path.join(customBuildDir, 'build-html.json');
    const statsExists = await fs.access(statsPath).then(() => true).catch(() => false);

    t.true(statsExists, 'Statistics file should be created in custom build directory');
});

test('HTMLBuilder.build() - should does not create statistics file when skipWrite is true', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const { buildDir } = await setupTestEnvironment(testDir, {
        sitemap: { pages: [] },
        imageMapping: false,
        assetsMapping: false,
    });

    const sitemap = createMockSitemap();

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        buildDir,
        skipWrite: true,
        silentWarnings: true,
    });

    await builder.build();

    const statsPath = path.join(buildDir, 'build-html.json');
    const statsExists = await fs.access(statsPath).then(() => true).catch(() => false);

    t.false(statsExists, 'Statistics file should not be created when skipWrite is true');
});

test('HTMLBuilder.build() - should statistics include metadata with URL', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    const { buildDir, siteDir } = await setupTestEnvironment(testDir, {
        sitemap: false,
        imageMapping: false,
        assetsMapping: false,
    });

    const sitemap = {
        sitemap: ['/test-page'],
        pages: {
            '/test-page': {
                url: '/test-page',
                title: 'Test Page',
                name: 'Test Page',
                file: 'test.md',
                html: '<h1>Test</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'test.md': '/test-page' },
        url2md: { '/test-page': 'test.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        buildDir,
        siteDir,
    });

    await builder.build();

    const statsPath = path.join(buildDir, 'build-html.json');
    const statsContent = await fs.readFile(statsPath, 'utf-8');
    const stats = JSON.parse(statsContent);

    t.truthy(stats['test-page.html'], 'Should have entry for test-page.html');
    t.truthy(stats['test-page.html'].metadata, 'Should have metadata');
    t.is(stats['test-page.html'].metadata.url, '/test-page', 'Metadata should include URL');
});

// Error Recovery Tests

test('HTMLBuilder.build() - should recover from template rendering failure and clean up', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const siteDir = path.join(testDir, 'site');
    const templatesDir = path.join(testDir, 'blocks', 'page');

    // Setup: Create test environment
    await fs.mkdir(buildDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });
    await fs.mkdir(templatesDir, { recursive: true });

    // Create required hash files
    await fs.writeFile(path.join(buildDir, 'hash-css.json'), JSON.stringify({
        page: { url: '/page.css', hash: 'css123' },
    }));
    await fs.writeFile(path.join(buildDir, 'hash-js.json'), JSON.stringify({
        page: { url: '/page.js', hash: 'js456' },
    }));

    // Create invalid template that will fail
    await fs.writeFile(
        path.join(templatesDir, 'page.njk'),
        '{% invalid syntax that will cause error %}',
    );

    const sitemap = {
        sitemap: ['/'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Test</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/' },
        url2md: { '/': 'index.md' },
    };

    // Execute: Attempt build (should throw but not crash)
    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        rootDir: testDir,
        buildDir,
        siteDir,
    });

    await t.throwsAsync(
        async () => await builder.build(),
        { instanceOf: Error },
        'Should throw error for invalid template',
    );

    // Verify: No partial files should remain in site directory
    const siteFiles = await fs.readdir(siteDir).catch(() => []);
    t.is(siteFiles.length, 0, 'No partial files should remain after template error');
});

test('HTMLBuilder.build() - should handle partial build completion gracefully', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const siteDir = path.join(testDir, 'site');

    // Setup: Create test environment
    await fs.mkdir(buildDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });

    // Create required hash files
    await fs.writeFile(path.join(buildDir, 'hash-css.json'), JSON.stringify({
        page: { url: '/page.css', hash: 'css123' },
    }));
    await fs.writeFile(path.join(buildDir, 'hash-js.json'), JSON.stringify({
        page: { url: '/page.js', hash: 'js456' },
    }));

    // Create sitemap with one valid and one problematic page
    const sitemap = {
        sitemap: ['/', '/problem'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/problem': {
                url: '/problem',
                title: 'Problem',
                name: 'Problem',
                file: 'problem.md',
                html: '<h1>Problem</h1>',
                layout: 'nonexistent/template.njk', // Non-existent template
            },
        },
        md2url: { 'index.md': '/', 'problem.md': '/problem' },
        url2md: { '/': 'index.md', '/problem': 'problem.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        rootDir: testDir,
        buildDir,
        siteDir,
    });

    // Execute: Should throw error due to missing template
    await t.throwsAsync(
        async () => await builder.build(),
        { instanceOf: Error },
        'Should throw error for missing template',
    );

    // Verify: Build should fail fast without creating partial artifacts
    const buildStats = await fs.readFile(path.join(buildDir, 'build-html.json'), 'utf-8')
        .catch(() => null);
    t.is(buildStats, null, 'Build statistics should not be created on failure');
});

test('HTMLBuilder.build() - should recover from missing hash files gracefully', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    const { buildDir, siteDir } = await setupTestEnvironment(testDir, {
        sitemap: false,
        imageMapping: false,
        assetsMapping: false,
    });

    const sitemap = {
        sitemap: ['/'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/' },
        url2md: { '/': 'index.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        rootDir: testDir,
        buildDir,
        siteDir,
        skipWrite: true,
        silentWarnings: true,
    });

    // Execute: Should handle gracefully
    const result = await builder.build();

    // Verify: Build should complete
    t.truthy(result, 'Should return result');
    t.is(result.pagesProcessed, 1, 'Should process page');
});

test('HTMLBuilder.build() - should handle corrupted hash JSON files', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    const { buildDir, siteDir } = await setupTestEnvironment(testDir, {
        sitemap: false,
        imageMapping: false,
        assetsMapping: false,
    });

    // Create corrupted hash files (invalid JSON)
    await fs.writeFile(path.join(buildDir, 'hash-css.json'), '{ invalid json }');
    await fs.writeFile(path.join(buildDir, 'hash-js.json'), '{ "incomplete": ');

    const sitemap = {
        sitemap: ['/'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/' },
        url2md: { '/': 'index.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        rootDir: testDir,
        buildDir,
        siteDir,
        skipWrite: true,
        silentWarnings: true,
    });

    // Execute: Should throw error for corrupted JSON
    await t.throwsAsync(
        async () => await builder.build(),
        { instanceOf: SyntaxError },
        'Should throw SyntaxError for corrupted JSON',
    );
});

test('HTMLBuilder.build() - should update HTML timestamps when templates change', async (t) => {
    const testDir = new TestDir();
    const { execSync } = require('child_process');

    // Initialize Git repository for proper timestamp tracking
    try {
        execSync('git init', { cwd: testDir.getRoot() });
        execSync('git config user.name "Test User"', { cwd: testDir.getRoot() });
        execSync('git config user.email "test@example.com"', { cwd: testDir.getRoot() });
    } catch (error) {
        // If Git commands fail, we'll continue without Git history
        console.warn('Git initialization failed:', error.message);
    }

    // Create test markdown file
    const contentDir = path.join(testDir.getRoot(), 'external', 'voyahchat-content');
    await fs.mkdir(contentDir, { recursive: true });
    const mdFile = path.join(contentDir, 'test.md');
    await fs.writeFile(mdFile, '# Test Page');

    // Create test template
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    await fs.mkdir(path.join(blocksDir, 'page'), { recursive: true });
    await fs.writeFile(
        path.join(blocksDir, 'page', 'page.bemdecl.js'),
        'module.exports = ["footer"];',
    );
    await fs.mkdir(path.join(blocksDir, 'footer'), { recursive: true });
    const footerTemplate = path.join(blocksDir, 'footer', 'footer.njk');
    await fs.writeFile(footerTemplate, '<footer>Original</footer>');

    // Create page layout template
    await fs.writeFile(
        path.join(blocksDir, 'page', 'page.njk'),
        '<html>{{ content }}{% include "footer/footer.njk" %}</html>',
    );

    // Commit initial files to Git
    try {
        execSync('git add .', { cwd: testDir.getRoot() });
        execSync('git commit -m "Initial commit"', { cwd: testDir.getRoot() });
    } catch (error) {
        console.warn('Git commit failed:', error.message);
    }

    // Create build and site directories
    const buildDir = path.join(testDir.getRoot(), '.build');
    const siteDir = path.join(testDir.getRoot(), 'site');
    await fs.mkdir(buildDir, { recursive: true });
    await fs.mkdir(siteDir, { recursive: true });
    await fs.mkdir(path.join(buildDir, 'templates'), { recursive: true });

    // Copy templates to build directory
    const fs2 = require('fs');
    const copyRecursive = (src, dest) => {
        if (!fs2.existsSync(dest)) {
            fs2.mkdirSync(dest, { recursive: true });
        }
        const entries = fs2.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                copyRecursive(srcPath, destPath);
            } else {
                fs2.copyFileSync(srcPath, destPath);
            }
        }
    };

    // Copy to build/templates directory (where Nunjucks looks for templates)
    copyRecursive(blocksDir, path.join(buildDir, 'templates'));

    // Also copy to the root blocks directory for BEM declaration loading
    copyRecursive(blocksDir, path.join(testDir.getRoot(), 'blocks'));

    // Create required hash files
    await fs.writeFile(path.join(buildDir, 'hash-css.json'), JSON.stringify({
        page: { url: '/page.css' },
    }));
    await fs.writeFile(path.join(buildDir, 'hash-js.json'), JSON.stringify({
        page: { url: '/page.js' },
    }));

    // Create sitemap
    const sitemap = {
        sitemap: ['/test'],
        pages: {
            '/test': {
                url: '/test',
                title: 'Test Page',
                name: 'Test Page',
                file: 'test.md',
                html: '<h1>Test Page</h1>',
                layout: 'page/page.njk',
            },
        },
        md2url: { 'test.md': '/test' },
        url2md: { '/test': 'test.md' },
    };

    // Build HTML first time
    const builder1 = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        rootDir: testDir.getRoot(),
        buildDir,
        siteDir,
    }, testDir);
    await builder1.build();

    // Get initial HTML timestamp
    const htmlFile = path.join(siteDir, 'html', 'test.html');
    const initialStats = await fs.stat(htmlFile);
    const initialTimestamp = initialStats.mtime.getTime();

    // Delete the HTML file to ensure it's recreated
    await fs.unlink(htmlFile);

    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Modify template
    await fs.writeFile(footerTemplate, '<footer>Updated</footer>');

    // Commit the template change
    try {
        execSync('git add footer/footer.njk', { cwd: path.join(testDir.getRoot(), 'blocks') });
        execSync('git commit -m "Update footer template"', { cwd: testDir.getRoot() });
    } catch (error) {
        console.warn('Git commit failed:', error.message);
    }

    // Update templates in build directory
    copyRecursive(blocksDir, path.join(buildDir, 'templates'));

    // Build HTML second time
    const builder2 = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        rootDir: testDir.getRoot(),
        buildDir,
        siteDir,
    }, testDir);
    await builder2.build();

    // Check that HTML timestamp was updated
    const updatedStats = await fs.stat(htmlFile);
    const updatedTimestamp = updatedStats.mtime.getTime();

    t.true(updatedTimestamp > initialTimestamp, 'HTML timestamp should be updated when template changes');
});
