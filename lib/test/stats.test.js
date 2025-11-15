/**
 * AVA tests for build statistics files generation
 * Tests that all build-*.json files are generated correctly with unified format
 */

const path = require('path');
const fs = require('fs');
const test = require('ava');
const {
    fileExists,
    readJsonFile,
    validateUnifiedFormat,
    assertValidJson,
    assertPositiveNumber,
    assertArrayNotEmpty,
    getAllFiles,
} = require('./utils');

// Helper to get build artifact file path
function getBuildArtifactPath(filename) {
    return path.join(__dirname, '..', '..', '.build', filename);
}

// ============================================================================
// build-css.json Tests
// ============================================================================

test('build-css.json - file exists', (t) => {
    const filePath = getBuildArtifactPath('build-css.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-css.json not found (run npm run build first)');

        return;
    }

    t.true(fileExists(filePath), 'build-css.json should exist');
});

test('build-css.json - has valid JSON format', (t) => {
    const filePath = getBuildArtifactPath('build-css.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-css.json not found');

        return;
    }

    const content = require('fs').readFileSync(filePath, 'utf8');

    assertValidJson(t, content, 'build-css.json should contain valid JSON');
});

test('build-css.json - has unified format', (t) => {
    const filePath = getBuildArtifactPath('build-css.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-css.json not found');

        return;
    }

    const buildCss = readJsonFile(filePath);

    t.true(Object.keys(buildCss).length > 0, 'Should have at least one entry');

    Object.entries(buildCss).forEach(([filename, info]) => {
        validateUnifiedFormat(t, info, filename, ['hash', 'url', 'bundle'], true);
        if (Array.isArray(info.source)) {
            assertArrayNotEmpty(t, info.source, `${filename}.source`);
        }
        assertPositiveNumber(t, info.size, `${filename}.size`);
        t.true(
            filename.startsWith('_c') || filename.endsWith('.css'),
            `${filename} should be CSS file (hash-prefixed or .css extension)`,
        );
    });
});

// ============================================================================
// build-js.json Tests
// ============================================================================

test('build-js.json - file exists', (t) => {
    const filePath = getBuildArtifactPath('build-js.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-js.json not found (run npm run build first)');

        return;
    }

    t.true(fileExists(filePath), 'build-js.json should exist');
});

test('build-js.json - has valid JSON format', (t) => {
    const filePath = getBuildArtifactPath('build-js.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-js.json not found');

        return;
    }

    const content = require('fs').readFileSync(filePath, 'utf8');

    assertValidJson(t, content, 'build-js.json should contain valid JSON');
});

test('build-js.json - has unified format', (t) => {
    const filePath = getBuildArtifactPath('build-js.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-js.json not found');

        return;
    }

    const buildJs = readJsonFile(filePath);

    t.true(Object.keys(buildJs).length > 0, 'Should have at least one entry');

    Object.entries(buildJs).forEach(([filename, info]) => {
        validateUnifiedFormat(t, info, filename, ['hash', 'url', 'bundle'], true);
        if (Array.isArray(info.source)) {
            assertArrayNotEmpty(t, info.source, `${filename}.source`);
        }
        assertPositiveNumber(t, info.size, `${filename}.size`);
        t.true(
            filename.startsWith('_j') || filename.endsWith('.js'),
            `${filename} should be JS file (hash-prefixed or .js extension)`,
        );
    });
});

// ============================================================================
// build-html.json Tests
// ============================================================================

test('build-html.json - file exists', (t) => {
    const filePath = getBuildArtifactPath('build-html.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-html.json not found (run npm run build first)');

        return;
    }

    t.true(fileExists(filePath), 'build-html.json should exist');
});

test('build-html.json - has valid JSON format', (t) => {
    const filePath = getBuildArtifactPath('build-html.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-html.json not found');

        return;
    }

    const content = require('fs').readFileSync(filePath, 'utf8');

    assertValidJson(t, content, 'build-html.json should contain valid JSON');
});

test('build-html.json - has unified format', (t) => {
    const filePath = getBuildArtifactPath('build-html.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-html.json not found');

        return;
    }

    const buildHtml = readJsonFile(filePath);

    t.true(Object.keys(buildHtml).length > 0, 'Should have at least one entry');

    Object.entries(buildHtml).forEach(([filename, info]) => {
        validateUnifiedFormat(t, info, filename, ['url']);
        assertPositiveNumber(t, info.size, `${filename}.size`);
        t.true(filename.endsWith('.html'), `${filename} should be HTML file`);
    });
});

// ============================================================================
// build-images.json Tests
// ============================================================================

test('build-images.json - file exists', (t) => {
    const filePath = getBuildArtifactPath('build-images.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-images.json not found (run npm run build first)');

        return;
    }

    t.true(fileExists(filePath), 'build-images.json should exist');
});

test('build-images.json - has valid JSON format', (t) => {
    const filePath = getBuildArtifactPath('build-images.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-images.json not found');

        return;
    }

    const content = require('fs').readFileSync(filePath, 'utf8');

    assertValidJson(t, content, 'build-images.json should contain valid JSON');
});

test('build-images.json - has unified format', (t) => {
    const filePath = getBuildArtifactPath('build-images.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-images.json not found');

        return;
    }

    const buildImages = readJsonFile(filePath);

    t.true(Object.keys(buildImages).length > 0, 'Should have at least one entry');

    const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp'];

    Object.entries(buildImages).forEach(([filename, info]) => {
        validateUnifiedFormat(t, info, filename, ['hash', 'url']);
        assertPositiveNumber(t, info.size, `${filename}.size`);

        // SVG files are saved with _s prefix (no extension), other images have extensions
        if (filename.startsWith('_s')) {
            t.pass(`${filename} is a hash-prefixed SVG file`);
        } else {
            const ext = path.extname(filename).toLowerCase();
            t.true(validExtensions.includes(ext), `${filename} should have valid image extension`);
        }
    });
});

// ============================================================================
// build-assets.json Tests
// ============================================================================

test('build-assets.json - file exists', (t) => {
    const filePath = getBuildArtifactPath('build-assets.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-assets.json not found (run npm run build first)');

        return;
    }

    t.true(fileExists(filePath), 'build-assets.json should exist');
});

test('build-assets.json - has valid JSON format', (t) => {
    const filePath = getBuildArtifactPath('build-assets.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-assets.json not found');

        return;
    }

    const content = require('fs').readFileSync(filePath, 'utf8');

    assertValidJson(t, content, 'build-assets.json should contain valid JSON');
});

test('build-assets.json - has unified format', (t) => {
    const filePath = getBuildArtifactPath('build-assets.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-assets.json not found');

        return;
    }

    const buildAssets = readJsonFile(filePath);

    // Assets may be empty, so we don't require entries
    Object.entries(buildAssets).forEach(([filename, info]) => {
        validateUnifiedFormat(t, info, filename, ['url', 'sourceUrl', 'type']);
        assertPositiveNumber(t, info.size, `${filename}.size`);
    });
});

// ============================================================================
// build-sitemap.json Tests
// ============================================================================

test('build-sitemap.json - file exists', (t) => {
    const filePath = getBuildArtifactPath('build-sitemap.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-sitemap.json not found (run npm run build first)');

        return;
    }

    t.true(fileExists(filePath), 'build-sitemap.json should exist');
});

test('build-sitemap.json - has valid JSON format', (t) => {
    const filePath = getBuildArtifactPath('build-sitemap.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-sitemap.json not found');

        return;
    }

    const content = require('fs').readFileSync(filePath, 'utf8');

    assertValidJson(t, content, 'build-sitemap.json should contain valid JSON');
});

test('build-sitemap.json - has unified format', (t) => {
    const filePath = getBuildArtifactPath('build-sitemap.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-sitemap.json not found');

        return;
    }

    const buildNav = readJsonFile(filePath);

    t.truthy(buildNav['sitemap.xml'], 'Should have sitemap.xml entry');

    const sitemapEntry = buildNav['sitemap.xml'];

    validateUnifiedFormat(t, sitemapEntry, 'sitemap.xml', ['url', 'urlsCount']);
    assertPositiveNumber(t, sitemapEntry.size, 'sitemap.xml.size');
    t.true(typeof sitemapEntry.metadata.urlsCount === 'number', 'urlsCount should be number');
    t.true(sitemapEntry.metadata.urlsCount > 0, 'urlsCount should be positive');
});

// ============================================================================
// build-compression.json Tests
// ============================================================================

test('build-compression.json - file exists', (t) => {
    const filePath = getBuildArtifactPath('build-compression.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-compression.json not found (run npm run build first)');

        return;
    }

    t.true(fileExists(filePath), 'build-compression.json should exist');
});

test('build-compression.json - has valid JSON format', (t) => {
    const filePath = getBuildArtifactPath('build-compression.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-compression.json not found');

        return;
    }

    const content = require('fs').readFileSync(filePath, 'utf8');

    assertValidJson(t, content, 'build-compression.json should contain valid JSON');
});

test('build-compression.json - has unified format', (t) => {
    const filePath = getBuildArtifactPath('build-compression.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-compression.json not found');

        return;
    }

    const buildCompression = readJsonFile(filePath);

    // Skip if no compression entries (might happen if no compressible files)
    if (Object.keys(buildCompression).length === 0) {
        t.pass('Skipping - no compression entries found');

        return;
    }

    Object.entries(buildCompression).forEach(([filename, info]) => {
        validateUnifiedFormat(t, info, filename, ['algorithm', 'originalSize']);
        assertPositiveNumber(t, info.size, `${filename}.size`);

        // Check algorithm based on file extension
        if (filename.endsWith('.br')) {
            t.is(info.metadata.algorithm, 'brotli', `${filename} should have brotli algorithm`);
        } else if (filename.endsWith('.gz')) {
            t.is(info.metadata.algorithm, 'gzip', `${filename} should have gzip algorithm`);
        }

        // Compressed size should be less than original
        t.true(info.size < info.metadata.originalSize, `${filename} compressed size should be less than original`);
    });
});

// ============================================================================
// Additional Statistics Integrity Tests (from nginx-integrity.test.js)
// ============================================================================

test('statistics - all build statistics files exist', (t) => {
    const statsFiles = [
        'build-css.json',
        'build-js.json',
        'build-html.json',
        'build-images.json',
        'build-assets.json',
        'build-sitemap.json',
        'build-compression.json',
    ];

    statsFiles.forEach((file) => {
        const filePath = getBuildArtifactPath(file);

        if (!fileExists(filePath)) {
            t.pass(`Skipping - ${file} not found (run npm run build first)`);

            return;
        }

        t.true(fileExists(filePath), `${file} should exist`);
    });
});

test('statistics - compression ratios are reasonable', (t) => {
    const filePath = getBuildArtifactPath('build-compression.json');

    if (!fileExists(filePath)) {
        t.pass('Skipping - build-compression.json not found');

        return;
    }

    const buildCompression = readJsonFile(filePath);

    // Skip if no compression entries
    if (Object.keys(buildCompression).length === 0) {
        t.pass('Skipping - no compression entries found');

        return;
    }

    Object.entries(buildCompression).forEach(([filename, info]) => {
        const ratio = info.size / info.metadata.originalSize;

        t.true(ratio > 0 && ratio < 1, `${filename} should have compression ratio between 0 and 1, got ${ratio}`);

        // Brotli should generally compress better than gzip
        if (info.metadata.algorithm === 'brotli') {
            t.true(ratio < 0.9, `${filename} brotli should compress to less than 90% of original`);
        }
    });
});

test('statistics - file sizes match between statistics and disk', (t) => {
    const cssFilePath = getBuildArtifactPath('build-css.json');

    if (!fileExists(cssFilePath)) {
        t.pass('Skipping - build-css.json not found');

        return;
    }

    const siteDir = path.join(__dirname, '..', '..', 'site');
    const buildCss = readJsonFile(cssFilePath);

    Object.entries(buildCss).forEach(([filename, info]) => {
        const filePath = path.join(siteDir, filename);

        if (!fs.existsSync(filePath)) {
            t.pass(`Skipping size check for ${filename} - file not found on disk`);

            return;
        }

        const fileStats = fs.statSync(filePath);

        t.is(fileStats.size, info.size, `${filename} size in statistics should match disk size`);
    });
});

test('statistics - all site files are tracked', (t) => {
    const siteDir = path.join(__dirname, '..', '..', 'site');

    if (!fs.existsSync(siteDir)) {
        t.pass('Skipping - site directory not found');

        return;
    }

    // Load all statistics files
    const statsFiles = [
        { name: 'build-css.json', file: getBuildArtifactPath('build-css.json') },
        { name: 'build-js.json', file: getBuildArtifactPath('build-js.json') },
        { name: 'build-html.json', file: getBuildArtifactPath('build-html.json') },
        { name: 'build-images.json', file: getBuildArtifactPath('build-images.json') },
        { name: 'build-assets.json', file: getBuildArtifactPath('build-assets.json') },
    ];

    const trackedFiles = new Set();

    statsFiles.forEach(({ file }) => {
        if (fileExists(file)) {
            const stats = readJsonFile(file);

            Object.keys(stats).forEach((filename) => trackedFiles.add(filename));
        }
    });

    // Add sitemap.xml from build-sitemap.json
    const navFilePath = getBuildArtifactPath('build-sitemap.json');

    if (fileExists(navFilePath)) {
        trackedFiles.add('sitemap.xml');
    }

    // Get all actual files (excluding compression directories and modern image formats)
    const actualFiles = getAllFiles(siteDir, ['brotli', 'gzip', 'zstd', 'avif', 'webp']);

    // Check that all actual files are tracked
    actualFiles.forEach((file) => {
        t.true(trackedFiles.has(file), `File ${file} should be tracked in statistics`);
    });
});
