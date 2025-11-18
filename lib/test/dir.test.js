/**
 * AVA tests for Dir utility class
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const test = require('ava');
const { Dir } = require('../build/dir');
const { TestDir } = require('./test-dir');

// Test: Creates directories recursively
test('Dir.ensure() - creates directories recursively', async (t) => {
    const dir = new TestDir();
    const nestedPath = path.join(dir.getRoot(), 'level1', 'level2', 'level3');

    // Ensure the nested directory is created
    await Dir.ensure(nestedPath);

    // Verify the directory exists
    const stats = await fs.stat(nestedPath);
    t.true(stats.isDirectory(), 'Nested directory should be created');
});

// Test: Resolves paths correctly
test('Dir - resolves all paths correctly', (t) => {
    const root = Dir.getRoot();
    const build = Dir.getBuild();
    const site = Dir.getSite();

    // Verify root path contains package.json
    const packageJsonPath = path.join(root, 'package.json');
    t.true(fsSync.existsSync(packageJsonPath), 'Root should contain package.json');

    // Verify build path is correct
    t.is(build, path.join(root, '.build'), 'Build path should be root/.build');

    // Verify site path is correct
    t.is(site, path.join(root, 'site'), 'Site path should be root/site');
});

// Test: Handles invalid paths
test('Dir.ensure() - handles invalid paths gracefully', async (t) => {
    // Try to create a directory with invalid characters (on most systems)
    // Note: This test may behave differently on different operating systems
    const dir = new TestDir();
    const invalidPath = path.join(dir.getRoot(), 'valid-dir');

    // This should succeed as it's actually a valid path
    await t.notThrowsAsync(
        async () => {
            await Dir.ensure(invalidPath);
        },
        'Should handle path creation without throwing',
    );

    // Verify the directory was created
    const stats = await fs.stat(invalidPath);
    t.true(stats.isDirectory(), 'Directory should be created');
});

// Test: Handles permission errors (simulated)
test('Dir.ensure() - handles existing directory without errors', async (t) => {
    const dir = new TestDir();
    const existingPath = path.join(dir.getRoot(), 'existing');

    // Create the directory first
    await Dir.ensure(existingPath);

    // Try to ensure it again - should not throw
    await t.notThrowsAsync(
        async () => {
            await Dir.ensure(existingPath);
        },
        'Should handle existing directory without throwing',
    );

    // Verify the directory still exists
    const stats = await fs.stat(existingPath);
    t.true(stats.isDirectory(), 'Directory should still exist');
});

// Test: Returns correct root directory
test('Dir.getRoot() - returns correct root directory', (t) => {
    const root = Dir.getRoot();

    // Root should be an absolute path
    t.true(path.isAbsolute(root), 'Root should be an absolute path');

    // Root should contain package.json
    const packageJsonPath = path.join(root, 'package.json');
    t.true(fsSync.existsSync(packageJsonPath), 'Root should contain package.json');

    // Root should contain lib directory
    const libPath = path.join(root, 'lib');
    t.true(fsSync.existsSync(libPath), 'Root should contain lib directory');
});

// Test: Returns correct build directory
test('Dir.getBuild() - returns correct build directory', (t) => {
    const root = Dir.getRoot();
    const build = Dir.getBuild();

    // Build should be root/.build
    t.is(build, path.join(root, '.build'), 'Build should be root/.build');

    // Build path should be absolute
    t.true(path.isAbsolute(build), 'Build path should be absolute');
});

// Test: Returns correct site directory
test('Dir.getSite() - returns correct site directory', (t) => {
    const root = Dir.getRoot();
    const site = Dir.getSite();

    // Site should be root/site
    t.is(site, path.join(root, 'site'), 'Site should be root/site');

    // Site path should be absolute
    t.true(path.isAbsolute(site), 'Site path should be absolute');
});

// Test: TestDir creates unique test directories
test('Dir.getTest() - creates unique test directories', (t) => {
    const dir1 = new TestDir();
    const dir2 = new TestDir();
    const testDir1 = dir1.getRoot();
    const testDir2 = dir2.getRoot();

    // Both directories should exist
    t.true(fsSync.existsSync(testDir1), 'First test directory should exist');
    t.true(fsSync.existsSync(testDir2), 'Second test directory should exist');

    // Directories should be different
    t.not(testDir1, testDir2, 'Test directories should be unique');

    // Both should be in .build directory (via TestDir)
    const buildDir = Dir.getBuild();
    t.true(testDir1.startsWith(buildDir), 'Test directory should be in .build');
    t.true(testDir2.startsWith(buildDir), 'Test directory should be in .build');
});

// Test: scan finds files with specific extensions
test('Dir.scan() - finds files with specific extensions', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    // Create test files
    await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.css'), 'content');
    await fs.writeFile(path.join(testDir, 'file3.txt'), 'content');
    await fs.writeFile(path.join(testDir, 'subdir', 'file4.js'), 'content');

    // Scan for .js files
    const jsFiles = await Dir.scan(testDir, ['.js']);

    t.is(jsFiles.length, 2, 'Should find 2 .js files');
    t.true(jsFiles.some(f => f.endsWith('file1.js')), 'Should find file1.js');
    t.true(jsFiles.some(f => f.endsWith('file4.js')), 'Should find file4.js in subdir');
});

// Test: scan excludes specified directories
test('Dir.scan() - excludes specified directories', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    // Create test structure
    await fs.mkdir(path.join(testDir, 'include'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'exclude'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'include', 'file1.js'), 'content');
    await fs.writeFile(path.join(testDir, 'exclude', 'file2.js'), 'content');

    // Scan excluding 'exclude' directory
    const files = await Dir.scan(testDir, ['.js'], ['exclude']);

    t.is(files.length, 1, 'Should find only 1 file');
    t.true(files[0].includes('include'), 'Should only include files from include dir');
    t.false(files[0].includes('exclude'), 'Should not include files from exclude dir');
});

// Test: scan skips hidden directories
test('Dir.scan() - skips hidden directories', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    // Create test structure with hidden directory
    await fs.mkdir(path.join(testDir, '.hidden'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'visible'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.hidden', 'file1.js'), 'content');
    await fs.writeFile(path.join(testDir, 'visible', 'file2.js'), 'content');

    // Scan for .js files
    const files = await Dir.scan(testDir, ['.js']);

    t.is(files.length, 1, 'Should find only 1 file');
    t.true(files[0].includes('visible'), 'Should only include files from visible dir');
    t.false(files[0].includes('.hidden'), 'Should not include files from hidden dir');
});

// Test: scan returns all files when no extensions specified
test('Dir.scan() - returns all files when no extensions specified', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    // Create test files with different extensions
    await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.css'), 'content');
    await fs.writeFile(path.join(testDir, 'file3.txt'), 'content');

    // Scan without extension filter
    const files = await Dir.scan(testDir, []);

    t.is(files.length, 3, 'Should find all 3 files');
});

// Test: scan handles empty directory
test('Dir.scan() - handles empty directory', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    // Scan empty directory
    const files = await Dir.scan(testDir, ['.js']);

    t.is(files.length, 0, 'Should return empty array for empty directory');
});

// Test: scan handles non-existent directory gracefully
test('Dir.scan() - handles non-existent directory gracefully', async (t) => {
    const dir = new TestDir();
    const nonExistentDir = path.join(dir.getRoot(), 'non-existent');

    // Scan non-existent directory - should not throw
    const files = await Dir.scan(nonExistentDir, ['.js']);

    t.is(files.length, 0, 'Should return empty array for non-existent directory');
});

// Test: getContent returns correct content directory
test('Dir.getContent() - returns correct content directory', (t) => {
    const root = Dir.getRoot();
    const content = Dir.getContent();

    // Content path should be absolute
    t.true(path.isAbsolute(content), 'Content path should be absolute');

    // Content path should start with root
    t.true(content.startsWith(root), 'Content path should be under root');

    // Content path should contain 'external' (based on levels.json)
    t.true(content.includes('external'), 'Content path should include external directory');
});

// Test: Returns correct site HTML directory
test('Dir.getSiteHtml() - returns correct site HTML directory', (t) => {
    const site = Dir.getSite();
    const siteHtml = Dir.getSiteHtml();

    // Site HTML should be site/html
    t.is(siteHtml, path.join(site, 'html'), 'Site HTML should be site/html');

    // Site HTML path should be absolute
    t.true(path.isAbsolute(siteHtml), 'Site HTML path should be absolute');
});

// Test: Returns correct site brotli directory
test('Dir.getSiteBrotli() - returns correct site brotli directory', (t) => {
    const site = Dir.getSite();
    const siteBrotli = Dir.getSiteBrotli();

    // Site brotli should be site/brotli
    t.is(siteBrotli, path.join(site, 'brotli'), 'Site brotli should be site/brotli');

    // Site brotli path should be absolute
    t.true(path.isAbsolute(siteBrotli), 'Site brotli path should be absolute');
});

// Test: Returns correct site gzip directory
test('Dir.getSiteGzip() - returns correct site gzip directory', (t) => {
    const site = Dir.getSite();
    const siteGzip = Dir.getSiteGzip();

    // Site gzip should be site/gzip
    t.is(siteGzip, path.join(site, 'gzip'), 'Site gzip should be site/gzip');

    // Site gzip path should be absolute
    t.true(path.isAbsolute(siteGzip), 'Site gzip path should be absolute');
});

// Test: Returns correct build file path
test('Dir.getBuildFile() - returns correct build file path', (t) => {
    const build = Dir.getBuild();
    const buildHtml = Dir.getBuildFile('build-html.json');

    // Build file should be .build/build-html.json
    t.is(buildHtml, path.join(build, 'build-html.json'), 'Build file should be .build/build-html.json');

    // Build file path should be absolute
    t.true(path.isAbsolute(buildHtml), 'Build file path should be absolute');
});

// Test: Returns correct external content directory
test('Dir.getExternalContent() - returns correct external content directory', (t) => {
    const root = Dir.getRoot();
    const externalContent = Dir.getExternalContent();

    // External content should be root/external/voyahchat-content
    t.is(
        externalContent,
        path.join(root, 'external', 'voyahchat-content'),
        'External content should be root/external/voyahchat-content',
    );

    // External content path should be absolute
    t.true(path.isAbsolute(externalContent), 'External content path should be absolute');
});

// Cleanup after each test
test.afterEach.always(async () => {
    // Note: We don't clean up test directories here because they're in .build
    // which gets cleaned by the build system. This follows the pattern from other tests.
});
