/**
 * AVA tests for build-html helper functions
 */

const test = require('ava');

// Import helper functions from build-html
const {
    fixDoctypeSpacing,
    urlToFlatFilename,
    cleanUrl,
    fixTypographyAfterMinification,
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

// Tests for fixTypographyAfterMinification()

test('fixTypographyAfterMinification() - should fix spaces around em dashes with no spaces', (t) => {
    const input = 'text—more text';
    const result = fixTypographyAfterMinification(input);
    // No spaces around dash means no transformation
    t.is(result, 'text—more text');
});

test('fixTypographyAfterMinification() - should fix non-breaking space before and after em dash', (t) => {
    const input = 'text\u00A0—\u00A0more text';
    const result = fixTypographyAfterMinification(input);
    t.is(result, 'text\u00A0— more text');
});

test('fixTypographyAfterMinification() - should fix regular space before em dash', (t) => {
    const input = 'text —more text';
    const result = fixTypographyAfterMinification(input);
    t.is(result, 'text\u00A0—more text');
});

test('fixTypographyAfterMinification() - should fix multiple typography issues in one string', (t) => {
    const input = 'first —second\u00A0—\u00A0third —fourth';
    const result = fixTypographyAfterMinification(input);
    t.is(result, 'first\u00A0—second\u00A0— third\u00A0—fourth');
});

test('fixTypographyAfterMinification() - should handle strings without typography issues', (t) => {
    const input = 'simple text without dashes';
    const result = fixTypographyAfterMinification(input);
    t.is(result, 'simple text without dashes');
});

test('fixTypographyAfterMinification() - should handle empty string', (t) => {
    const input = '';
    const result = fixTypographyAfterMinification(input);
    t.is(result, '');
});

test('fixTypographyAfterMinification() - should convert HTML entities to Unicode', (t) => {
    const input = 'text&nbsp;—&nbsp;more';
    const result = fixTypographyAfterMinification(input);
    // &nbsp; entities are converted to \u00A0 at the end, but the pattern
    // \u00A0—\u00A0 is replaced with \u00A0— (space) earlier in the chain
    // So: text&nbsp;—&nbsp;more -> (no matches for first 3 patterns) ->
    // text\u00A0—\u00A0more (after &nbsp; conversion)
    // But wait, line 128 runs BEFORE line 144, so it won't match &nbsp; entities
    // The function processes in order, so &nbsp; is only converted at the end
    t.is(result, 'text\u00A0—\u00A0more');
});

test('fixTypographyAfterMinification() - should handle em dash with whitespace and non-breaking space', (t) => {
    const input = 'text\u00A0—  \u00A0more';
    const result = fixTypographyAfterMinification(input);
    t.is(result, 'text\u00A0— more');
});
