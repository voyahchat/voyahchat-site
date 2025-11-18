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

// Helper function to create a test builder with isolated directories
function createTestBuilder(t, options = {}) {
    const dir = new TestDir();
    const builder = new CompressionBuilder(options, dir);
    return { builder, dir };
}

// Test 1: Finds compressible files
test('CompressionBuilder() - finds all compressible files', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    // Create test files
    await fs.mkdir(path.join(siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'html/test.html'), '<html></html>');
    await fs.writeFile(path.join(siteDir, 'test.css'), 'body {}');
    await fs.writeFile(path.join(siteDir, 'test.js'), 'const x = 1;');
    await fs.writeFile(path.join(siteDir, 'test.svg'), '<svg></svg>');
    await fs.writeFile(path.join(siteDir, 'test.xml'), '<xml></xml>');
    await fs.writeFile(path.join(siteDir, 'test.txt'), 'text');
    await fs.writeFile(path.join(siteDir, 'test.png'), 'binary'); // Should be skipped

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
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    await fs.mkdir(path.join(siteDir, 'brotli'), { recursive: true });
    await fs.mkdir(path.join(siteDir, 'gzip'), { recursive: true });
    await fs.mkdir(path.join(siteDir, 'zstd'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'brotli/test.html.br'), 'compressed');
    await fs.writeFile(path.join(siteDir, 'gzip/test.html.gz'), 'compressed');
    await fs.writeFile(path.join(siteDir, 'zstd/test.html.zst'), 'compressed');
    await fs.mkdir(path.join(siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'html/test.html'), '<html></html>');

    const files = await builder.findCompressibleFiles();

    t.is(files.length, 1);
    t.is(files[0], 'html/test.html');
});

// Test 3: Skips robots.txt
test('CompressionBuilder() - skips robots.txt', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    await fs.writeFile(path.join(siteDir, 'robots.txt'), 'User-agent: *');
    await fs.writeFile(path.join(siteDir, 'test.txt'), 'text');

    const files = await builder.findCompressibleFiles();

    t.is(files.length, 1);
    t.is(files[0], 'test.txt');
});

// Test 4: Compresses with Brotli
test('CompressionBuilder() - compresses with Brotli level 11', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();
    const content = '<html><body>Test content for compression</body></html>';
    await fs.mkdir(path.join(siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'html/test.html'), content);

    await builder.ensureDirectories();

    const stats = { add: () => {} }; // Mock stats
    await builder.compressFile('html/test.html', stats);

    const brotliPath = path.join(siteDir, 'brotli', 'test.html.br');
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
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();
    // Use longer, more repetitive content that compresses well
    const content = '<html><body>' + 'Test content for compression. '.repeat(50) + '</body></html>';
    await fs.mkdir(path.join(siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'html/test.html'), content);

    await builder.ensureDirectories();

    const stats = { add: () => {} }; // Mock stats
    await builder.compressFile('html/test.html', stats);

    const gzipPath = path.join(siteDir, 'gzip', 'test.html.gz');
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
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    await fs.mkdir(path.join(siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'html/empty.html'), '');

    await builder.ensureDirectories();

    const stats = { add: () => {} };
    await builder.compressFile('html/empty.html', stats);

    // Should not create compressed files for empty files
    const brotliPath = path.join(siteDir, 'brotli', 'empty.html.br');
    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);

    const gzipPath = path.join(siteDir, 'gzip', 'empty.html.gz');
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.false(brotliExists);
    t.false(gzipExists);
});

// Test 8: Calculates compression ratios
test('CompressionBuilder() - calculates compression ratios correctly', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();
    const repeatText = 'Test content that should compress well because it has repetitive text. ';
    const content = '<html><body>' + repeatText + repeatText + '</body></html>';
    await fs.mkdir(path.join(siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'html/test.html'), content);

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
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    await builder.ensureDirectories();

    const brotliExists = await fs.access(path.join(siteDir, 'brotli')).then(() => true).catch(() => false);
    const gzipExists = await fs.access(path.join(siteDir, 'gzip')).then(() => true).catch(() => false);
    const zstdExists = await fs.access(path.join(siteDir, 'zstd')).then(() => true).catch(() => false);

    t.true(brotliExists);
    t.true(gzipExists);
    t.true(zstdExists);
});

// Test 10: Handles compression errors gracefully
test('CompressionBuilder() - handles compression errors gracefully', async (t) => {
    const { builder } = createTestBuilder(t);

    await t.notThrowsAsync(async () => {
        await builder.build();
    });
});

// Test 11: Tracks statistics correctly
test('CompressionBuilder() - tracks statistics correctly', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    await fs.mkdir(path.join(siteDir, 'html'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'html/test.html'), '<html></html>');

    const result = await builder.build({ skipWrite: true });

    t.is(result.filesCompressed, 1);
    t.is(result.brotliFiles, 1);
    t.is(result.gzipFiles, 1);
    // zstdFiles can be 0 or 1 depending on whether zstd compresses better than brotli
    t.true(result.zstdFiles >= 0 && result.zstdFiles <= 1);
    t.true(result.totalFiles >= 2 && result.totalFiles <= 3); // brotli + gzip always, zstd conditionally
});

// Test 12: Hash prefix pattern detection (for backward compatibility with images)
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

// Test 13: Finds and compresses hash-based CSS files
test('CompressionBuilder() - finds and compresses hash-based CSS files', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();
    const cssContent = '.test { color: red; margin: 10px; }';
    await fs.mkdir(path.join(siteDir, 'css'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'css', '9008915a30a21706.css'), cssContent);

    const files = await builder.findCompressibleFiles();

    t.true(files.includes('css/9008915a30a21706.css'), 'Should find hash-based CSS file');

    await builder.ensureDirectories();
    const stats = { add: () => {}, files: [] };
    await builder.compressFile('css/9008915a30a21706.css', stats);

    // Verify compressed files were created
    const brotliPath = path.join(siteDir, 'brotli', '9008915a30a21706.css.br');
    const gzipPath = path.join(siteDir, 'gzip', '9008915a30a21706.css.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed CSS should exist');
    t.true(gzipExists, 'Gzip compressed CSS should exist');
});

// Test 14: Finds and compresses hash-based JS files
test('CompressionBuilder() - finds and compresses hash-based JS files', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();
    const jsContent = 'const x=1;console.log(x);';
    await fs.mkdir(path.join(siteDir, 'js'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'js', '904685a5dab014e8.js'), jsContent);

    const files = await builder.findCompressibleFiles();

    t.true(files.includes('js/904685a5dab014e8.js'), 'Should find hash-based JS file');

    await builder.ensureDirectories();
    const stats = { add: () => {}, files: [] };
    await builder.compressFile('js/904685a5dab014e8.js', stats);

    // Verify compressed files were created
    const brotliPath = path.join(siteDir, 'brotli', '904685a5dab014e8.js.br');
    const gzipPath = path.join(siteDir, 'gzip', '904685a5dab014e8.js.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed JS should exist');
    t.true(gzipExists, 'Gzip compressed JS should exist');
});

// Test 15: Handles nested directory structures
test('CompressionBuilder() - handles nested directory structures', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    const nestedDir = path.join(siteDir, 'level1', 'level2', 'html');
    await fs.mkdir(nestedDir, { recursive: true });

    const nestedFile = path.join(nestedDir, 'nested.html');
    await fs.writeFile(nestedFile, '<html>nested content</html>');

    const files = await builder.findCompressibleFiles();

    // Should find files in nested directories
    t.true(files.some(f => f.includes('level1/level2/html/nested.html')), 'Should find nested files');
});

// Test 16: Sitemap.xml compression
test('CompressionBuilder() - compresses sitemap.xml with Brotli and Gzip', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();
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
    await fs.mkdir(path.join(siteDir, 'xml'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'xml', 'sitemap.xml'), sitemapContent);

    await builder.ensureDirectories();

    const stats = { add: () => {}, files: [] };
    await builder.compressFile('xml/sitemap.xml', stats);

    // Verify brotli and gzip files were created
    const brotliPath = path.join(siteDir, 'brotli', 'sitemap.xml.br');
    const gzipPath = path.join(siteDir, 'gzip', 'sitemap.xml.gz');

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

// Test 17: Sitemap.xml is found by findCompressibleFiles
test('CompressionBuilder() - finds sitemap.xml in compressible files', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    await fs.mkdir(path.join(siteDir, 'xml'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'xml', 'sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>');
    await fs.writeFile(path.join(siteDir, 'test.html'), '<html></html>');
    await fs.writeFile(path.join(siteDir, 'test.css'), 'body {}');

    const files = await builder.findCompressibleFiles();

    t.true(files.includes('xml/sitemap.xml'), 'Should find sitemap.xml in xml directory');
    t.true(files.includes('test.html'), 'Should find HTML files');
    t.true(files.includes('test.css'), 'Should find CSS files');
});

// Test 18: Integration test - full build process
test('CompressionBuilder() - includes sitemap.xml in full build process', async (t) => {
    const { builder, dir } = createTestBuilder(t);
    const siteDir = dir.getSite();

    // Create multiple files including sitemap.xml
    await fs.mkdir(path.join(siteDir, 'html'), { recursive: true });
    await fs.mkdir(path.join(siteDir, 'xml'), { recursive: true });
    await fs.writeFile(path.join(siteDir, 'xml', 'sitemap.xml'), '<?xml version="1.0"?><urlset></urlset>');
    await fs.writeFile(path.join(siteDir, 'html/index.html'), '<html></html>');
    await fs.writeFile(path.join(siteDir, 'test.css'), 'body {}');

    const result = await builder.build();

    // Verify sitemap.xml was included in compression
    t.true(result.filesCompressed >= 1, 'Should compress at least 1 file');

    // Check that compressed files exist
    const brotliPath = path.join(siteDir, 'brotli', 'sitemap.xml.br');
    const gzipPath = path.join(siteDir, 'gzip', 'sitemap.xml.gz');

    const brotliExists = await fs.access(brotliPath).then(() => true).catch(() => false);
    const gzipExists = await fs.access(gzipPath).then(() => true).catch(() => false);

    t.true(brotliExists, 'Brotli compressed sitemap.xml should exist after full build');
    t.true(gzipExists, 'Gzip compressed sitemap.xml should exist after full build');
});
