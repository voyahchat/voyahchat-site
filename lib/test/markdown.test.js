/**
 * AVA tests for markdown-it configuration and core functionality
 * Tests: instance creation, CSS classes, typography, plugin integration
 */

const test = require('ava');
const { createMarkdownInstance } = require('../build/markdown');

// Test helper to create mock data objects
// Note: This function is kept in this test file rather than utils.js because it's
// specifically tailored for markdown rendering tests and not reused elsewhere
function createMockData() {
    const sitemap = {
        sitemap: ['/', '/section/page'],
        pages: {
            '/': {
                file: 'index.md',
                url: '/',
                title: 'Home',
                section: null,
                breadcrumbs: [],
                pageTitle: 'Home | Voyah',
            },
            '/section/page': {
                file: 'section/page.md',
                url: '/section/page',
                title: 'Page',
                section: 'section',
                breadcrumbs: ['/section'],
                pageTitle: 'Page | Section | Voyah',
            },
        },
        md2url: {
            'index.md': '/',
            'page.md': '/section/page',
            'section/page.md': '/section/page',
        },
        url2md: {
            '/': 'index.md',
            '/section/page': 'page.md',
        },
    };

    const imageMapping = {
        'images/test.png': 'abc123def456.png',
        'logo.svg': 'def456ghi789.svg',
    };

    return { sitemap, imageMapping };
}

test.beforeEach(() => {
    // Reset module caches
    delete require.cache[require.resolve('../build/markdown.js')];
});

// Instance Creation Tests
test('createMarkdownInstance() - should create markdown-it instance', (t) => {
    const md = createMarkdownInstance();

    t.truthy(md);
    t.truthy(md.render);
    t.truthy(md.use);
});

// Typography Tests
test('Markdown rendering - should apply Russian typography', (t) => {
    const md = createMarkdownInstance();

    const markdown = 'Текст — с тире';
    const html = md.render(markdown);

    // Should replace regular space around em dash with non-breaking space before
    t.true(html.includes('\u00A0— '));
});

test('Markdown rendering - should apply typography to inline content', (t) => {
    const md = createMarkdownInstance();

    const markdown = 'Текст с — тире и **жирным** текстом.';
    const html = md.render(markdown);

    t.true(html.includes('\u00A0— тире'));
    t.true(html.includes('<strong>жирным</strong>'));
});

// Typography Protection Tests for Code
test('Markdown rendering - should NOT apply typography to fenced code blocks', (t) => {
    const md = createMarkdownInstance();

    const markdown = `Regular text with — em dash.

\`\`\`
2026  — год
0107  — месяц, день
21213 — динамический пароль, сложить каждый столбец отдельно
\`\`\`

More text with — em dash.`;

    const html = md.render(markdown);

    // Regular text should have typography
    t.true(html.includes('Regular text with\u00A0— em dash'));
    t.true(html.includes('More text with\u00A0— em dash'));

    // Code block should NOT have typography
    t.true(html.includes('2026  — год'));
    t.true(html.includes('0107  — месяц, день'));
    t.true(html.includes('21213 — динамический пароль, сложить каждый столбец отдельно'));

    // Verify code block structure
    t.true(html.includes('class=article__code'));
});

test('Markdown rendering - should NOT apply typography to indented code blocks', (t) => {
    const md = createMarkdownInstance();

    const markdown = `Regular text with — em dash.

    2026  — год
    0107  — месяц, день
    21213 — динамический пароль, сложить каждый столбец отдельно

More text with — em dash.`;

    const html = md.render(markdown);

    // Regular text should have typography
    t.true(html.includes('Regular text with\u00A0— em dash'));
    t.true(html.includes('More text with\u00A0— em dash'));

    // Indented code block should NOT have typography
    t.true(html.includes('2026  — год'));
    t.true(html.includes('0107  — месяц, день'));
    t.true(html.includes('21213 — динамический пароль, сложить каждый столбец отдельно'));

    // Verify code block structure
    t.true(html.includes('class=article__code'));
});

test('Markdown rendering - should NOT apply typography to inline code', (t) => {
    const md = createMarkdownInstance();

    const markdown = `Regular text with — em dash and \`2026  — год\` inline code.

More text with \`0107  — месяц, день\` and — em dash.`;

    const html = md.render(markdown);

    // Regular text should have typography
    t.true(html.includes('Regular text with\u00A0— em dash'));
    t.true(html.includes('and\u00A0— em dash'));

    // Inline code should NOT have typography
    t.true(html.includes('<code>2026  — год</code>'));
    t.true(html.includes('<code>0107  — месяц, день</code>'));

    // Verify no typography in inline code
    t.false(html.includes('<code>2026\u00A0— год</code>'));
    t.false(html.includes('<code>0107\u00A0— месяц, день</code>'));
});

test('Markdown rendering - should apply typography to regular text but protect all code types', (t) => {
    const md = createMarkdownInstance();

    const markdown = `# Heading with — em dash

Regular paragraph with — em dash.

\`\`\`javascript
const code = "2026  — год";
const more = "0107  — месяц, день";
\`\`\`

Inline code: \`2026  — год\` and \`0107  — месяц, день\`.

    Indented code block:
    2026  — год
    0107  — месяц, день

Final paragraph with — em dash.`;

    const html = md.render(markdown);

    // Headings and regular paragraphs should have typography
    t.true(html.includes('Heading with\u00A0— em dash'));
    t.true(html.includes('Regular paragraph with\u00A0— em dash'));
    t.true(html.includes('Final paragraph with\u00A0— em dash'));

    // Fenced code block should NOT have typography
    t.true(html.includes('const code = "2026  — год"'));
    t.true(html.includes('const more = "0107  — месяц, день"'));

    // Inline code should NOT have typography
    t.true(html.includes('<code>2026  — год</code>'));
    t.true(html.includes('<code>0107  — месяц, день</code>'));

    // Indented code block should NOT have typography
    t.true(html.includes('2026  — год'));
    t.true(html.includes('0107  — месяц, день'));

    // Verify no non-breaking spaces in any code content
    t.false(html.includes('2026\u00A0— год'));
    t.false(html.includes('0107\u00A0— месяц, день'));
});

test('Markdown rendering - should handle mixed content with code and typography correctly', (t) => {
    const md = createMarkdownInstance();

    const markdown = `Text with — em dash, then \`code with — dash\`, then more text — end.

> Blockquote with — em dash and \`code with — dash\` inside.

- List item with — em dash
- Item with \`code with — dash\`
- Final item with — em dash`;

    const html = md.render(markdown);

    // Regular text in all contexts should have typography
    t.true(html.includes('Text with\u00A0— em dash'));
    t.true(html.includes('then more text\u00A0— end'));
    t.true(html.includes('Blockquote with\u00A0— em dash'));
    t.true(html.includes('List item with\u00A0— em dash'));
    t.true(html.includes('Final item with\u00A0— em dash'));

    // All inline code should NOT have typography
    t.true(html.includes('<code>code with — dash</code>'));
    t.false(html.includes('<code>code with\u00A0— dash</code>'));

    // Count occurrences to ensure we have the right balance
    const regularTypographyCount = (html.match(/\u00A0— /g) || []).length;
    const codeWithoutTypographyCount = (html.match(/<code>[^<]*—[^<]*<\/code>/g) || []).length;

    t.true(
        regularTypographyCount >= 5,
        `Should have at least 5 regular typography applications, found ${regularTypographyCount}`,
    );
    t.true(
        codeWithoutTypographyCount >= 3,
        `Should have at least 3 code elements without typography, found ${codeWithoutTypographyCount}`,
    );
});

// CSS Class Tests - Paragraphs
test('Markdown rendering - should add classes to paragraphs', (t) => {
    const md = createMarkdownInstance();

    const markdown = 'Это параграф текста.';

    const html = md.render(markdown);

    t.true(html.includes('class=article__paragraph'));
});

// CSS Class Tests - Links
test('Markdown rendering - should add classes to links', (t) => {
    const md = createMarkdownInstance();

    const markdown = '[Ссылка](https://example.com)';

    const html = md.render(markdown);

    t.true(html.includes('class=article__link'));
});

test('Markdown rendering - should preserve external links', (t) => {
    const md = createMarkdownInstance();

    const markdown = '[Внешняя ссылка](https://example.com)';
    const html = md.render(markdown);

    t.true(html.includes('href=https://example.com'));
});

test('Markdown rendering - should preserve mailto links', (t) => {
    const md = createMarkdownInstance();

    const markdown = '[Email](mailto:test@example.com)';
    const html = md.render(markdown);

    t.true(html.includes('href=mailto:test@example.com'));
});

test('Markdown rendering - should preserve absolute paths', (t) => {
    const md = createMarkdownInstance();

    const markdown = '[Абсолютная ссылка](/absolute/path)';
    const html = md.render(markdown);

    t.true(html.includes('href=/absolute/path'));
});

// CSS Class Tests - Lists
test('Markdown rendering - should add classes to lists', (t) => {
    const md = createMarkdownInstance();

    const markdown = `- Элемент 1
- Элемент 2

1. Нумерованный 1
2. Нумерованный 2`;

    const html = md.render(markdown);

    t.true(html.includes('class=article__list'));
    t.true(html.includes('class="article__list article__list_ordered"'));
    t.true(html.includes('class=article__list-item'));
});

// CSS Class Tests - Blockquotes
test('Markdown rendering - should add classes to blockquotes', (t) => {
    const md = createMarkdownInstance();

    const markdown = '> Это цитата';

    const html = md.render(markdown);

    t.true(html.includes('class=article__blockquote'));
});

// CSS Class Tests - Tables
test('Markdown rendering - should add classes to tables', (t) => {
    const md = createMarkdownInstance();

    const markdown = `| Заголовок 1 | Заголовок 2 |
| ----------- | ----------- |
| Ячейка 1    | Ячейка 2    |
| Ячейка 3    | Ячейка 4    |`;

    const html = md.render(markdown);

    t.true(html.includes('class=article__table'));
    t.true(html.includes('class=article__table-head'));
    t.true(html.includes('class=article__table-body'));
    t.true(html.includes('class=article__table-row'));
    t.true(html.includes('class="article__table-cell article__table-cell_header"'));
    t.true(html.includes('class=article__table-cell'));
});

// Plugin Integration Tests - Image Transformation
test('Markdown rendering - should transform image paths with hashes', (t) => {
    const { imageMapping } = createMockData();
    const md = createMarkdownInstance({ imageMapping });

    const markdown = '![Тест](images/test.png)';
    const html = md.render(markdown);

    t.true(html.includes('src=/abc123def456.png'));
    t.true(html.includes('class=article__image'));
});

test('Markdown rendering - should warn about unmapped images', (t) => {
    // Test that unmapped images generate warnings but don't break rendering
    const { imageMapping } = createMockData();
    const md = createMarkdownInstance({ imageMapping });

    const markdown = '![Missing](images/missing.png)';
    const html = md.render(markdown);

    // Should still render the image tag with original path
    t.true(html.includes('src=images/missing.png'));
    t.true(html.includes('class=article__image'));
});

// Plugin Integration Tests - Link Transformation
test('Markdown rendering - should transform relative markdown links', (t) => {
    const { sitemap } = createMockData();
    const md = createMarkdownInstance({ sitemap });

    const markdown = '[Ссылка на страницу](page.md)';
    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    t.true(html.includes('href=/section/page'));
});

test('Markdown rendering - should throw error for unknown relative HTML links', (t) => {
    const { sitemap } = createMockData();
    const md = createMarkdownInstance({ sitemap });

    const markdown = '[Ссылка на страницу](page.html)';
    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};

    const error = t.throws(() => {
        md.render(markdown, env);
    }, {
        instanceOf: Error,
        message: /Unknown relative link type/,
    });

    t.true(error.message.includes('html/page.html'));
    t.true(error.message.includes('./external/voyahchat-content/section/index.md'));
});

test('Markdown rendering - should handle links with anchors', (t) => {
    const { sitemap } = createMockData();
    const md = createMarkdownInstance({ sitemap });

    const markdown = '[Ссылка с якорем](page.md#anchor)';
    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    t.true(html.includes('href=/section/page#anchor'));
});

test('Markdown rendering - should transform links when sitemap loaded from cache', (t) => {
    // This test verifies the bug fix where md2urlToUse was assigned before loadsitemap()
    // causing it to remain empty even after sitemap was loaded
    const sitemap = {
        sitemap: ['/', '/free', '/free/models', '/free/firmware', '/free/maintenance'],
        pages: {
            '/free': {
                file: 'free/index.md',
                url: '/free',
                title: 'Free',
                section: 'free',
                breadcrumbs: [],
                pageTitle: 'Free | Voyah',
            },
            '/free/models': {
                file: 'free/models.md',
                url: '/free/models',
                title: 'Модели',
                section: 'free',
                breadcrumbs: ['/free'],
                pageTitle: 'Модели | Free | Voyah',
            },
            '/free/firmware': {
                file: 'free/firmware.md',
                url: '/free/firmware',
                title: 'Прошивка',
                section: 'free',
                breadcrumbs: ['/free'],
                pageTitle: 'Прошивка | Free | Voyah',
            },
            '/free/maintenance': {
                file: 'free/maintenance.md',
                url: '/free/maintenance',
                title: 'Обслуживание',
                section: 'free',
                breadcrumbs: ['/free'],
                pageTitle: 'Обслуживание | Free | Voyah',
            },
        },
        md2url: {
            'free/index.md': '/free',
            'free/models.md': '/free/models',
            'free/firmware.md': '/free/firmware',
            'free/maintenance.md': '/free/maintenance',
        },
        url2md: {
            '/free': 'free/index.md',
            '/free/models': 'free/models.md',
            '/free/firmware': 'free/firmware.md',
            '/free/maintenance': 'free/maintenance.md',
        },
    };

    const md = createMarkdownInstance({ sitemap });

    const markdown = `* [Модели](models.md)
* [Прошивка](firmware.md)
* [Обслуживание](maintenance.md)`;

    const env = {page: {inputPath: './external/voyahchat-content/free/index.md'}};

    const html = md.render(markdown, env);

    // All three links should be transformed correctly
    t.true(html.includes('href=/free/models'), 'models.md should transform to /free/models');
    t.true(html.includes('href=/free/firmware'), 'firmware.md should transform to /free/firmware');
    t.true(html.includes('href=/free/maintenance'), 'maintenance.md should transform to /free/maintenance');

    // No .md links should remain
    t.false(html.includes('href=models.md'), 'models.md link should be transformed');
    t.false(html.includes('href=firmware.md'), 'firmware.md link should be transformed');
    t.false(html.includes('href=maintenance.md'), 'maintenance.md link should be transformed');
});

test('Markdown rendering - should transform links with basename matching in current section', (t) => {
    // Test the enhanced logic that looks for files by basename in the current section
    const sitemap = {
        sitemap: ['/', '/free', '/free/models', '/dreamer', '/dreamer/models'],
        pages: {
            '/free': {
                file: 'free/index.md',
                url: '/free',
                title: 'Free',
                section: 'free',
                breadcrumbs: [],
                pageTitle: 'Free | Voyah',
            },
            '/free/models': {
                file: 'free/models.md',
                url: '/free/models',
                title: 'Модели Free',
                section: 'free',
                breadcrumbs: ['/free'],
                pageTitle: 'Модели Free | Free | Voyah',
            },
            '/dreamer': {
                file: 'dreamer/index.md',
                url: '/dreamer',
                title: 'Dreamer',
                section: 'dreamer',
                breadcrumbs: [],
                pageTitle: 'Dreamer | Voyah',
            },
            '/dreamer/models': {
                file: 'dreamer/models.md',
                url: '/dreamer/models',
                title: 'Модели Dreamer',
                section: 'dreamer',
                breadcrumbs: ['/dreamer'],
                pageTitle: 'Модели Dreamer | Dreamer | Voyah',
            },
        },
        md2url: {
            'free/index.md': '/free',
            'free/models.md': '/free/models',
            'dreamer/index.md': '/dreamer',
            'dreamer/models.md': '/dreamer/models',
        },
        url2md: {
            '/free': 'free/index.md',
            '/free/models': 'free/models.md',
            '/dreamer': 'dreamer/index.md',
            '/dreamer/models': 'dreamer/models.md',
        },
    };

    const md = createMarkdownInstance({ sitemap });

    // Test from /free section - should link to /free/models
    const markdownFree = '[Модели](models.md)';
    const envFree = {page: {inputPath: './external/voyahchat-content/free/index.md'}};
    const htmlFree = md.render(markdownFree, envFree);

    t.true(htmlFree.includes('href=/free/models'), 'Should link to /free/models from free section');

    // Test from /dreamer section - should link to /dreamer/models
    const markdownDreamer = '[Модели](models.md)';
    const envDreamer = {page: {inputPath: './external/voyahchat-content/dreamer/index.md'}};
    const htmlDreamer = md.render(markdownDreamer, envDreamer);

    t.true(htmlDreamer.includes('href=/dreamer/models'), 'Should link to /dreamer/models from dreamer section');
});

// Complex Integration Tests
test('Markdown rendering - should handle complex document structure', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    const markdown = `# Основной заголовок

Это параграф с — тире.

## Подзаголовок {#custom}

- Элемент списка
- Еще элемент

[Ссылка](page.md)

![Изображение](images/test.png)`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Check all transformations
    t.true(html.includes('id=основной-заголовок'));
    t.true(html.includes('id=custom'));
    t.true(html.includes('\u00A0— тире'));
    t.true(html.includes('class=article__list'));
    t.true(html.includes('href=/section/page'));
    t.true(html.includes('src=/abc123def456.png'));
});

// Error Handling Tests
test('Markdown rendering - should throw error on unclosed link bracket', (t) => {
    const md = createMarkdownInstance();

    const markdown = `# Test

This is a [broken link without closing bracket

More content here.`;

    const env = {page: {inputPath: './external/voyahchat-content/test.md'}};

    const error = t.throws(() => {
        md.render(markdown, env);
    }, {
        instanceOf: Error,
        message: /Malformed markdown syntax/,
    });

    t.true(error.message.includes('Unclosed link bracket'));
    t.true(error.message.includes('test.md'));
});

test('Markdown rendering - should throw error on unclosed link URL', (t) => {
    const md = createMarkdownInstance();

    const markdown = `# Test

This is a [link](without closing paren

More content here.`;

    const env = {page: {inputPath: './external/voyahchat-content/test.md'}};

    const error = t.throws(() => {
        md.render(markdown, env);
    }, {
        instanceOf: Error,
        message: /Malformed markdown syntax/,
    });

    t.true(error.message.includes('Unclosed link URL'));
    t.true(error.message.includes('test.md'));
});

test('Markdown rendering - should throw error on empty markdown input', (t) => {
    const md = createMarkdownInstance();

    const markdown = '   \n\n  ';
    const env = {page: {inputPath: './external/voyahchat-content/empty.md'}};

    const error = t.throws(() => {
        md.render(markdown, env);
    }, {
        instanceOf: Error,
        message: /Empty markdown input/,
    });

    t.true(error.message.includes('empty.md'));
});


// ============================================================================
// INTEGRATION TESTS - Complete Pipeline End-to-End
// ============================================================================

// Integration Test 1: Complete Document Processing with All Features
test('Markdown rendering - should process complete document with headings, paragraphs, lists, links, images', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    const markdown = `# Main Heading

This is a paragraph with — em dash and some **bold** text.

## Subheading

Here's a list:
- Item 1 with [link](page.md)
- Item 2 with ![image](images/test.png)
- Item 3

### Nested Heading

Another paragraph with [external link](https://example.com).

1. Ordered item 1
2. Ordered item 2

> A blockquote with *italic* text`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Verify headings with hierarchical IDs
    t.true(html.includes('id=main-heading'));
    t.true(html.includes('id=main-heading-subheading'));
    t.true(html.includes('id=main-heading-subheading-nested-heading'));

    // Verify typography
    t.true(html.includes('\u00A0— em'));

    // Verify CSS classes
    t.true(html.includes('class=article__paragraph'));
    t.true(html.includes('class=article__list'));
    t.true(html.includes('class="article__list article__list_ordered"'));
    t.true(html.includes('class=article__blockquote'));

    // Verify link transformation
    t.true(html.includes('href=/section/page'));
    t.true(html.includes('href=https://example.com'));

    // Verify image transformation
    t.true(html.includes('src=/abc123def456.png'));
    t.true(html.includes('class=article__image'));

    // Verify inline formatting
    t.true(html.includes('<strong>bold</strong>'));
    t.true(html.includes('<em>italic</em>'));
});

// Integration Test 2: Mixed Inline and Block Elements
test('Markdown rendering - should process document with mixed inline and block elements', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    const markdown = `# Document

Paragraph with **bold**, *italic*, and \`code\` inline elements.

\`\`\`javascript
const x = 1;
\`\`\`

| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |

> Quote with **bold** and [link](page.md)`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Verify inline elements
    t.true(html.includes('<strong>bold</strong>'));
    t.true(html.includes('<em>italic</em>'));

    // Verify code block
    t.true(html.includes('class=article__code'));
    t.true(html.includes('const x = 1;'));

    // Verify table
    t.true(html.includes('class=article__table'));
    t.true(html.includes('class="article__table-cell article__table-cell_header"'));

    // Verify blockquote with nested elements
    t.true(html.includes('class=article__blockquote'));
    t.true(html.includes('href=/section/page'));
});

// Integration Test 3: Links and Images Together
test('Markdown rendering - should process document with both relative markdown links and images', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    const markdown = `# Resources

Check out [this page](page.md) for more info.

![Test Image](images/test.png)

Also see [another page](page.md#section) with anchor.

![Another Image](images/test.png)`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Verify link transformations
    t.true(html.includes('href=/section/page'));
    t.true(html.includes('href=/section/page#section'));

    // Verify image transformations
    t.true(html.includes('src=/abc123def456.png'));

    // Verify all have proper classes
    t.true(html.includes('class=article__link'));
    t.true(html.includes('class=article__image'));
});

// Integration Test 4: Mixed Internal and External Links/Images
test('Markdown rendering - should process document with mixed internal and external links and images', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    const markdown = `# Mixed Content

Internal: [page](page.md)
External: [site](https://example.com)
Mailto: [email](mailto:test@example.com)
Absolute: [path](/absolute)

Local image: ![local](images/test.png)
External image: ![external](https://example.com/image.png)`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Verify internal link transformed
    t.true(html.includes('href=/section/page'));

    // Verify external links preserved
    t.true(html.includes('href=https://example.com'));
    t.true(html.includes('href=mailto:test@example.com'));
    t.true(html.includes('href=/absolute'));

    // Verify local image transformed
    t.true(html.includes('src=/abc123def456.png'));

    // Verify external image preserved
    t.true(html.includes('src=https://example.com/image.png'));
});

// Integration Test 5: Typography with Minification
test('Markdown rendering - should apply typography correctly throughout document', (t) => {
    const md = createMarkdownInstance();

    const markdown = `# Typography Test

Text with — em dash in paragraph.

## Section with — dash

- List item — with dash
- Another item

> Quote — with dash

Text—between words should get spaces.`;

    const env = {page: {inputPath: './external/voyahchat-content/test.md'}};
    const html = md.render(markdown, env);

    // Count occurrences of properly formatted em dashes
    const nbspDashCount = (html.match(/\u00A0— /g) || []).length;

    // Should have at least 4 properly formatted em dashes
    t.true(nbspDashCount >= 4, `Found ${nbspDashCount} properly formatted em dashes`);

    // Verify no regular space before em dash remains
    t.false(html.includes(' — '), 'Should not have regular space before em dash');
});

// Integration Test 6: Complex Nested Structures - Lists with Links and Images
test('Markdown rendering - should process nested lists with links and images', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    const markdown = `# Nested Content

- Level 1 item with [link](page.md)
  - Level 2 item with ![image](images/test.png)
  - Another level 2 with [external](https://example.com)
- Back to level 1

1. Ordered with [link](page.md)
   1. Nested ordered with ![image](images/test.png)
   2. Another nested`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Verify list structure preserved
    t.true(html.includes('class=article__list'));
    t.true(html.includes('class="article__list article__list_ordered"'));

    // Verify nested links transformed
    t.true(html.includes('href=/section/page'));
    t.true(html.includes('href=https://example.com'));

    // Verify nested images transformed
    t.true(html.includes('src=/abc123def456.png'));
});

// Integration Test 7: Blockquotes with Code and Links
test('Markdown rendering - should process blockquotes with code blocks and links', (t) => {
    const { sitemap } = createMockData();
    const md = createMarkdownInstance({ sitemap });

    const markdown = `# Complex Blockquote

> This is a quote with [a link](page.md)
>
> \`\`\`javascript
> const code = 'in quote';
> \`\`\`
>
> More quote text with **bold**`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Verify blockquote class
    t.true(html.includes('class=article__blockquote'));

    // Verify link inside blockquote transformed
    t.true(html.includes('href=/section/page'));

    // Verify code block inside blockquote
    t.true(html.includes('class=article__code'));
    t.true(html.includes('const code = \'in quote\';'));

    // Verify bold inside blockquote
    t.true(html.includes('<strong>bold</strong>'));
});

// Integration Test 8: Document with All Features Combined
test('Markdown rendering - should process document with all features combined', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    const markdown = `# Complete Document

This paragraph has **bold**, *italic*, \`code\`, [link](page.md), and ![image](images/test.png).

## Section with — Typography

- List with [nested link](page.md)
- Item with ![nested image](images/test.png)

### Subsection

| Column 1 | Column 2 |
| -------- | -------- |
| [Link](https://example.com) | ![Image](images/test.png) |

> Blockquote with **formatting** and [link](page.md)

\`\`\`javascript
const x = 1;
\`\`\`

Final paragraph with — em dash.`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Verify hierarchical heading IDs
    t.true(html.includes('id=complete-document'));
    t.true(html.includes('id=complete-document-section-with-typography'));
    t.true(html.includes('id=complete-document-section-with-typography-subsection'));

    // Verify all element types present
    t.true(html.includes('class=article__paragraph'));
    t.true(html.includes('class=article__list'));
    t.true(html.includes('class=article__table'));
    t.true(html.includes('class=article__blockquote'));
    t.true(html.includes('class=article__code'));

    // Verify inline formatting
    t.true(html.includes('<strong>bold</strong>'));
    t.true(html.includes('<em>italic</em>'));

    // Verify link transformations
    t.true(html.includes('href=/section/page'));
    t.true(html.includes('href=https://example.com'));

    // Verify image transformations
    t.true(html.includes('src=/abc123def456.png'));

    // Verify typography
    t.true(html.includes('\u00A0— '));
});

// Integration Test 9: Large Document Processing
test('Markdown rendering - should process very large document', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    // Generate a large document with 500 sections, each with multiple elements
    const sections = [];
    for (let i = 1; i <= 500; i++) {
        sections.push(`## Section ${i}

Paragraph ${i} with [link](page.md) and ![image](images/test.png).

- List item 1
- List item 2

> Quote ${i}`);
    }
    const markdown = `# Large Document\n\n${sections.join('\n\n')}`;

    const env = {page: {inputPath: './external/voyahchat-content/section/large.md'}};

    const html = md.render(markdown, env);

    // Verify first and last sections processed correctly
    t.true(html.includes('id=large-document-section-1'));
    t.true(html.includes('id=large-document-section-500'));

    // Verify transformations applied throughout
    const linkCount = (html.match(/href=\/section\/page/g) || []).length;
    const imageCount = (html.match(/src=\/abc123def456\.png/g) || []).length;

    t.true(linkCount >= 500, `Should have at least 500 transformed links, found ${linkCount}`);
    t.true(imageCount >= 500, `Should have at least 500 transformed images, found ${imageCount}`);
});

// Integration Test 10: Edge Case - Empty Elements and Special Characters
test('Markdown rendering - should handle edge cases with empty elements and special characters', (t) => {
    const { sitemap, imageMapping } = createMockData();
    const md = createMarkdownInstance({ sitemap, imageMapping });

    const markdown = `# Special Characters and Edge Cases

Paragraph with text content.

## Section with Numbers

- List item one
- List item two

Text with multiple — em — dashes — in — sequence.

[Link with special chars](page.md)

![Image with special chars](images/test.png)`;

    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Verify heading with special characters
    t.true(html.includes('id=special-characters-and-edge-cases'));
    t.true(html.includes('id=special-characters-and-edge-cases-section-with-numbers'));

    // Verify multiple em dashes
    const nbspDashCount = (html.match(/\u00A0— /g) || []).length;
    t.true(nbspDashCount >= 4, `Should have multiple em dashes formatted, found ${nbspDashCount}`);

    // Verify links and images still work
    t.true(html.includes('href=/section/page'));
    t.true(html.includes('src=/abc123def456.png'));

    // Verify list structure
    t.true(html.includes('class=article__list'));
    t.true(html.includes('class=article__list-item'));
});

// Typography Tests - Link and Dash Patterns
test('Markdown rendering - should apply typography patterns across HTML elements', (t) => {
    const md = createMarkdownInstance();

    const markdown = '[VoyahTweaks](https://voyahtweaks.ru) — это программа для Android.';
    const html = md.render(markdown);

    // Should preserve nbsp+dash pattern across link boundaries
    t.true(html.includes('</a>\u00A0— '), 'Link should be followed by nbsp+dash+space pattern');
    t.false(html.includes('</a> — '), 'Should not have regular space before dash');

    // Test reverse pattern (currently not implemented, but should not break)
    const markdown2 = 'Программа — [VoyahTweaks](https://voyahtweaks.ru) устанавливается в машину.';
    const html2 = md.render(markdown2);

    // For now, just ensure it doesn't have incorrect spacing
    t.false(html2.includes(' — <a'), 'Should not have regular space around dash before link');
});

// Minification Tests - Space Preservation
test('Markdown rendering - should preserve spaces between text and inline elements', (t) => {
    const md = createMarkdownInstance();

    const markdown = 'Text before [link](/test) and after link.';
    const html = md.render(markdown);

    // Should preserve single spaces between text and links
    t.true(html.includes('Text before <a'), 'Space before link should be preserved');
    t.true(html.includes('</a> and'), 'Space after link should be preserved');
    t.false(html.includes('Text before<a'), 'Space should not be completely removed');
    t.false(html.includes('</a>and'), 'Space should not be completely removed');
});

test('Markdown rendering - should preserve spaces in list items with multiple links', (t) => {
    const md = createMarkdownInstance();

    const markdown = '- Apollo[на Voyah](/test1) (рест) и[машинах](/test2)';
    const html = md.render(markdown);

    // Should preserve spaces between text and links in list items
    t.true(html.includes('Apollo <a'), 'Space before first link should be preserved');
    t.true(html.includes('</a> ('), 'Space after first link should be preserved');
    t.true(html.includes('и <a'), 'Space before second link should be preserved');
    t.false(html.includes('Apollo<a'), 'Should not have text concatenated with link');
    t.false(html.includes('</a>('), 'Should not have link concatenated with parenthesis');
});

// Test for space preservation between code and link elements
test('Markdown rendering - should preserve space between code and link', (t) => {
    const { sitemap } = createMockData();
    const md = createMarkdownInstance({ sitemap });

    const markdown = '- `10000` [Установка приложений и VoyahTweaks/CunBA на Voyah Free ' +
        '2021-2025/Dreamer 2022-2024/Passion](page.md)';
    const env = {page: {inputPath: './external/voyahchat-content/section/index.md'}};
    const html = md.render(markdown, env);

    // Should preserve space between code and link
    t.true(html.includes('<code>10000</code> <a'), 'Should have space between code and link');
});

// Test for space preservation around inline elements (strong, em, code, etc.)
test('Markdown rendering - should preserve spaces around inline elements', (t) => {
    const md = createMarkdownInstance();

    // Test case from firmware.md - bold text between words
    const markdown = 'Удалённое обновление прошивки **китайских** Voyah Free/Dreamer.';
    const html = md.render(markdown);

    // Should have space after closing strong tag
    t.true(html.includes('</strong> Voyah'), 'Should have space after </strong>');
    t.false(html.includes('</strong>Voyah'), 'Should not have text concatenated with </strong>');

    // Should have space before opening strong tag
    t.true(html.includes('прошивки <strong>'), 'Should have space before <strong>');
    t.false(html.includes('прошивки<strong>'), 'Should not have text concatenated with <strong>');
});

test('Markdown rendering - should preserve spaces around italic elements', (t) => {
    const md = createMarkdownInstance();

    const markdown = 'Text with *italic* element inside.';
    const html = md.render(markdown);

    // Should have space after closing em tag
    t.true(html.includes('</em> element'), 'Should have space after </em>');
    t.false(html.includes('</em>element'), 'Should not have text concatenated with </em>');

    // Should have space before opening em tag
    t.true(html.includes('with <em>'), 'Should have space before <em>');
    t.false(html.includes('with<em>'), 'Should not have text concatenated with <em>');
});

test('Markdown rendering - should preserve spaces around code elements', (t) => {
    const md = createMarkdownInstance();

    const markdown = 'Price: `10000` Voyah Free.';
    const html = md.render(markdown);

    // Should have space after closing code tag
    t.true(html.includes('</code> Voyah'), 'Should have space after </code>');
    t.false(html.includes('</code>Voyah'), 'Should not have text concatenated with </code>');
});
