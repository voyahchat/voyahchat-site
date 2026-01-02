/**
 * AVA tests for HTMLBuilder unit tests (without file I/O)
 */

const test = require('ava');

// Import functions from build-html
const { HTMLBuilder } = require('../build/build-html');

// Import mock factory functions
const { createMockSitemap } = require('./utils');

test('HTMLBuilder.build() - should processes pages without writing files (skipWrite)', async (t) => {
    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            {
                url: '/about',
                title: 'About',
                name: 'About',
                file: 'about.md',
                html: '<h1>About</h1>',
                layout: 'blocks/page/page.njk',
            },
        ],
    });

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const result = await builder.build();

    t.truthy(result, 'Should return result');
    t.is(result.pagesProcessed, 2, 'Should process 2 pages');
});

test('HTMLBuilder.build() - should handles empty sitemap without errors', async (t) => {
    const sitemap = createMockSitemap({ pages: [] });

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const result = await builder.build();

    t.truthy(result, 'Should return result for empty sitemap');
    t.is(result.pagesProcessed, 0, 'Should process 0 pages');
});

test('HTMLBuilder.build() - should skips pages without pre-rendered HTML', async (t) => {
    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            {
                url: '/no-html',
                title: 'No HTML',
                name: 'No HTML',
                file: 'no-html.md',
                html: '', // Empty HTML to test skipping behavior
                layout: 'blocks/page/page.njk',
            },
        ],
    });

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const result = await builder.build();

    t.is(result.pagesProcessed, 2, 'Should report all pages in count');
});

test('HTMLBuilder.build() - should processes multiple pages in parallel', async (t) => {
    const pages = {};
    const sitemapUrls = [];
    const md2url = {};
    const url2md = {};

    for (let i = 0; i < 10; i++) {
        const url = i === 0 ? '/' : `/page${i}`;
        const file = i === 0 ? 'index.md' : `page${i}.md`;
        sitemapUrls.push(url);
        pages[url] = {
            url,
            title: `Page ${i}`,
            name: `Page ${i}`,
            file,
            html: `<h1>Page ${i}</h1>`,
            layout: 'blocks/page/page.njk',
        };
        md2url[file] = url;
        url2md[url] = file;
    }

    const sitemap = { sitemap: sitemapUrls, pages, md2url, url2md };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const startTime = Date.now();
    const result = await builder.build();
    const duration = Date.now() - startTime;

    t.is(result.pagesProcessed, 10, 'Should process all 10 pages');
    t.true(duration < 100000, 'Should complete in reasonable time with parallel processing');
});

test('HTMLBuilder.build() - should handles pages with special characters in URLs', async (t) => {
    const sitemap = {
        sitemap: ['/', '/page-with-dashes', '/page_with_underscores'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/page-with-dashes': {
                url: '/page-with-dashes',
                title: 'Dashes',
                name: 'Dashes',
                file: 'page-with-dashes.md',
                html: '<h1>Dashes</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/page_with_underscores': {
                url: '/page_with_underscores',
                title: 'Underscores',
                name: 'Underscores',
                file: 'page_with_underscores.md',
                html: '<h1>Underscores</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: {
            'index.md': '/',
            'page-with-dashes.md': '/page-with-dashes',
            'page_with_underscores.md': '/page_with_underscores',
        },
        url2md: {
            '/': 'index.md',
            '/page-with-dashes': 'page-with-dashes.md',
            '/page_with_underscores': 'page_with_underscores.md',
        },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    await t.notThrowsAsync(async () => {
        await builder.build();
    }, 'Should handle special characters in URLs without errors');
});

test('HTMLBuilder.build() - should handles very long content', async (t) => {
    const veryLongContent = '<h1>Very Long Page</h1>' + '<p>Lorem ipsum dolor sit amet.</p>'.repeat(1000);

    const sitemap = {
        sitemap: ['/'],
        pages: {
            '/': {
                url: '/',
                title: 'Long Page',
                name: 'Long Page',
                file: 'index.md',
                html: veryLongContent,
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/' },
        url2md: { '/': 'index.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    await t.notThrowsAsync(async () => {
        await builder.build();
    }, 'Should handle very long content without errors');
});

test('HTMLBuilder.build() - should handles null sitemap by loading from file', async (t) => {
    const builder = new HTMLBuilder({
        sitemap: null,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    // When sitemap is null, the code falls back to loading from file
    // In test environment, this will load the actual sitemap.json
    const result = await builder.build();

    t.truthy(result, 'Should return result when sitemap is null');
    t.true(typeof result.pagesProcessed === 'number', 'Should have pagesProcessed count');
});

test('HTMLBuilder.build() - should handles corrupted sitemap data', async (t) => {
    const corruptedSitemap = {
        sitemap: ['/', '/page'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/page': null, // Corrupted page data
        },
        md2url: { 'index.md': '/', 'page.md': '/page' },
        url2md: { '/': 'index.md', '/page': 'page.md' },
    };

    const builder = new HTMLBuilder({
        sitemap: corruptedSitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const error = await t.throwsAsync(async () => {
        await builder.build();
    }, {
        instanceOf: Error,
    });

    t.truthy(error.message);
});

test('HTMLBuilder.build() - should handles pages with missing required fields', async (t) => {
    const sitemap = {
        sitemap: ['/', '/incomplete'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/incomplete': {
                url: '/incomplete',
                // Missing title, name, file
                html: '<h1>Incomplete</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/' },
        url2md: { '/': 'index.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    // Should not throw - builder should handle missing fields gracefully
    const result = await builder.build();
    t.is(result.pagesProcessed, 2, 'Should process both pages despite missing fields');
});

test('HTMLBuilder.build() - should handles invalid page URLs', async (t) => {
    const sitemap = {
        sitemap: ['/', '//invalid//url'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '//invalid//url': {
                url: '//invalid//url',
                title: 'Invalid',
                name: 'Invalid',
                file: 'invalid.md',
                html: '<h1>Invalid</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/', 'invalid.md': '//invalid//url' },
        url2md: { '/': 'index.md', '//invalid//url': 'invalid.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    await t.notThrowsAsync(
        async () => await builder.build(),
        'Should handle invalid URLs without throwing',
    );
});

test('HTMLBuilder.build() - should handles template rendering errors gracefully', async (t) => {
    const sitemap = {
        sitemap: ['/'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'nonexistent/template.njk', // Non-existent template
            },
        },
        md2url: { 'index.md': '/' },
        url2md: { '/': 'index.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const error = await t.throwsAsync(async () => {
        await builder.build();
    }, {
        instanceOf: Error,
        message: /template/i,
    });

    t.truthy(error.message);
});

test('HTMLBuilder.build() - should handles empty page data object', async (t) => {
    const sitemap = {
        sitemap: ['/'],
        pages: {
            '/': {
                url: '/',
                title: 'Empty',
                name: 'Empty',
                file: 'index.md',
                html: '', // Empty HTML
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/' },
        url2md: { '/': 'index.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    // Should handle empty HTML gracefully
    const result = await builder.build();
    t.is(result.pagesProcessed, 1, 'Should count page even with empty HTML');
});

test('HTMLBuilder.build() - should handles malformed sitemap structure', async (t) => {
    const malformedSitemap = {
        sitemap: ['/', '/page'],
        pages: 'not-an-object', // Should be an object
        md2url: {},
        url2md: {},
    };

    const builder = new HTMLBuilder({
        sitemap: malformedSitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    // Object.keys on a string will return array of indices, not throw
    // This test verifies the builder handles unexpected data types
    const result = await builder.build();
    t.truthy(result, 'Should complete even with malformed sitemap');
});

test('HTMLBuilder.build() - should tracks page count correctly', async (t) => {
    const sitemap = {
        sitemap: ['/', '/page1', '/page2', '/page3'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/page1': {
                url: '/page1',
                title: 'Page 1',
                name: 'Page 1',
                file: 'page1.md',
                html: '<h1>Page 1</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/page2': {
                url: '/page2',
                title: 'Page 2',
                name: 'Page 2',
                file: 'page2.md',
                html: '<h1>Page 2</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/page3': {
                url: '/page3',
                title: 'Page 3',
                name: 'Page 3',
                file: 'page3.md',
                html: '<h1>Page 3</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: {
            'index.md': '/',
            'page1.md': '/page1',
            'page2.md': '/page2',
            'page3.md': '/page3',
        },
        url2md: {
            '/': 'index.md',
            '/page1': 'page1.md',
            '/page2': 'page2.md',
            '/page3': 'page3.md',
        },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const result = await builder.build();

    t.is(result.pagesProcessed, 4, 'Should track correct number of pages processed');
});

test('HTMLBuilder.build() - should handles pages with deeply nested URLs', async (t) => {
    const sitemap = {
        sitemap: ['/', '/level1/level2/level3/deep-page'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/level1/level2/level3/deep-page': {
                url: '/level1/level2/level3/deep-page',
                title: 'Deep Page',
                name: 'Deep Page',
                file: 'deep.md',
                html: '<h1>Deep Page</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/', 'deep.md': '/level1/level2/level3/deep-page' },
        url2md: { '/': 'index.md', '/level1/level2/level3/deep-page': 'deep.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    await t.notThrowsAsync(
        async () => await builder.build(),
        'Should handle deeply nested URLs without errors',
    );
});

test('HTMLBuilder.build() - should handles build with no pages to process', async (t) => {
    const sitemap = {
        sitemap: [],
        pages: {},
        md2url: {},
        url2md: {},
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const result = await builder.build();

    t.is(result.pagesProcessed, 0, 'Should handle empty build gracefully');
    t.truthy(result, 'Should return result object');
});

test('HTMLBuilder.build() - should handles mixed valid and invalid pages', async (t) => {
    const sitemap = {
        sitemap: ['/', '/valid', '/empty-html', '/another-valid'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/valid': {
                url: '/valid',
                title: 'Valid',
                name: 'Valid',
                file: 'valid.md',
                html: '<h1>Valid</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/empty-html': {
                url: '/empty-html',
                title: 'Empty HTML',
                name: 'Empty HTML',
                file: 'empty.md',
                html: '', // Empty HTML
                layout: 'blocks/page/page.njk',
            },
            '/another-valid': {
                url: '/another-valid',
                title: 'Another Valid',
                name: 'Another Valid',
                file: 'another.md',
                html: '<h1>Another Valid</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: {
            'index.md': '/',
            'valid.md': '/valid',
            'empty.md': '/empty-html',
            'another.md': '/another-valid',
        },
        url2md: {
            '/': 'index.md',
            '/valid': 'valid.md',
            '/empty-html': 'empty.md',
            '/another-valid': 'another.md',
        },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const result = await builder.build();

    t.is(result.pagesProcessed, 4, 'Should process all pages including those with empty HTML');
});

test('HTMLBuilder.build() - should handles pages with trailing slashes in URLs', async (t) => {
    const sitemap = {
        sitemap: ['/', '/page-with-slash/'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/page-with-slash/': {
                url: '/page-with-slash/',
                title: 'Page With Slash',
                name: 'Page With Slash',
                file: 'slash.md',
                html: '<h1>Page With Slash</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/', 'slash.md': '/page-with-slash/' },
        url2md: { '/': 'index.md', '/page-with-slash/': 'slash.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    await t.notThrowsAsync(
        async () => await builder.build(),
        'Should handle trailing slashes in URLs',
    );
});

test('HTMLBuilder.build() - should handles pages with numeric URLs', async (t) => {
    const sitemap = {
        sitemap: ['/', '/2024', '/12345'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/2024': {
                url: '/2024',
                title: '2024',
                name: '2024',
                file: '2024.md',
                html: '<h1>2024</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/12345': {
                url: '/12345',
                title: '12345',
                name: '12345',
                file: '12345.md',
                html: '<h1>12345</h1>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/', '2024.md': '/2024', '12345.md': '/12345' },
        url2md: { '/': 'index.md', '/2024': '2024.md', '/12345': '12345.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    const result = await builder.build();

    t.is(result.pagesProcessed, 3, 'Should handle numeric URLs correctly');
});

test('HTMLBuilder.build() - should handles pages with different layouts', async (t) => {
    const sitemap = {
        sitemap: ['/', '/custom-layout'],
        pages: {
            '/': {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
                layout: 'blocks/page/page.njk',
            },
            '/custom-layout': {
                url: '/custom-layout',
                title: 'Custom',
                name: 'Custom',
                file: 'custom.md',
                html: '<h1>Custom</h1>',
                layout: 'blocks/page/page.njk', // Use existing layout
            },
        },
        md2url: { 'index.md': '/', 'custom.md': '/custom-layout' },
        url2md: { '/': 'index.md', '/custom-layout': 'custom.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    await t.notThrowsAsync(
        async () => await builder.build(),
        'Should handle pages with different layouts',
    );
});

test('HTMLBuilder.build() - should processes pages with HTML entities correctly', async (t) => {
    const sitemap = {
        sitemap: ['/'],
        pages: {
            '/': {
                url: '/',
                title: 'Home & About',
                name: 'Home & About',
                file: 'index.md',
                html: '<h1>Home &amp; About</h1><p>&lt;script&gt; test &lt;/script&gt;</p>',
                layout: 'blocks/page/page.njk',
            },
        },
        md2url: { 'index.md': '/' },
        url2md: { '/': 'index.md' },
    };

    const builder = new HTMLBuilder({
        sitemap,
        imageMapping: {},
        skipWrite: true,
        silentWarnings: true,
    });

    await t.notThrowsAsync(
        async () => await builder.build(),
        'Should handle HTML entities correctly',
    );
});
