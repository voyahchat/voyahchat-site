/**
 * AVA tests for markdown element rendering
 * Tests: headings, paragraphs, lists, blockquotes, code blocks, video embeds, tables, inline elements
 */

const test = require('ava');
const { createMarkdownInstance } = require('../build/markdown');

test.beforeEach(() => {
    // Reset module caches
    delete require.cache[require.resolve('../build/markdown.js')];
});

// Heading Tests
test('markdown renderer - generates hierarchical anchors', (t) => {
    const md = createMarkdownInstance();

    const markdown = `# Заголовок

## Подзаголовок

### Третий уровень`;

    const html = md.render(markdown);

    t.true(html.includes('id=заголовок'));
    t.true(html.includes('id=заголовок-подзаголовок'));
    t.true(html.includes('id=заголовок-подзаголовок-третий-уровень'));
});

test('markdown renderer - adds CSS classes', (t) => {
    const md = createMarkdownInstance();

    const markdown = `# Заголовок

## Подзаголовок`;

    const html = md.render(markdown);

    t.true(html.includes('class="article__heading article__heading_level_1"'));
    t.true(html.includes('class="article__heading article__heading_level_2"'));
});

test('markdown renderer - wraps in anchor links', (t) => {
    const md = createMarkdownInstance();

    const markdown = '# Заголовок';

    const html = md.render(markdown);

    t.true(html.includes('<a href=#заголовок class=article__heading-anchor>Заголовок</a>'));
});

test('markdown renderer - handles custom anchor syntax', (t) => {
    const md = createMarkdownInstance();

    const markdown = '# Заголовок {#custom-anchor}';

    const html = md.render(markdown);

    t.true(html.includes('id=custom-anchor'));
    t.false(html.includes('{#custom-anchor}'));
    t.true(html.includes('<a href=#custom-anchor class=article__heading-anchor>Заголовок</a>'));
});

test('markdown renderer - handles Cyrillic anchor links', (t) => {
    const md = createMarkdownInstance();

    const markdown = `# Мультимедиа

## Настройки

[Ссылка на настройки](#настройки)`;

    const html = md.render(markdown);

    t.true(html.includes('id=мультимедиа'));
    t.true(html.includes('id=мультимедиа-настройки'));
    t.true(html.includes('href=#мультимедиа-настройки'));
});

test('markdown renderer - handles numbered headings correctly', (t) => {
    const md = createMarkdownInstance();

    const markdown = `# 1. Основной раздел

## 2.1. Подраздел

### 3. Третий уровень`;

    const html = md.render(markdown);

    t.true(html.includes('id=основной-раздел'));
    t.true(html.includes('id=основной-раздел-подраздел'));
    t.true(html.includes('id=основной-раздел-подраздел-третий-уровень'));
});

// Code Block Tests (from markdown-code-blocks.test.js)
test('markdown renderer - renders with article__code class', (t) => {
    const md = createMarkdownInstance();
    const result = md.render('```js\nconsole.log("test");\n```');

    t.true(result.includes('class=article__code'));
    t.true(result.includes('class=article__code-copy'));
    t.true(result.includes('aria-label="Copy code to clipboard"'));
    t.true(result.includes('title="Copy code"'));
});

test('markdown renderer - renders correctly with language', (t) => {
    const md = createMarkdownInstance();
    const result = md.render('```javascript\nconst x = 1;\n```');

    t.true(result.includes('class=article__code'));
    t.true(result.includes('const x = 1;'));
});

test('markdown renderer - renders without language', (t) => {
    const md = createMarkdownInstance();
    const result = md.render('```\nsome code\n```');

    t.true(result.includes('class=article__code'));
    t.true(result.includes('some code'));
});

test('markdown renderer - indented block renders with article__code class', (t) => {
    const md = createMarkdownInstance();
    const result = md.render('    indented code\n    more code');

    t.true(result.includes('class=article__code'));
    t.true(result.includes('class=article__code-copy'));
});

test('markdown renderer - preserves content correctly', (t) => {
    const md = createMarkdownInstance();
    const code = 'console.log("Hello, World!");';
    const result = md.render(`\`\`\`js\n${code}\n\`\`\``);

    t.true(result.includes('console.log("Hello, World!");'));
});

test('markdown renderer - handles special characters', (t) => {
    const md = createMarkdownInstance();
    const code = '<script>alert("test");</script>';
    const result = md.render(`\`\`\`html\n${code}\n\`\`\``);

    t.true(result.includes('class=article__code'));
    t.true(result.includes('<script>alert("test");</script>'));
});

test('markdown renderer - handles multiple lines', (t) => {
    const md = createMarkdownInstance();
    const code = 'line 1\nline 2\nline 3';
    const result = md.render(`\`\`\`\n${code}\n\`\`\``);

    t.true(result.includes('class=article__code'));
    t.true(result.includes('line 1'));
    t.true(result.includes('line 2'));
    t.true(result.includes('line 3'));
});

// Video Embed Tests (from markdown-video.test.js)
test('markdown renderer - YouTube plugin syntax converts to iframe', (t) => {
    const md = createMarkdownInstance({
        imageMapping: {}, // Empty mapping to prevent file reading
        sitemap: { md2url: {}, url2md: {}, pages: {} }, // Empty sitemap to prevent file reading
    });
    const result = md.render('@[youtube](bsgLJcQz43s)');

    t.true(result.includes('<iframe'));
    t.true(result.includes('src="https://www.youtube.com/embed/bsgLJcQz43s"'));
    t.true(result.includes('class=video__iframe'));
});

test('markdown renderer - YouTube URL converts to link, not iframe', (t) => {
    const md = createMarkdownInstance({
        imageMapping: {}, // Empty mapping to prevent file reading
        sitemap: { md2url: {}, url2md: {}, pages: {} }, // Empty sitemap to prevent file reading
    });
    const result = md.render('https://www.youtube.com/watch?v=bsgLJcQz43s');

    // Regular URLs should be converted to links, not iframes
    // URLs with = require quotes per HTML5 spec
    t.true(result.includes('href="https://www.youtube.com/watch?v=bsgLJcQz43s"'));
    t.true(result.includes('class=article__link'));
});

test('markdown renderer - embed has correct structure', (t) => {
    const md = createMarkdownInstance({
        imageMapping: {}, // Empty mapping to prevent file reading
        sitemap: { md2url: {}, url2md: {}, pages: {} }, // Empty sitemap to prevent file reading
    });
    const result = md.render('@[youtube](bsgLJcQz43s)');

    // Check that it generates the correct video structure
    t.true(result.includes('<div class=video>'));
    t.true(result.includes('<iframe class=video__iframe'));
    t.true(result.includes('src="https://www.youtube.com/embed/bsgLJcQz43s"'));
    t.true(result.includes('allowfullscreen'));
});
