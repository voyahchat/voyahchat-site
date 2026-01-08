/**
 * AVA tests for build-html helper functions
 */

const test = require('ava');

// Import helper functions from build-html
const {
    fixDoctypeSpacing,
    removeTagWhitespace,
    urlToFlatFilename,
    cleanUrl,
} = require('../build/build-html');

// Tests for fixDoctypeSpacing()

test('fixDoctypeSpacing() - should add space to minified doctype', (t) => {
    const minifiedHtml =
        '<!doctypehtml><html lang=ru><head><title>Test</title></head><body>Test content</body></html>';
    const expectedHtml =
        '<!doctype html><html lang=ru><head><title>Test</title></head><body>Test content</body></html>';

    const result = fixDoctypeSpacing(minifiedHtml);

    t.is(result, expectedHtml);
});

// Tests for removeTagWhitespace()

test('removeTagWhitespace() - should remove whitespace between tags', (t) => {
    const htmlWithWhitespace = '<div>\n    <p>Hello</p>\n    <span>World</span>\n</div>';
    const expectedHtml = '<div><p>Hello</p><span>World</span></div>';

    const result = removeTagWhitespace(htmlWithWhitespace);

    t.is(result, expectedHtml);
});

test('removeTagWhitespace() - should preserve content within tags', (t) => {
    const htmlWithContent = '<p>Hello   World</p><div>  Test  </div>';
    const expectedHtml = '<p>Hello   World</p><div>  Test  </div>';

    const result = removeTagWhitespace(htmlWithContent);

    t.is(result, expectedHtml);
});

test('removeTagWhitespace() - should handle complex nested structure', (t) => {
    const complexHtml = '<div>\n    <ul>\n        <li>Item 1</li>\n        <li>Item 2</li>\n    </ul>\n' +
        '<p>Text</p>\n</div>';
    const expectedHtml = '<div><ul><li>Item 1</li><li>Item 2</li></ul><p>Text</p></div>';

    const result = removeTagWhitespace(complexHtml);

    t.is(result, expectedHtml);
});

test('removeTagWhitespace() - should preserve code block content', (t) => {
    const codeHtml = '<pre><code>function test() {\n    return "hello";\n}</code></pre>';
    const expectedHtml = '<pre><code>function test() {\n    return "hello";\n}</code></pre>';

    const result = removeTagWhitespace(codeHtml);

    t.is(result, expectedHtml);
});

// Tests for urlToFlatFilename()

test('urlToFlatFilename() - should convert root URL to index.html', (t) => {
    const result = urlToFlatFilename('/');
    t.is(result, 'index.html');
});

test('urlToFlatFilename() - should convert nested URL to flat filename', (t) => {
    const result = urlToFlatFilename('/free/12v');
    t.is(result, 'free_12v.html');
});

test('urlToFlatFilename() - should handle trailing slashes', (t) => {
    const result = urlToFlatFilename('/about/');
    t.is(result, 'about_.html');
});

test('urlToFlatFilename() - should handle deeply nested URLs', (t) => {
    const result = urlToFlatFilename('/level1/level2/level3/page');
    t.is(result, 'level1_level2_level3_page.html');
});

// Tests for cleanUrl()

test('cleanUrl() - should remove trailing slashes', (t) => {
    const result = cleanUrl('/about/');
    t.is(result, '/about');
});

test('cleanUrl() - should handle URLs without trailing slashes', (t) => {
    const result = cleanUrl('/about');
    t.is(result, '/about');
});

test('cleanUrl() - should handle root URL', (t) => {
    const result = cleanUrl('/');
    t.is(result, '/');
});

test('cleanUrl() - should remove multiple trailing slashes', (t) => {
    const result = cleanUrl('/about///');
    t.is(result, '/about');
});

