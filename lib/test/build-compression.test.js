/**
 * AVA tests for compression build functionality
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const zstd = require('@mongodb-js/zstd');
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
    t.context.zstdDir = path.join(t.context.siteDir, 'zstd');

    await fs.mkdir(t.context.buildDir, { recursive: true });
    await fs.mkdir(t.context.siteDir, { recursive: true });
});

// Helper function to create a test builder with isolated directories
function createTestBuilder(t, options = {}) {
    const builder = new CompressionBuilder(options);
    builder.siteDir = t.context.siteDir;
    builder.brotliDir = t.context.brotliDir;
    builder.gzipDir = t.context.gzipDir;
    builder.zstdDir = t.context.zstdDir;
    return builder;
}

// Test 1: Finds compressible files
test('CompressionBuilder() - finds all compressible files', async (t) => {
    // Create test files
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), '<html></html>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.css'), 'body {}');
    await fs.writeFile(path.join(t.context.siteDir, 'test.js'), 'const x = 1;');
    await fs.writeFile(path.join(t.context.siteDir, 'test.svg'), '<svg></svg>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.xml'), '<xml></xml>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.txt'), 'text');
    await fs.writeFile(path.join(t.context.siteDir, 'test.png'), 'binary'); // Should be skipped

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    t.is(files.length, 6); // All except PNG
    t.true(files.includes('html/test.html'));
    t.true(files.includes('test.css'));
    t.true(files.includes('test.js'));
    t.true(files.includes('test.svg'));
    t.true(files.includes('test.xml'));
    t.true(files.includes('test.txt'));
    t.false(files.includes('test.png'));
});

// Test 2: Skips compression directories
test('CompressionBuilder() - skips brotli, gzip, and zstd directories', async (t) => {
    await fs.mkdir(t.context.brotliDir, { recursive: true });
    await fs.mkdir(t.context.gzipDir, { recursive: true });
    await fs.mkdir(t.context.zstdDir, { recursive: true });
    await fs.writeFile(path.join(t.context.brotliDir, 'test.html.br'), 'compressed');
    await fs.writeFile(path.join(t.context.gzipDir, 'test.html.gz'), 'compressed');
    await fs.writeFile(path.join(t.context.zstdDir, 'test.html.zst'), 'compressed');
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), '<html></html>');

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    t.is(files.length, 1);
    t.is(files[0], 'html/test.html');
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
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} }; // Mock stats
    await builder.compressFile('html/test.html', stats);

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
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} }; // Mock stats
    await builder.compressFile('html/test.html', stats);

    const gzipPath = path.join(t.context.gzipDir, 'test.html.gz');
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(gzipExists);

    const gzipContent = await fs.readFile(gzipPath);
    t.true(gzipContent.length < content.length);

    // Verify decompression works
    const decompressed = await gunzip(gzipContent);
    t.is(decompressed.toString(), content);
});

// Test 6: Converts all paths to flat filenames (basename only)
test('CompressionBuilder() - converts all paths to flat filenames', (t) => {
    const builder = new CompressionBuilder();

    // HTML files - should be flattened
    t.is(builder.getFlatFilename('html/index.html'), 'index.html');
    t.is(builder.getFlatFilename('html/free.html'), 'free.html');
    t.is(builder.getFlatFilename('html/free_models.html'), 'free_models.html');

    // Regular files - should be flattened
    t.is(builder.getFlatFilename('test.css'), 'test.css');
    t.is(builder.getFlatFilename('test.js'), 'test.js');

    // Files with paths - should be flattened
    t.is(builder.getFlatFilename('css/styles.css'), 'styles.css');
    t.is(builder.getFlatFilename('js/app.js'), 'app.js');
    t.is(builder.getFlatFilename('assets/icons/logo.svg'), 'logo.svg');

    // Hash-based files with extensions - already flat, should remain as-is
    t.is(builder.getFlatFilename('9008915a30a21706.css'), '9008915a30a21706.css');
    t.is(builder.getFlatFilename('904685a5dab014e8.js'), '904685a5dab014e8.js');
    t.is(builder.getFlatFilename('_i0e5f33c7435efacf'), '_i0e5f33c7435efacf');
});

// Test 7: Handles empty files
test('CompressionBuilder() - handles empty files', async (t) => {
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/empty.html'), '');

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };
    await builder.compressFile('html/empty.html', stats);

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
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    let brotliRatio, gzipRatio, zstdRatio;
    const stats = {
        add: (filename, source, size, metadata) => {
            if (metadata.algorithm === 'brotli') {
                brotliRatio = parseFloat(metadata.compressionRatio);
            } else if (metadata.algorithm === 'gzip') {
                gzipRatio = parseFloat(metadata.compressionRatio);
            } else if (metadata.algorithm === 'zstd') {
                zstdRatio = parseFloat(metadata.compressionRatio);
            }
        },
        files: [],
    };

    await builder.compressFile('html/test.html', stats);

    t.true(brotliRatio > 0);
    t.true(gzipRatio > 0);
    t.true(brotliRatio >= gzipRatio); // Brotli should compress at least as well as gzip

    // Zstd is only saved if better than brotli, so it might not be present
    if (zstdRatio !== undefined) {
        t.true(zstdRatio > 0);
        t.true(zstdRatio >= gzipRatio); // If saved, zstd should compress at least as well as gzip
    }
});

// Test 9: Creates compression directories
test('CompressionBuilder() - creates compression directories', async (t) => {
    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const brotliExists = await fs.access(t.context.brotliDir).then(() => true).catch(() => false);
    const gzipExists = await fs.access(t.context.gzipDir).then(() => true).catch(() => false);
    const zstdExists = await fs.access(t.context.zstdDir).then(() => true).catch(() => false);

    t.true(brotliExists);
    t.true(gzipExists);
    t.true(zstdExists);
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
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), '<html></html>');

    const builder = createTestBuilder(t, { skipWrite: true });

    const result = await builder.build();

    t.is(result.filesCompressed, 1);
    t.is(result.brotliFiles, 1);
    t.is(result.gzipFiles, 1);
    // zstdFiles can be 0 or 1 depending on whether zstd compresses better than brotli
    t.true(result.zstdFiles >= 0 && result.zstdFiles <= 1);
    t.true(result.totalFiles >= 2 && result.totalFiles <= 3); // brotli + gzip always, zstd conditionally
});

// Test 12: Handles file system errors (EACCES - permission denied)
test('CompressionBuilder() - handles permission errors', async (t) => {
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    const testFile = path.join(t.context.siteDir, 'html/restricted.html');
    await fs.writeFile(testFile, '<html>content</html>');

    // Remove read permissions
    await fs.chmod(testFile, 0o000);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };

    // Should throw permission error
    await t.throwsAsync(async () => {
        await builder.compressFile('html/restricted.html', stats);
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
        await builder.compressFile('html/nonexistent.html', stats);
    }, { code: 'ENOENT' });
});

// Test 14: Handles corrupted files during compression
test('CompressionBuilder() - handles corrupted files during compression', async (t) => {
    // Create a file with special characters that might cause issues
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    const corruptedFile = path.join(t.context.siteDir, 'html/corrupted.html');
    await fs.writeFile(corruptedFile, Buffer.from([0xFF, 0xFE, 0xFD]));

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };

    // Should handle corrupted file gracefully
    await t.notThrowsAsync(async () => {
        await builder.compressFile('html/corrupted.html', stats);
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
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    const largeFile = path.join(t.context.siteDir, 'html/large.html');
    await fs.writeFile(largeFile, largeContent);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {} };

    // Should handle large file without errors
    await t.notThrowsAsync(async () => {
        await builder.compressFile('html/large.html', stats);
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

// Test 19: Compresses with Zstd only when better than Brotli
test('CompressionBuilder() - compresses with Zstd only when better than Brotli', async (t) => {
    // Use longer, more repetitive content that compresses well
    const content = '<html><body>' + 'Test content for compression. '.repeat(50) + '</body></html>';
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {}, files: [] }; // Mock stats
    await builder.compressFile('html/test.html', stats);

    const zstdPath = path.join(t.context.zstdDir, 'test.html.zst');
    const brotliPath = path.join(t.context.brotliDir, 'test.html.br');

    const zstdExists = await fs.access(zstdPath).then(() => true).catch(() => false);
    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli should always exist');

    // If zstd exists, verify it's smaller than brotli and decompresses correctly
    if (zstdExists) {
        const zstdContent = await fs.readFile(zstdPath);
        const brotliContent = await fs.readFile(brotliPath);

        t.true(zstdContent.length < brotliContent.length, 'Zstd should be smaller than Brotli when saved');
        t.true(zstdContent.length < content.length, 'Zstd should be smaller than original');

        // Verify decompression works
        const decompressed = await zstd.decompress(zstdContent);
        t.is(decompressed.toString(), content);
    }
});

// Test 20: When zstd is saved, it's better than brotli
test('CompressionBuilder() - when zstd is saved, it is better than brotli', async (t) => {
    // Use longer, more repetitive content that compresses well
    const content = '<html><body>' + 'Test content for compression. '.repeat(100) + '</body></html>';
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {}, files: [] };
    await builder.compressFile('html/test.html', stats);

    const zstdPath = path.join(t.context.zstdDir, 'test.html.zst');
    const brotliPath = path.join(t.context.brotliDir, 'test.html.br');
    const gzipPath = path.join(t.context.gzipDir, 'test.html.gz');

    const zstdExists = await fs.access(zstdPath).then(() => true).catch(() => false);
    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli should always exist');
    t.true(gzipExists, 'Gzip should always exist');

    // If zstd was saved, it must be better than brotli
    if (zstdExists) {
        const zstdContent = await fs.readFile(zstdPath);
        const brotliContent = await fs.readFile(brotliPath);

        t.true(zstdContent.length < brotliContent.length, 'Saved zstd must be smaller than brotli');
    }
});

// Test 21: Handles empty files (no compression)
test('CompressionBuilder() - handles empty files for all formats', async (t) => {
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/empty.html'), '');

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {}, files: [] };
    await builder.compressFile('html/empty.html', stats);

    // Should not create any compressed files for empty files
    const brotliPath = path.join(t.context.brotliDir, 'empty.html.br');
    const gzipPath = path.join(t.context.gzipDir, 'empty.html.gz');
    const zstdPath = path.join(t.context.zstdDir, 'empty.html.zst');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);
    const zstdExists = await fs.access(zstdPath).then(() => true).catch(() => false);

    t.false(brotliExists);
    t.false(gzipExists);
    t.false(zstdExists);
});

// Test 22: Verifies brotli and gzip are always created, zstd conditionally
test('CompressionBuilder() - creates brotli and gzip always, zstd conditionally', async (t) => {
    const content = '<html><body>Test content</body></html>';
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {}, files: [] };
    await builder.compressFile('html/test.html', stats);

    const brotliPath = path.join(t.context.brotliDir, 'test.html.br');
    const gzipPath = path.join(t.context.gzipDir, 'test.html.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed file should always exist');
    t.true(gzipExists, 'Gzip compressed file should always exist');
    // Zstd may or may not exist depending on whether it compresses better than brotli
    // For small content, brotli is usually better, so zstd might not be created
});

// Test 23: Handles large files with all compression formats
test('CompressionBuilder() - handles large files with all compression formats', async (t) => {
    // Create a large file (1MB of repetitive content)
    const largeContent = 'x'.repeat(1024 * 1024);
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    const largeFile = path.join(t.context.siteDir, 'html/large.html');
    await fs.writeFile(largeFile, largeContent);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {}, files: [] };

    // Should handle large file without errors
    await t.notThrowsAsync(async () => {
        await builder.compressFile('html/large.html', stats);
    });

    // Verify brotli and gzip are always created
    const brotliPath = path.join(t.context.brotliDir, 'large.html.br');
    const gzipPath = path.join(t.context.gzipDir, 'large.html.gz');
    const zstdPath = path.join(t.context.zstdDir, 'large.html.zst');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);
    const zstdExists = await fs.access(zstdPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed file should exist');
    t.true(gzipExists, 'Gzip compressed file should exist');

    // Verify they're actually compressed
    const brotliContent = await fs.readFile(brotliPath);
    const gzipContent = await fs.readFile(gzipPath);

    t.true(brotliContent.length < largeContent.length, 'Brotli should compress the file');
    t.true(gzipContent.length < largeContent.length, 'Gzip should compress the file');

    // Zstd may or may not exist depending on whether it's better than brotli
    if (zstdExists) {
        const zstdContent = await fs.readFile(zstdPath);
        t.true(zstdContent.length < largeContent.length, 'Zstd should compress the file');
        t.true(zstdContent.length < brotliContent.length, 'Zstd should be better than brotli when saved');
    }
});

// Test 24: Zstd compression ratio tracking (when saved)
test('CompressionBuilder() - tracks zstd compression ratio when saved', async (t) => {
    const repeatText = 'Test content that should compress well because it has repetitive text. ';
    const content = '<html><body>' + repeatText.repeat(10) + '</body></html>';
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'html/test.html'), content);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    let zstdRatio, brotliRatio;
    const stats = {
        add: (filename, source, size, metadata) => {
            if (metadata.algorithm === 'zstd') {
                zstdRatio = parseFloat(metadata.compressionRatio);
            } else if (metadata.algorithm === 'brotli') {
                brotliRatio = parseFloat(metadata.compressionRatio);
            }
        },
        files: [],
    };

    await builder.compressFile('html/test.html', stats);

    t.true(brotliRatio > 0, 'Brotli compression ratio should be positive');

    // Zstd is only tracked if it's better than brotli
    if (zstdRatio !== undefined) {
        t.true(zstdRatio > 0, 'Zstd compression ratio should be positive when saved');
        t.true(zstdRatio < 100, 'Zstd compression ratio should be less than 100%');
        t.true(zstdRatio >= brotliRatio, 'Zstd should compress at least as well as brotli when saved');
    }
});
test('CompressionBuilder() - handles nested directory structures', async (t) => {
    const nestedDir = path.join(t.context.siteDir, 'level1', 'level2', 'html');
    await fs.mkdir(nestedDir, { recursive: true });

    const nestedFile = path.join(nestedDir, 'nested.html');
    await fs.writeFile(nestedFile, '<html>nested content</html>');

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    // Should find files in nested directories
    t.true(files.some(f => f.includes('level1/level2/html/nested.html')), 'Should find nested files');
});

// Test: Finds and compresses hash-based CSS files
test('CompressionBuilder() - finds and compresses hash-based CSS files', async (t) => {
    const cssContent = '.test { color: red; margin: 10px; }';
    await fs.mkdir(path.join(t.context.siteDir, 'css'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'css', '9008915a30a21706.css'), cssContent);

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    t.true(files.includes('css/9008915a30a21706.css'), 'Should find hash-based CSS file');

    await builder.ensureDirectories();
    const stats = { add: () => {}, files: [] };
    await builder.compressFile('css/9008915a30a21706.css', stats);

    // Verify compressed files were created
    const brotliPath = path.join(t.context.brotliDir, '9008915a30a21706.css.br');
    const gzipPath = path.join(t.context.gzipDir, '9008915a30a21706.css.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed CSS should exist');
    t.true(gzipExists, 'Gzip compressed CSS should exist');
});

// Test: Finds and compresses hash-based JS files
test('CompressionBuilder() - finds and compresses hash-based JS files', async (t) => {
    const jsContent = 'const x=1;console.log(x);';
    await fs.mkdir(path.join(t.context.siteDir, 'js'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'js', '904685a5dab014e8.js'), jsContent);

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    t.true(files.includes('js/904685a5dab014e8.js'), 'Should find hash-based JS file');

    await builder.ensureDirectories();
    const stats = { add: () => {}, files: [] };
    await builder.compressFile('js/904685a5dab014e8.js', stats);

    // Verify compressed files were created
    const brotliPath = path.join(t.context.brotliDir, '904685a5dab014e8.js.br');
    const gzipPath = path.join(t.context.gzipDir, '904685a5dab014e8.js.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed JS should exist');
    t.true(gzipExists, 'Gzip compressed JS should exist');
});

// Test: Hash-prefixed pattern detection (for backward compatibility with images)
test('CompressionBuilder() - detects hash-prefixed image files correctly', (t) => {
    const builder = new CompressionBuilder();

    // Valid hash-prefixed image files (backward compatibility)
    t.true(builder.hashPrefixPattern.test('_i0e5f33c7435efacf'));

    // Invalid patterns
    t.false(builder.hashPrefixPattern.test('_i90089')); // Too short
    t.false(builder.hashPrefixPattern.test('_x9008915a30a21706')); // Wrong prefix
    t.false(builder.hashPrefixPattern.test('i9008915a30a21706')); // Missing underscore
    t.false(builder.hashPrefixPattern.test('_i9008915a30a2170g')); // Invalid hex char
    t.false(builder.hashPrefixPattern.test('test.css')); // Regular file

    // New hash-based files with extensions should not match the old pattern
    t.false(builder.hashPrefixPattern.test('9008915a30a21706.css'));
    t.false(builder.hashPrefixPattern.test('904685a5dab014e8.js'));
});

// Test 25: Sitemap.xml compression
test('CompressionBuilder() - compresses sitemap.xml with Brotli and Gzip', async (t) => {
    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://example.com/</loc>
        <lastmod>2023-01-01</lastmod>
    </url>
    <url>
        <loc>https://example.com/about</loc>
        <lastmod>2023-01-01</lastmod>
    </url>
</urlset>`;

    // Create xml directory and place sitemap.xml there
    await fs.mkdir(path.join(t.context.siteDir, 'xml'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'xml', 'sitemap.xml'), sitemapContent);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {}, files: [] };
    await builder.compressFile('xml/sitemap.xml', stats);

    // Verify brotli and gzip files were created
    const brotliPath = path.join(t.context.brotliDir, 'sitemap.xml.br');
    const gzipPath = path.join(t.context.gzipDir, 'sitemap.xml.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed sitemap.xml should exist');
    t.true(gzipExists, 'Gzip compressed sitemap.xml should exist');

    // Verify they're actually compressed
    const brotliContent = await fs.readFile(brotliPath);
    const gzipContent = await fs.readFile(gzipPath);

    t.true(brotliContent.length < sitemapContent.length, 'Brotli should compress sitemap.xml');
    t.true(gzipContent.length < sitemapContent.length, 'Gzip should compress sitemap.xml');

    // Verify decompression works
    const decompressedBrotli = await brotliDecompress(brotliContent);
    const decompressedGzip = await gunzip(gzipContent);

    t.is(decompressedBrotli.toString(), sitemapContent);
    t.is(decompressedGzip.toString(), sitemapContent);
});

// Test 26: Sitemap.xml is found by findCompressibleFiles
test('CompressionBuilder() - finds sitemap.xml in compressible files', async (t) => {
    await fs.mkdir(path.join(t.context.siteDir, 'xml'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'xml', 'sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.html'), '<html></html>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.css'), 'body {}');

    const builder = createTestBuilder(t);
    const files = await builder.findCompressibleFiles();

    t.true(files.includes('xml/sitemap.xml'), 'Should find sitemap.xml in xml directory');
    t.true(files.includes('test.html'), 'Should find HTML files');
    t.true(files.includes('test.css'), 'Should find CSS files');
});

// Test 27: Sitemap.xml compression statistics tracking
test('CompressionBuilder() - tracks sitemap.xml compression statistics', async (t) => {
    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://example.com/</loc>
    </url>
</urlset>`;

    await fs.mkdir(path.join(t.context.siteDir, 'xml'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'xml', 'sitemap.xml'), sitemapContent);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    let brotliStats, gzipStats;
    const stats = {
        add: (filename, source, size, metadata) => {
            if (filename === 'brotli/sitemap.xml.br') {
                brotliStats = { filename, source, size, metadata };
            } else if (filename === 'gzip/sitemap.xml.gz') {
                gzipStats = { filename, source, size, metadata };
            }
        },
        files: [],
    };

    await builder.compressFile('xml/sitemap.xml', stats);

    // Verify brotli statistics
    t.truthy(brotliStats, 'Should track brotli compression');
    t.is(brotliStats.filename, 'brotli/sitemap.xml.br');
    t.is(brotliStats.source, 'xml/sitemap.xml');
    t.is(brotliStats.metadata.algorithm, 'brotli');
    t.is(brotliStats.metadata.originalSize, sitemapContent.length);
    t.true(typeof brotliStats.metadata.compressionRatio === 'string');
    t.true(parseFloat(brotliStats.metadata.compressionRatio) > 0);

    // Verify gzip statistics
    t.truthy(gzipStats, 'Should track gzip compression');
    t.is(gzipStats.filename, 'gzip/sitemap.xml.gz');
    t.is(gzipStats.source, 'xml/sitemap.xml');
    t.is(gzipStats.metadata.algorithm, 'gzip');
    t.is(gzipStats.metadata.originalSize, sitemapContent.length);
    t.true(typeof gzipStats.metadata.compressionRatio === 'string');
    t.true(parseFloat(gzipStats.metadata.compressionRatio) > 0);
});

// Test 28: Sitemap.xml Zstd conditional compression
test('CompressionBuilder() - conditionally saves sitemap.xml.zstd when better than Brotli', async (t) => {
    // Use a sitemap with repetitive content that might compress better with zstd
    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${Array.from({ length: 100 }, (_, i) => `
    <url>
        <loc>https://example.com/page${i}</loc>
        <lastmod>2023-01-01</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>`).join('')}
</urlset>`;

    await fs.mkdir(path.join(t.context.siteDir, 'xml'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'xml', 'sitemap.xml'), sitemapContent);

    const builder = createTestBuilder(t);
    await builder.ensureDirectories();

    const stats = { add: () => {}, files: [] };
    await builder.compressFile('xml/sitemap.xml', stats);

    const brotliPath = path.join(t.context.brotliDir, 'sitemap.xml.br');
    const gzipPath = path.join(t.context.gzipDir, 'sitemap.xml.gz');
    const zstdPath = path.join(t.context.zstdDir, 'sitemap.xml.zst');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);
    const zstdExists = await fs.access(zstdPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli should always exist');
    t.true(gzipExists, 'Gzip should always exist');

    // Zstd may or may not exist depending on whether it compresses better than brotli
    if (zstdExists) {
        const zstdContent = await fs.readFile(zstdPath);
        const brotliContent = await fs.readFile(brotliPath);

        t.true(zstdContent.length < brotliContent.length, 'Zstd should be smaller than Brotli when saved');
        t.true(zstdContent.length < sitemapContent.length, 'Zstd should compress the file');

        // Verify zstd decompression works
        const decompressed = await zstd.decompress(zstdContent);
        t.is(decompressed.toString(), sitemapContent);
    }
});

// Test 29: Sitemap.xml flat filename handling
test('CompressionBuilder() - handles sitemap.xml flat filename correctly', (t) => {
    const builder = new CompressionBuilder();

    // sitemap.xml should be flattened to just 'sitemap.xml'
    t.is(builder.getFlatFilename('sitemap.xml'), 'sitemap.xml');

    // Even if sitemap.xml were in a subdirectory, it should be flattened
    t.is(builder.getFlatFilename('some/path/sitemap.xml'), 'sitemap.xml');
});

// Test 30: Integration test - sitemap.xml in full build process
test('CompressionBuilder() - includes sitemap.xml in full build process', async (t) => {
    // Create multiple files including sitemap.xml
    await fs.mkdir(path.join(t.context.siteDir, 'html'), { recursive: true });
    await fs.mkdir(path.join(t.context.siteDir, 'xml'), { recursive: true });
    await fs.writeFile(path.join(t.context.siteDir, 'xml', 'sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>');
    await fs.writeFile(path.join(t.context.siteDir, 'html/index.html'), '<html></html>');
    await fs.writeFile(path.join(t.context.siteDir, 'test.css'), 'body {}');

    const builder = createTestBuilder(t);
    const result = await builder.build();

    // Verify sitemap.xml was included in compression
    t.true(result.filesCompressed >= 1, 'Should compress at least 1 file');

    // Check that compressed files exist
    const brotliPath = path.join(t.context.brotliDir, 'sitemap.xml.br');
    const gzipPath = path.join(t.context.gzipDir, 'sitemap.xml.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed sitemap.xml should exist after full build');
    t.true(gzipExists, 'Gzip compressed sitemap.xml should exist after full build');
});
