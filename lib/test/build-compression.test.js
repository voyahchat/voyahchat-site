/**
 * AVA tests for compression build functionality
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { CompressionBuilder } = require('../build/build-compression');
const { TestDir } = require('./test-dir');

const brotliDecompress = promisify(zlib.brotliDecompress);
const gunzip = promisify(zlib.gunzip);

test.beforeEach(async (t) => {
    const dir = new TestDir();
    t.context.testDir = dir.getRoot();
    t.context.buildDir = path.join(t.context.testDir, '.build');
    t.context.siteDir = path.join(t.context.testDir, 'site');
    t.context.brotliDir = path.join(t.context.siteDir, 'brotli');
    t.context.gzipDir = path.join(t.context.siteDir, 'gzip');

    await fs.mkdir(t.context.buildDir, { recursive: true });
    await fs.mkdir(t.context.siteDir, { recursive: true });
});

// Helper function to create a test builder with isolated directories
function createTestBuilder(t, options = {}) {
    const builder = new CompressionBuilder(options);
    builder.siteDir = t.context.siteDir;
    builder.brotliDir = t.context.brotliDir;
    builder.gzipDir = t.context.gzipDir;
    return builder;
}

// Test 1: Finds compressible files
test('CompressionBuilder() - finds all compressible files', async (t) => {
    // Create test files
    await fs.writeFile(path.join(t.context.siteDir, 'test.html'), '<html></html>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.css'), 'body {}');
    await fs.writeFile(path.join(t.context.siteDir, 'test.js'), 'const x = 1;');
    await fs.writeFile(path.join(t.context.siteDir, 'test.svg'), '<svg></svg>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.xml'), '<xml></xml>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.txt'), 'text');
    await fs.writeFile(path.join(t.context.siteDir, 'test.png'), 'binary'); // Should be skipped

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    t.is(files.length, 6); // All except PNG
    t.true(files.includes('test.html'));
    t.true(files.includes('test.css'));
    t.true(files.includes('test.js'));
    t.true(files.includes('test.svg'));
    t.true(files.includes('test.xml'));
    t.true(files.includes('test.txt'));
    t.false(files.includes('test.png'));
});

// Test 2: Skips compression directories
test('CompressionBuilder() - skips brotli and gzip directories', async (t) => {
    await fs.mkdir(t.context.brotliDir, { recursive: true });
    await fs.mkdir(t.context.gzipDir, { recursive: true });
    await fs.writeFile(path.join(t.context.brotliDir, 'test.html.br'), 'compressed');
    await fs.writeFile(path.join(t.context.gzipDir, 'test.html.gz'), 'compressed');
    await fs.writeFile(path.join(t.context.siteDir, 'test.html'), '<html></html>');

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    t.is(files.length, 1);
    t.is(files[0], 'test.html');
});

// Test 3: Skips robots.txt
test('CompressionBuilder() - skips robots.txt', async (t) => {
    await fs.writeFile(path.join(t.context.siteDir, 'robots.txt'), 'User-agent: *');
    await fs.writeFile(path.join(t.context.siteDir, 'test.txt'), 'text');

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    t.is(files.length, 1);
    t.is(files[0], 'test.txt');
});

// Test 4: Compresses with Brotli
test('CompressionBuilder() - compresses with Brotli level 11', async (t) => {
    const content = '<html><body>Test content for compression</body></html>';
    await fs.writeFile(path.join(t.context.siteDir, 'test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} }; // Mock stats
    await builder.compressFile('test.html', stats);

    const brotliPath = path.join(t.context.brotliDir, 'test.html.br');
    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);

    t.true(brotliExists);

    const brotliContent = await fs.readFile(brotliPath);
    t.true(brotliContent.length < content.length);

    // Verify decompression works
    const decompressed = await brotliDecompress(brotliContent);
    t.is(decompressed.toString(), content);
});

// Test 5: Compresses with Gzip
test('CompressionBuilder() - compresses with Gzip level 9', async (t) => {
    // Use longer, more repetitive content that compresses well
    const content = '<html><body>' + 'Test content for compression. '.repeat(50) + '</body></html>';
    await fs.writeFile(path.join(t.context.siteDir, 'test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} }; // Mock stats
    await builder.compressFile('test.html', stats);

    const gzipPath = path.join(t.context.gzipDir, 'test.html.gz');
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(gzipExists);

    const gzipContent = await fs.readFile(gzipPath);
    t.true(gzipContent.length < content.length);

    // Verify decompression works
    const decompressed = await gunzip(gzipContent);
    t.is(decompressed.toString(), content);
});

// Test 6: Converts HTML paths to flat filenames
test('CompressionBuilder() - converts HTML paths to flat filenames', (t) => {
    const builder = new CompressionBuilder();

    t.is(builder.getFlatFilename('index.html'), 'index.html');
    t.is(builder.getFlatFilename('free/index.html'), 'free.html');
    t.is(builder.getFlatFilename('free/models.html'), 'free_models.html');
    t.is(builder.getFlatFilename('test.css'), 'test.css');
    t.is(builder.getFlatFilename('test.js'), 'test.js');
});

// Test 7: Handles empty files
test('CompressionBuilder() - handles empty files', async (t) => {
    await fs.writeFile(path.join(t.context.siteDir, 'empty.html'), '');

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };
    await builder.compressFile('empty.html', stats);

    // Should not create compressed files for empty files
    const brotliPath = path.join(t.context.brotliDir, 'empty.html.br');
    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);

    const gzipPath = path.join(t.context.gzipDir, 'empty.html.gz');
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.false(brotliExists);
    t.false(gzipExists);
});

// Test 8: Calculates compression ratios
test('CompressionBuilder() - calculates compression ratios correctly', async (t) => {
    const repeatText = 'Test content that should compress well because it has repetitive text. ';
    const content = '<html><body>' + repeatText + repeatText + '</body></html>';
    await fs.writeFile(path.join(t.context.siteDir, 'test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    let brotliRatio, gzipRatio;
    const stats = {
        add: (filename, source, size, metadata) => {
            if (metadata.algorithm === 'brotli') {
                brotliRatio = parseFloat(metadata.compressionRatio);
            } else if (metadata.algorithm === 'gzip') {
                gzipRatio = parseFloat(metadata.compressionRatio);
            }
        },
    };

    await builder.compressFile('test.html', stats);

    t.true(brotliRatio > 0);
    t.true(gzipRatio > 0);
    t.true(brotliRatio >= gzipRatio); // Brotli should compress at least as well as gzip
});

// Test 9: Creates compression directories
test('CompressionBuilder() - creates compression directories', async (t) => {
    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const brotliExists = await fs.access(t.context.brotliDir).then(() => true).catch(() => false);
    const gzipExists = await fs.access(t.context.gzipDir).then(() => true).catch(() => false);

    t.true(brotliExists);
    t.true(gzipExists);
});

// Test 10: Handles compression errors gracefully
test('CompressionBuilder() - handles compression errors gracefully', async (t) => {
    // This test verifies that the builder doesn't crash on edge cases
    const builder = createTestBuilder(t);

    await t.notThrowsAsync(async () => {
        await builder.build();
    });
});

// Test 11: Tracks statistics correctly
test('CompressionBuilder() - tracks statistics correctly', async (t) => {
    await fs.writeFile(path.join(t.context.siteDir, 'test.html'), '<html></html>');

    const builder = createTestBuilder(t, { skipWrite: true });

    const result = await builder.build();

    t.is(result.filesCompressed, 1);
    t.is(result.brotliFiles, 1);
    t.is(result.gzipFiles, 1);
    t.is(result.totalFiles, 2); // brotli + gzip for each file
});

// Test 12: Handles file system errors (EACCES - permission denied)
test('CompressionBuilder() - handles permission errors', async (t) => {
    const testFile = path.join(t.context.siteDir, 'restricted.html');
    await fs.writeFile(testFile, '<html>content</html>');

    // Remove read permissions
    await fs.chmod(testFile, 0o000);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };

    // Should throw permission error
    await t.throwsAsync(async () => {
        await builder.compressFile('restricted.html', stats);
    }, { code: 'EACCES' });

    // Restore permissions for cleanup
    await fs.chmod(testFile, 0o644);
});

// Test 13: Handles invalid file paths
test('CompressionBuilder() - handles invalid file paths', async (t) => {
    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };

    // Should throw error for non-existent file
    await t.throwsAsync(async () => {
        await builder.compressFile('nonexistent.html', stats);
    }, { code: 'ENOENT' });
});

// Test 14: Handles corrupted files during compression
test('CompressionBuilder() - handles corrupted files during compression', async (t) => {
    // Create a file with special characters that might cause issues
    const corruptedFile = path.join(t.context.siteDir, 'corrupted.html');
    await fs.writeFile(corruptedFile, Buffer.from([0xFF, 0xFE, 0xFD]));

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };

    // Should handle corrupted file gracefully
    await t.notThrowsAsync(async () => {
        await builder.compressFile('corrupted.html', stats);
    });
});

// Test 15: Handles directory creation errors
test('CompressionBuilder() - handles directory creation errors', async (t) => {
    const builder = createTestBuilder(t);

    // Create a file where directory should be (to cause EEXIST error)
    await fs.writeFile(t.context.brotliDir, 'this is a file, not a directory');

    // Should handle directory creation error
    await t.throwsAsync(async () => {
        await builder.ensureDirectories();
    });

    // Cleanup
    await fs.rm(t.context.brotliDir, { force: true });
});

// Test 16: Handles very large files
test('CompressionBuilder() - handles very large files', async (t) => {
    // Create a large file (1MB of repetitive content)
    const largeContent = 'x'.repeat(1024 * 1024);
    const largeFile = path.join(t.context.siteDir, 'large.html');
    await fs.writeFile(largeFile, largeContent);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };

    // Should handle large file without errors
    await t.notThrowsAsync(async () => {
        await builder.compressFile('large.html', stats);
    });

    // Verify compressed files were created
    const brotliPath = path.join(t.context.brotliDir, 'large.html.br');
    const gzipPath = path.join(t.context.gzipDir, 'large.html.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed file should exist');
    t.true(gzipExists, 'Gzip compressed file should exist');
});

// Test 17: Handles files with special characters in names
test('CompressionBuilder() - handles files with special characters', async (t) => {
    const specialFile = path.join(t.context.siteDir, 'file with spaces.html');
    await fs.writeFile(specialFile, '<html>content</html>');

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };

    // Should handle special characters in filename
    await t.notThrowsAsync(async () => {
        await builder.compressFile('file with spaces.html', stats);
    });

    // Verify compressed files were created
    const brotliPath = path.join(t.context.brotliDir, 'file with spaces.html.br');
    const gzipPath = path.join(t.context.gzipDir, 'file with spaces.html.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed file should exist');
    t.true(gzipExists, 'Gzip compressed file should exist');
});

// Test 18: Handles nested directory structures
test('CompressionBuilder() - handles nested directory structures', async (t) => {
    const nestedDir = path.join(t.context.siteDir, 'level1', 'level2');
    await fs.mkdir(nestedDir, { recursive: true });

    const nestedFile = path.join(nestedDir, 'nested.html');
    await fs.writeFile(nestedFile, '<html>nested content</html>');

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    // Should find files in nested directories
    t.true(files.some(f => f.includes('level1/level2/nested.html')), 'Should find nested files');
});
