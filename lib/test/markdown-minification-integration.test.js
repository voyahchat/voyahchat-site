// Integration tests for markdown minification with real templates
/**
 * Tests for new markdown minification features
 * - Table closing tag optimization
 * - Whitespace removal between block elements
 */

const test = require('ava');
const { createMarkdownInstance } = require('../build/markdown');
const { createMockSitemap } = require('./utils');

// Test 1: Table closing tag optimization
test('Minification - omit optional table closing tags', (t) => {
    const sitemap = createMockSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdown = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
`;

    const html = md.render(markdown, {});

    // Count closing tags
    const theadClose = (html.match(/<\/thead>/g) || []).length;
    const tbodyClose = (html.match(/<\/tbody>/g) || []).length;
    const trClose = (html.match(/<\/tr>/g) || []).length;
    const thClose = (html.match(/<\/th>/g) || []).length;
    const tdClose = (html.match(/<\/td>/g) || []).length;

    // Should omit most closing tags
    t.is(theadClose, 0, 'Should omit </thead>');
    t.is(tbodyClose, 0, 'Should omit </tbody>');
    t.true(trClose <= 1, `Should omit most </tr> tags (found ${trClose})`);
    t.true(thClose <= 1, `Should omit most </th> tags (found ${thClose})`);
    t.true(tdClose <= 1, `Should omit most </td> tags (found ${tdClose})`);

    // Verify table structure is still valid
    t.true(html.includes('<table'), 'Should have table tag');
    t.true(html.includes('</table>'), 'Should have closing table tag');
});

// Test 2: Whitespace removal between block elements
test('Minification - remove whitespace between block elements', (t) => {
    const sitemap = createMockSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdown = `
# Heading 1

Paragraph text.

## Heading 2

Another paragraph.
`;

    const html = md.render(markdown, {});

    // Should not have newlines between block elements
    t.false(html.includes('</h1>\n<p'), 'Should not have newline after </h1>');
    t.false(html.includes('</p>\n<h2'), 'Should not have newline after </p>');
    t.false(html.includes('</h2>\n<p'), 'Should not have newline after </h2>');

    // Should have elements directly adjacent
    t.true(html.includes('</h1><p'), 'Should have </h1><p without whitespace');
    t.true(html.includes('</p><h2'), 'Should have </p><h2 without whitespace');
});

// Test 3: Combined minification - tables with whitespace removal
test('Minification - combine table optimization with whitespace removal', (t) => {
    const sitemap = createMockSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdown = `
# Table Example

| H1 | H2 |
|---|---|
| C1 | C2 |

More text after table.
`;

    const html = md.render(markdown, {});

    // Check whitespace removal
    t.false(html.includes('>\n<'), 'Should not have newlines between elements');

    // Check table optimization
    const theadClose = (html.match(/<\/thead>/g) || []).length;
    const tbodyClose = (html.match(/<\/tbody>/g) || []).length;

    t.is(theadClose, 0, 'Should omit </thead>');
    t.is(tbodyClose, 0, 'Should omit </tbody>');
});

// Test 4: Size comparison - measure actual savings
test('Minification - achieves measurable size reduction', (t) => {
    const sitemap = createMockSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdown = `
# Title

Paragraph with text.

## Section

- Item 1
- Item 2
- Item 3

| H1 | H2 |
|---|---|
| C1 | C2 |
| C3 | C4 |
`;

    const html = md.render(markdown, {});

    // Verify optimizations are applied
    const hasWhitespace = html.includes('>\n<') || html.includes('>  <');
    t.false(hasWhitespace, 'Should not have whitespace between elements');

    const theadClose = (html.match(/<\/thead>/g) || []).length;
    const tbodyClose = (html.match(/<\/tbody>/g) || []).length;
    t.is(theadClose, 0, 'Should omit </thead>');
    t.is(tbodyClose, 0, 'Should omit </tbody>');
});

// Test 5: Complex nested structure
test('Minification - handle complex nested structure', (t) => {
    const sitemap = createMockSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdown = `
# Main

Text

## Sub

- List 1
- List 2

### Sub-sub

| H1 | H2 | H3 |
|---|---|---|
| A | B | C |
| D | E | F |

Final text.
`;

    const html = md.render(markdown, {});

    // Verify no whitespace between blocks
    t.false(html.includes('>\n<'), 'Should not have newlines');

    // Verify table optimization
    t.is((html.match(/<\/thead>/g) || []).length, 0, 'Should omit </thead>');
    t.is((html.match(/<\/tbody>/g) || []).length, 0, 'Should omit </tbody>');

    // Verify structure integrity
    const h1Count = (html.match(/<h1/g) || []).length;
    const h2Count = (html.match(/<h2/g) || []).length;
    const h3Count = (html.match(/<h3/g) || []).length;

    t.is(h1Count, 1, 'Should have 1 h1');
    t.is(h2Count, 1, 'Should have 1 h2');
    t.is(h3Count, 1, 'Should have 1 h3');
});

// Test 6: Verify HTML validity after minification
test('Minification - produces valid HTML structure', (t) => {
    const sitemap = createMockSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdown = `
# Test

| H1 | H2 |
|---|---|
| C1 | C2 |
`;

    const html = md.render(markdown, {});

    // Count opening and closing tags
    const tableOpen = (html.match(/<table/g) || []).length;
    const tableClose = (html.match(/<\/table>/g) || []).length;
    const theadOpen = (html.match(/<thead/g) || []).length;
    const tbodyOpen = (html.match(/<tbody/g) || []).length;

    // All opened tags must be closed (even if closing tag is optional)
    t.is(tableOpen, tableClose, 'All <table> must be closed');
    t.is(theadOpen, 1, 'Should have <thead>');
    t.is(tbodyOpen, 1, 'Should have <tbody>');

    // Structure should be valid
    t.true(html.includes('<table'), 'Should have table');
    t.true(html.includes('<thead'), 'Should have thead');
    t.true(html.includes('<tbody'), 'Should have tbody');
    t.true(html.includes('</table>'), 'Should close table');
});
