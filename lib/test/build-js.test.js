/**
 * AVA tests for JavaScript build functionality
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const JSBuilder = require('../build/build-js');
const { TestDir } = require('./test-dir');

test.afterEach.always(async (t) => {
    // Restore mocked functions
    if (t.context.originalConsoleWarn) {
        console.warn = t.context.originalConsoleWarn;
    }
});

// Test 1: Basic instantiation
test('JSBuilder() - should create instance with default bundle', (t) => {
    const builder = new JSBuilder();
    t.is(builder.bundle, 'page');
    t.true(Array.isArray(builder.sourcePaths));
    t.true(builder.sourcePaths.length > 0);
});

// Test 2: Custom bundle name
test('JSBuilder() - should create instance with custom bundle', (t) => {
    const builder = new JSBuilder('custom');
    t.is(builder.bundle, 'custom');
});

// Test 3: Scans for JavaScript files recursively
test('JSBuilder.scanForJavaScriptFiles() - should scan for JavaScript files recursively', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('page', testDir);

    // Create test JS files in nested structure
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    const blockDir = path.join(blocksDir, 'test-block');
    await fs.mkdir(blockDir, { recursive: true });
    await fs.writeFile(path.join(blockDir, 'test-block.js'), 'console.log("test");');

    const nestedDir = path.join(blockDir, 'nested');
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(nestedDir, 'nested.js'), 'console.log("nested");');

    // Mock sourcePaths to use test directory
    builder.sourcePaths = [blocksDir];

    const files = await builder.scanForJavaScriptFiles();

    t.true(files.length >= 2);
    t.true(files.some(f => f.includes('test-block.js')));
    t.true(files.some(f => f.includes('nested.js')));
});

// Test 4: Reads BEM declaration correctly
test('JSBuilder.generateBundle() - should read BEM declaration correctly', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('page', testDir);

    // Create bemdecl file
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    const pageDir = path.join(blocksDir, 'page');
    await fs.mkdir(pageDir, { recursive: true });
    const bemdeclPath = path.join(pageDir, 'page.bemdecl.js');
    await fs.writeFile(bemdeclPath, 'module.exports = ["block1", "block2"];');

    // Create block JS files
    const block1Dir = path.join(blocksDir, 'block1');
    const block2Dir = path.join(blocksDir, 'block2');
    await fs.mkdir(block1Dir, { recursive: true });
    await fs.mkdir(block2Dir, { recursive: true });
    await fs.writeFile(path.join(block1Dir, 'block1.js'), 'const a = 1;');
    await fs.writeFile(path.join(block2Dir, 'block2.js'), 'const b = 2;');

    // Mock sourcePaths
    builder.sourcePaths = [blocksDir];

    const result = await builder.generateBundle();

    t.truthy(result);
    t.truthy(result.content);
    t.true(Array.isArray(result.sourceFiles));
    t.is(result.sourceFiles.length, 2);
});

// Test 5: Bundles multiple JS files in correct order
test('JSBuilder.generateBundle() - should bundle multiple JS files in correct order', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('page', testDir);

    // Create BEM blocks with JS
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    const block1Dir = path.join(blocksDir, 'block1');
    const block2Dir = path.join(blocksDir, 'block2');

    await fs.mkdir(block1Dir, { recursive: true });
    await fs.mkdir(block2Dir, { recursive: true });

    await fs.writeFile(path.join(block1Dir, 'block1.js'), '/* block1 */\nconst a = 1;');
    await fs.writeFile(path.join(block2Dir, 'block2.js'), '/* block2 */\nconst b = 2;');

    // Create bemdecl
    const pageDir = path.join(blocksDir, 'page');
    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(
        path.join(pageDir, 'page.bemdecl.js'),
        'module.exports = ["block1", "block2"];',
    );

    builder.sourcePaths = [blocksDir];

    const result = await builder.generateBundle();

    t.truthy(result.content);
    t.true(result.content.includes('block1'));
    t.true(result.content.includes('block2'));
    t.true(result.content.indexOf('block1') < result.content.indexOf('block2'));
});

// Test 6: Minifies JavaScript with Terser
test('JSBuilder.minifyJS() - should minify JavaScript with Terser', async (t) => {
    const js = 'function test() { return 1 + 2; }';
    const minified = await JSBuilder.minifyJS(js);

    t.true(minified.length < js.length);
    t.false(minified.includes('  ')); // No double spaces
    t.true(minified.includes('function'));
});

// Test 7: Generates consistent hashes
test('JSBuilder.generateHash() - should generate consistent hashes', (t) => {
    const js = 'const x = 1;';
    const hash1 = JSBuilder.generateHash(js);
    const hash2 = JSBuilder.generateHash(js);

    t.is(hash1, hash2);
    t.is(hash1.length, 16);
    t.is(typeof hash1, 'string');
});

// Test 8: Handles missing bemdecl.js gracefully
test('JSBuilder.generateBundle() - should handle missing bemdecl.js gracefully', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('nonexistent', testDir);
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    await fs.mkdir(blocksDir, { recursive: true });
    builder.sourcePaths = [blocksDir];

    const result = await builder.generateBundle();

    t.is(result.content, null);
    t.deepEqual(result.sourceFiles, []);
});

// Test 9: Handles Terser minification errors
test('JSBuilder.minifyJS() - should handle Terser minification errors', async (t) => {
    const invalidJS = 'function test() { return 1 +'; // Incomplete syntax

    // Mock console.warn to suppress expected warning
    t.context.originalConsoleWarn = console.warn;
    console.warn = () => {};

    const result = await JSBuilder.minifyJS(invalidJS);

    // Should fallback to original code
    t.is(result, invalidJS);
});

// Test 10: Creates empty hash file when no JS found
test('JSBuilder.saveEmptyHashFile() - should create empty hash file when no JS found', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('empty', testDir);

    const buildDir = testDir.getBuild();
    await fs.mkdir(buildDir, { recursive: true });

    await builder.saveEmptyHashFile();

    const hashPath = path.join(buildDir, 'hash-js.json');
    const content = await fs.readFile(hashPath, 'utf8');
    const data = JSON.parse(content);

    t.is(data.empty.hash, 'empty');
    t.is(data.empty.filename, 'empty.js');
    t.is(data.empty.url, '/empty.js');
    t.deepEqual(data.empty.source, []);
});

// Test 11: Handles BEM elements correctly
test('JSBuilder.generateBundle() - should handle BEM elements correctly', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('page', testDir);

    // Create BEM element
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    const blockDir = path.join(blocksDir, 'block');
    const elementDir = path.join(blockDir, '__element');

    await fs.mkdir(elementDir, { recursive: true });
    await fs.writeFile(
        path.join(elementDir, 'block__element.js'),
        'console.log("element");',
    );

    // Create bemdecl with element
    const pageDir = path.join(blocksDir, 'page');
    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(
        path.join(pageDir, 'page.bemdecl.js'),
        'module.exports = ["block__element"];',
    );

    builder.sourcePaths = [blocksDir];

    const result = await builder.generateBundle();

    t.truthy(result.content);
    t.true(result.content.includes('element'));
});

// Test 12: Handles malformed bemdecl.js with invalid syntax
test('JSBuilder.generateBundle() - should handle malformed bemdecl.js with invalid syntax', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('malformed', testDir);

    // Create malformed bemdecl file with invalid JavaScript
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    const pageDir = path.join(blocksDir, 'malformed');
    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(
        path.join(pageDir, 'malformed.bemdecl.js'),
        'module.exports = [invalid syntax here',
    );

    builder.sourcePaths = [blocksDir];

    const result = await builder.generateBundle();

    // Should handle error gracefully and return null
    t.is(result.content, null);
    t.deepEqual(result.sourceFiles, []);
});

// Test 13: Handles file system errors (EACCES)
test('JSBuilder.generateBundle() - should handle file system permission errors', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('permission-test', testDir);

    // Create bemdecl and block files
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    const pageDir = path.join(blocksDir, 'permission-test');
    const blockDir = path.join(blocksDir, 'restricted-block');
    await fs.mkdir(pageDir, { recursive: true });
    await fs.mkdir(blockDir, { recursive: true });

    await fs.writeFile(
        path.join(pageDir, 'permission-test.bemdecl.js'),
        'module.exports = ["restricted-block"];',
    );

    const restrictedFile = path.join(blockDir, 'restricted-block.js');
    await fs.writeFile(restrictedFile, 'const x = 1;');

    // Remove read permissions
    await fs.chmod(restrictedFile, 0o000);

    builder.sourcePaths = [blocksDir];

    try {
        const result = await builder.generateBundle();

        // Should handle permission error gracefully
        t.truthy(result);
        // Content might be null or partial depending on error handling
        t.true(Array.isArray(result.sourceFiles));
    } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedFile, 0o644).catch(() => {});
    }
});

// Test 14: Handles empty bemdecl.js
test('JSBuilder.generateBundle() - should handle empty bemdecl.js', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('empty-bemdecl', testDir);

    // Create empty bemdecl file
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    const pageDir = path.join(blocksDir, 'empty-bemdecl');
    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(
        path.join(pageDir, 'empty-bemdecl.bemdecl.js'),
        'module.exports = [];',
    );

    builder.sourcePaths = [blocksDir];

    const result = await builder.generateBundle();

    // Should handle empty declaration gracefully
    t.is(result.content, null);
    t.deepEqual(result.sourceFiles, []);
});

// Test 15: Handles non-existent JS files in bemdecl
test('JSBuilder.generateBundle() - should skip non-existent JS files in bemdecl', async (t) => {
    const testDir = new TestDir();
    const builder = new JSBuilder('missing-files', testDir);

    // Create bemdecl referencing non-existent blocks
    const blocksDir = path.join(testDir.getRoot(), 'blocks');
    const pageDir = path.join(blocksDir, 'missing-files');
    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(
        path.join(pageDir, 'missing-files.bemdecl.js'),
        'module.exports = ["nonexistent-block", "another-missing"];',
    );

    builder.sourcePaths = [blocksDir];

    const result = await builder.generateBundle();

    // Should handle missing files gracefully
    t.truthy(result);
    t.is(result.content, null);
    t.deepEqual(result.sourceFiles, []);
});
