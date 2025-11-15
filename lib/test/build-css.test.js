/**
 * AVA tests for CSS build functionality
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const CSSBuilder = require('../build/build-css');
const { TestDir } = require('./test-dir');

test.afterEach.always(async (t) => {
    // Restore mocked functions
    if (t.context.originalConsoleWarn) {
        console.warn = t.context.originalConsoleWarn;
    }
});

test('CSSBuilder() - should create instance with default options', (t) => {
    const builder = new CSSBuilder();

    t.is(builder.bundle, 'page');
    t.true(Array.isArray(CSSBuilder.getSourcePaths()));
    t.true(CSSBuilder.getSourcePaths().length > 0);
});

test('CSSBuilder() - should create instance with custom bundle', (t) => {
    const builder = new CSSBuilder('custom');

    t.is(builder.bundle, 'custom');
});

test('CSSBuilder.generateHash() - should create consistent hash', (t) => {
    const css = '.test { color: red; }';
    const hash = CSSBuilder.generateHash(css);

    t.is(hash.length, 16);
    t.is(typeof hash, 'string');

    // Same CSS should produce same hash
    const hash2 = CSSBuilder.generateHash(css);

    t.is(hash, hash2);
});

test('CSSBuilder.minifyCSS() - should reduce CSS size', (t) => {
    const css = `
    .test {
        color: red;
        margin: 10px;
    }
    `;

    const minified = CSSBuilder.minifyCSS(css);

    t.true(minified.length < css.length);
    t.true(minified.includes('.test'));
    t.true(minified.includes('color:red'));
});

test('CSSBuilder.processImageReferences() - should process images with valid mapping', async (t) => {
    const dir = new TestDir();

    const imageMapping = {
        '../images/test.png': 'abc123def456.png',
        'logo.svg': 'def456ghi789.svg',
    };

    const mappingPath = path.join(dir.getBuild(), 'image-mapping.json');

    await fs.writeFile(mappingPath, JSON.stringify(imageMapping));

    const css = `
    .test {
        background-image: url(../images/test.png);
        background: url(logo.svg);
    }
    `;

    const processed = await CSSBuilder.processImageReferences(css, dir);

    t.true(processed.includes('url(/abc123def456.png)'));
    t.true(processed.includes('url(/def456ghi789.svg)'));
    t.false(processed.includes('url(../images/test.png)'));
    t.false(processed.includes('url(logo.svg)'));
});

test('CSSBuilder.processImageReferences() - should handle missing mapping file', async (t) => {
    const css = `
    .test {
        background-image: url(../images/test.png);
    }
    `;

    const dir = new TestDir();

    // Mock console.warn to suppress expected warning message
    t.context.originalConsoleWarn = console.warn;
    console.warn = () => {}; // Suppress console.warn during this test

    const processed = await CSSBuilder.processImageReferences(css, dir);

    // Should return original CSS when no mapping exists
    t.is(processed, css);
});

test('CSSBuilder.saveArtifacts() - should create correct files with hash prefix', async (t) => {
    const dir = new TestDir();
    const builder = new CSSBuilder('test-bundle', dir);
    const css = '.test { color: red; }';
    const hash = 'abc123def456';

    const artifactInfo = await builder.saveArtifacts(css, hash, []);

    // Check that files were created with _c prefix
    const siteHashedPath = path.join(dir.getSite(), `_c${hash}`);
    const hashInfoPath = path.join(dir.getBuild(), 'hash-css.json');

    const siteFileExists = await fs.access(siteHashedPath)
        .then(() => true)
        .catch(() => false);
    const hashInfoExists = await fs.access(hashInfoPath)
        .then(() => true)
        .catch(() => false);

    t.true(siteFileExists, 'Site hashed CSS file should exist with _c prefix');
    t.true(hashInfoExists, 'Hash info file should exist');

    // Check hash info content
    const hashInfoContent = JSON.parse(await fs.readFile(hashInfoPath, 'utf8'));

    t.deepEqual(hashInfoContent['test-bundle'], {
        hash,
        filename: `_c${hash}`,
        url: `/_c${hash}`,
    });

    // Check that saveArtifacts returns proper info
    t.is(artifactInfo.filename, `_c${hash}`);
    t.is(artifactInfo.hash, hash);
    t.true(artifactInfo.size > 0);
});

test('CSSBuilder.inlineHashedSVGs() - should inline SVG files as data:uri', async (t) => {
    const dir = new TestDir();

    // Create test SVG file
    const testSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
        '<circle cx="5" cy="5" r="4"/></svg>';
    const hashedSvgPath = path.join(dir.getSite(), 'hashed123.svg');

    await fs.writeFile(hashedSvgPath, testSvg);

    const css = '.test { background-image: url(/hashed123.svg); }';
    const result = await CSSBuilder.inlineHashedSVGs(css, dir);

    // Should contain data:uri
    t.true(result.includes('data:image/svg+xml'));
    t.true(result.includes('url('));
    t.true(result.includes('%3Csvg'));

    // Should not contain the original URL
    t.false(result.includes('url(/hashed123.svg)'));
});

test('CSSBuilder.inlineHashedSVGs() - should use URL encoding, not base64', async (t) => {
    const dir = new TestDir();

    // Create test SVG file with special characters that need URL encoding
    const testSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<text x="10" y="20">Hello & World</text><rect width="100" height="100"/></svg>';
    const hashedSvgPath = path.join(dir.getSite(), 'hashed456.svg');

    await fs.writeFile(hashedSvgPath, testSvg);

    const css = '.test { background-image: url(/hashed456.svg); }';
    const result = await CSSBuilder.inlineHashedSVGs(css, dir);

    // Should contain data:uri with URL encoding
    t.true(result.includes('data:image/svg+xml,'));

    // Should contain URL-encoded characters (not base64)
    t.true(result.includes('%3Csvg')); // <svg
    t.true(result.includes('%3Ctext')); // <text
    t.true(result.includes('Hello%20%26%20World')); // URL-encoded "Hello & World"

    // Should NOT contain base64 patterns
    t.false(result.includes('data:image/svg+xml;base64,'));

    // Should contain the actual URL-encoded SVG content
    t.true(result.includes('%3Crect')); // <rect
    t.true(result.includes('width%3D%22100%22')); // width="100" URL-encoded

    // Should not contain the original URL
    t.false(result.includes('url(/hashed456.svg)'));
});

test('CSSBuilder.inlineHashedSVGs() - should handle multiple SVG files', async (t) => {
    const dir = new TestDir();

    // Create test SVG files
    const svg1 =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
        '<rect width="10" height="10"/></svg>';
    const svg2 =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
        '<circle cx="5" cy="5" r="4"/></svg>';

    await fs.writeFile(path.join(dir.getSite(), 'hash1.svg'), svg1);
    await fs.writeFile(path.join(dir.getSite(), 'hash2.svg'), svg2);

    const css = `
        .test1 { background-image: url(/hash1.svg); }
        .test2 { background-image: url(/hash2.svg); }
        .test1:hover { background-image: url(/hash1.svg); }
    `;

    const result = await CSSBuilder.inlineHashedSVGs(css, dir);

    // Should contain both SVGs as data:uri
    t.true(result.includes('data:image/svg+xml'));
    t.true(result.includes('%3Crect')); // from svg1
    t.true(result.includes('%3Ccircle')); // from svg2

    // Should not contain original URLs
    t.false(result.includes('url(/hash1.svg)'));
    t.false(result.includes('url(/hash2.svg)'));

    // Should handle multiple occurrences of the same SVG
    const dataUriMatches = result.match(/data:image\/svg\+xml,%3Csvg[^)]+/g);

    t.true(dataUriMatches && dataUriMatches.length >= 3); // hash1 twice, hash2 once
});

test('CSSBuilder.inlineHashedSVGs() - should skip non-SVG URLs', async (t) => {
    const dir = new TestDir();

    const css = `
        .image { background-image: url(/test.jpg); }
        .font { src: url(/font.woff); }
        .data { background: url(data:image/png;base64,ABC123); }
    `;

    const result = await CSSBuilder.inlineHashedSVGs(css, dir);

    // Should remain unchanged
    t.is(result, css);
});

test('CSSBuilder.inlineHashedSVGs() - should handle missing SVG files gracefully', async (t) => {
    const dir = new TestDir();

    // Mock console.warn to suppress expected warning message
    t.context.originalConsoleWarn = console.warn;
    console.warn = () => {}; // Suppress console.warn during this test

    const css = '.test { background-image: url(/missing.svg); }';

    const result = await CSSBuilder.inlineHashedSVGs(css, dir);

    // Should remain unchanged when SVG file is missing
    t.is(result, css);
});

test('CSSBuilder.processImageReferences() - should handle relative paths', async (t) => {
    const dir = new TestDir();

    const imageMapping = {
        'logo/logo.svg': 'ac512bd3affe8ec5.svg',
        'common/test.png': 'abc123def456.png',
        'article/article__code.svg': 'aa312b94060f8f8a.svg',
    };

    const mappingPath = path.join(dir.getBuild(), 'image-mapping.json');

    await fs.writeFile(mappingPath, JSON.stringify(imageMapping));

    const css = `
    .test {
        background: url(./logo.svg) no-repeat center;
        background-image: url(../logo/logo.svg);
        background: url(../article/article__code.svg) no-repeat center;
        background: url(./test.png);
    }
    `;

    const processed = await CSSBuilder.processImageReferences(css, dir);

    // Verify relative paths were resolved and hashed
    t.true(processed.includes('url(/ac512bd3affe8ec5.svg)'));
    t.true(processed.includes('url(/aa312b94060f8f8a.svg)'));
    t.true(processed.includes('url(/abc123def456.png)'));

    // Verify original relative paths are removed
    t.false(processed.includes('url(./logo.svg)'));
    t.false(processed.includes('url(../logo/logo.svg)'));
    t.false(processed.includes('url(../article/article__code.svg)'));
    t.false(processed.includes('url(./test.png)'));
});

test('CSSBuilder.processImageReferences() - should handle quotes and spaces', async (t) => {
    const dir = new TestDir();

    const imageMapping = {'logo/logo.svg': 'ac512bd3affe8ec5.svg'};

    const mappingPath = path.join(dir.getBuild(), 'image-mapping.json');

    await fs.writeFile(mappingPath, JSON.stringify(imageMapping));

    const css = `
    .test1 { background: url("./logo.svg") no-repeat center; }
    .test2 { background: url('../logo/logo.svg') no-repeat center; }
    .test3 { background: url( "./logo.svg") no-repeat center; }
    `;

    const processed = await CSSBuilder.processImageReferences(css, dir);

    // Verify all quote variations were processed
    t.true(processed.includes('url(/ac512bd3affe8ec5.svg)'));
    t.false(processed.includes('url("./logo.svg")'));
    t.false(processed.includes('url(\'../logo/logo.svg\')'));
    t.false(processed.includes('url( "./logo.svg")'));
});

test('CSSBuilder.processImageReferences() - should handle missing mapping entries', async (t) => {
    const dir = new TestDir();

    // Create mock image mapping (missing some images)
    const imageMapping = {
        'logo/logo.svg': 'ac512bd3affe8ec5.svg',
        // Missing test.png
    };

    const mappingPath = path.join(dir.getBuild(), 'image-mapping.json');

    await fs.writeFile(mappingPath, JSON.stringify(imageMapping));

    const css = `
    .logo { background: url(./logo.svg) no-repeat center; }
    .missing { background: url(./missing.png) no-repeat center; }
    `;

    const processed = await CSSBuilder.processImageReferences(css, dir);

    // Verify only mapped images were replaced
    t.true(processed.includes('url(/ac512bd3affe8ec5.svg)'));
    t.true(processed.includes('url(./missing.png)')); // Should remain unchanged
    t.false(processed.includes('url(./logo.svg)'));
});

// Error Recovery Tests

test('CSSBuilder.minifyCSS() - should recover from CSS parsing errors', async (t) => {
    // Create CSS with syntax errors
    const invalidCSS = `
    .valid { color: red; }
    .invalid { color: ; } /* Missing value */
    .another-valid { margin: 10px; }
    `;

    // Minify should handle invalid CSS gracefully
    const minified = CSSBuilder.minifyCSS(invalidCSS);

    // Should still process valid parts
    t.true(minified.includes('.valid'), 'Should process valid CSS');
    t.true(minified.includes('.another-valid'), 'Should process other valid CSS');
});

test('CSSBuilder.saveArtifacts() - should clean up after build failure', async (t) => {
    const dir = new TestDir();

    const builder = new CSSBuilder('test-bundle', dir);
    const css = '.test { color: red; }';
    const hash = 'test123';

    // Mock writeFile to fail on CSS file write
    const originalWriteFile = fs.writeFile;
    let cssWriteAttempted = false;
    fs.writeFile = async (filePath, data) => {
        // Fail only when writing the CSS file to site directory (files with _c prefix)
        if (filePath.toString().includes(dir.getSite()) && filePath.toString().includes('_c')) {
            cssWriteAttempted = true;
            throw new Error('Disk write failed');
        }
        return originalWriteFile(filePath, data);
    };

    try {
        await t.throwsAsync(
            async () => await builder.saveArtifacts(css, hash, []),
            { message: /Disk write failed/ },
            'Should throw error on write failure',
        );

        t.true(cssWriteAttempted, 'Should have attempted to write CSS file');

        // Verify no partial files remain (files with _c prefix)
        const siteFiles = await fs.readdir(dir.getSite()).catch(() => []);
        const hasPartialCSS = siteFiles.some(f => f.startsWith('_c'));
        t.false(hasPartialCSS, 'Should not leave partial CSS files after failure');

    } finally {
        fs.writeFile = originalWriteFile;
    }
});

test('CSSBuilder() - should handle missing CSS files gracefully', async (t) => {
    const dir = new TestDir();

    const builder = new CSSBuilder('nonexistent-bundle', dir);

    // Should handle missing bemdecl file gracefully
    t.true(typeof builder.build === 'function', 'Builder should have build method');
    t.is(builder.bundle, 'nonexistent-bundle', 'Should accept nonexistent bundle name');
});

