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

test('Markdown rendering - should process large markdown files efficiently', (t) => {
    const md = createMarkdownInstance();

    // Generate a large markdown document with 1000 headings and paragraphs
    const sections = [];
    for (let i = 1; i <= 1000; i++) {
        sections.push(`## Section ${i}\n\nThis is paragraph ${i} with some content.\n`);
    }
    const markdown = `# Large Document\n\n${sections.join('\n')}`;

    const env = {page: {inputPath: './external/voyahchat-content/large.md'}};

    const startTime = Date.now();
    const html = md.render(markdown, env);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete within 5 seconds for 1000 sections
    t.true(duration < 5000, `Processing took ${duration}ms, should be under 5000ms`);
    t.true(html.includes('id=large-document'));
    t.true(html.includes('id=large-document-section-1000'));
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

// Integration Test 9: Large Document Performance
test('Markdown rendering - should process very large document efficiently', (t) => {
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

    const startTime = Date.now();
    const html = md.render(markdown, env);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete within 3 seconds for 500 sections with complex content
    t.true(duration < 3000, `Processing took ${duration}ms, should be under 3000ms`);

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
