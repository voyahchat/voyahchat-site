/**
 * AVA tests for SearchBuilder
 * Tests search index generation, HTML stripping, breadcrumbs, and PHP config generation
 */

const test = require('ava');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Import SearchBuilder and utilities
const { SearchBuilder, stripHtml } = require('../build/build-search');
const { TestDir } = require('./test-dir');
const { createTestFile, createMockSitemap } = require('./utils');

/**
 * Group 1: stripHtml() - Unit Tests
 * Test HTML stripping function separately from the build
 */

test('stripHtml() - should strip simple HTML tags', (t) => {
    const html = '<p>Hello world</p>';
    const result = stripHtml(html);

    t.is(result, 'Hello world');
});

test('stripHtml() - should strip nested HTML tags', (t) => {
    const html = '<div><p>Hello <strong>world</strong></p></div>';
    const result = stripHtml(html);

    t.is(result, 'Hello world');
});

test('stripHtml() - should decode &amp; entity', (t) => {
    const html = '<p>Tom &amp; Jerry</p>';
    const result = stripHtml(html);

    t.is(result, 'Tom & Jerry');
});

test('stripHtml() - should decode &lt; entity', (t) => {
    const html = '<p>5 &lt; 10</p>';
    const result = stripHtml(html);

    t.is(result, '5 < 10');
});

test('stripHtml() - should decode &gt; entity', (t) => {
    const html = '<p>10 &gt; 5</p>';
    const result = stripHtml(html);

    t.is(result, '10 > 5');
});

test('stripHtml() - should decode &quot; entity', (t) => {
    const html = '<p>Say &quot;hello&quot;</p>';
    const result = stripHtml(html);

    t.is(result, 'Say "hello"');
});

test('stripHtml() - should decode &#39; entity', (t) => {
    const html = '<p>It&#39;s working</p>';
    const result = stripHtml(html);

    t.is(result, 'It\'s working');
});

test('stripHtml() - should decode &nbsp; entity', (t) => {
    const html = '<p>Hello&nbsp;world</p>';
    const result = stripHtml(html);

    t.is(result, 'Hello world');
});

test('stripHtml() - should decode numeric entities', (t) => {
    const html = '<p>&#65;&#66;&#67;</p>';
    const result = stripHtml(html);

    t.is(result, 'ABC');
});

test('stripHtml() - should decode multiple numeric entities', (t) => {
    const html = '<p>&#1055;&#1088;&#1080;&#1074;&#1077;&#1090;</p>';
    const result = stripHtml(html);

    t.is(result, 'Привет');
});

test('stripHtml() - should handle empty input', (t) => {
    const result = stripHtml('');

    t.is(result, '');
});

test('stripHtml() - should handle null input', (t) => {
    const result = stripHtml(null);

    t.is(result, '');
});

test('stripHtml() - should handle undefined input', (t) => {
    const result = stripHtml(undefined);

    t.is(result, '');
});

test('stripHtml() - should remove script blocks', (t) => {
    const html = '<p>Before</p><script>alert("test");</script><p>After</p>';
    const result = stripHtml(html);

    t.is(result, 'Before After');
});

test('stripHtml() - should remove style blocks', (t) => {
    const html = '<p>Before</p><style>.test { color: red; }</style><p>After</p>';
    const result = stripHtml(html);

    t.is(result, 'Before After');
});

test('stripHtml() - should remove script blocks with attributes', (t) => {
    const html = '<p>Text</p><script type="text/javascript">var x = 1;</script><p>More</p>';
    const result = stripHtml(html);

    t.is(result, 'Text More');
});

test('stripHtml() - should remove style blocks with attributes', (t) => {
    const html = '<p>Text</p><style type="text/css">.class { }</style><p>More</p>';
    const result = stripHtml(html);

    t.is(result, 'Text More');
});

test('stripHtml() - should handle Cyrillic content', (t) => {
    const html = '<p>Привет мир</p>';
    const result = stripHtml(html);

    t.is(result, 'Привет мир');
});

test('stripHtml() - should handle Cyrillic with entities', (t) => {
    const html = '<p>Привет&nbsp;&amp;&nbsp;мир</p>';
    const result = stripHtml(html);

    t.is(result, 'Привет & мир');
});

test('stripHtml() - should collapse multiple spaces', (t) => {
    const html = '<p>Hello    world</p>';
    const result = stripHtml(html);

    t.is(result, 'Hello world');
});

test('stripHtml() - should collapse newlines to spaces', (t) => {
    const html = '<p>Hello\n\nworld</p>';
    const result = stripHtml(html);

    t.is(result, 'Hello world');
});

test('stripHtml() - should trim leading and trailing whitespace', (t) => {
    const html = '  <p>Hello world</p>  ';
    const result = stripHtml(html);

    t.is(result, 'Hello world');
});

test('stripHtml() - should handle real article HTML', (t) => {
    const html = '<h1>Title</h1><p>First paragraph with <strong>bold</strong> text.</p><p>Second paragraph.</p>';
    const result = stripHtml(html);

    t.is(result, 'Title First paragraph with bold text. Second paragraph.');
});

test('stripHtml() - should handle complex nested structure', (t) => {
    const html = '<div class="article"><header><h1>Title</h1></header><section><p>Content</p></section></div>';
    const result = stripHtml(html);

    t.is(result, 'Title Content');
});

test('stripHtml() - should handle all entity types together', (t) => {
    const html = '<p>&amp; &lt; &gt; &quot; &#39; &nbsp; &#65;</p>';
    const result = stripHtml(html);

    t.is(result, '& < > " \' A');
});

/**
 * Group 2: buildBreadcrumbsString() - Unit Tests
 * Test breadcrumb string formation
 */

test('buildBreadcrumbsString() - should return empty string for missing breadcrumbs', (t) => {
    const pageData = { name: 'Page' };
    const pages = {};
    const result = SearchBuilder.buildBreadcrumbsString(pageData, pages);

    t.is(result, '');
});

test('buildBreadcrumbsString() - should return empty string for empty breadcrumbs array', (t) => {
    const pageData = { name: 'Page', breadcrumbs: [] };
    const pages = {};
    const result = SearchBuilder.buildBreadcrumbsString(pageData, pages);

    t.is(result, '');
});

test('buildBreadcrumbsString() - should build single level breadcrumb', (t) => {
    const pageData = { name: 'Child', breadcrumbs: ['/'] };
    const pages = {
        '/': { name: 'Home' },
    };
    const result = SearchBuilder.buildBreadcrumbsString(pageData, pages);

    t.is(result, 'Home → Child');
});

test('buildBreadcrumbsString() - should build multiple level breadcrumbs', (t) => {
    const pageData = { name: 'Page', breadcrumbs: ['/', '/section'] };
    const pages = {
        '/': { name: 'Home' },
        '/section': { name: 'Section' },
    };
    const result = SearchBuilder.buildBreadcrumbsString(pageData, pages);

    t.is(result, 'Home → Section → Page');
});

test('buildBreadcrumbsString() - should skip non-existent pages', (t) => {
    const pageData = { name: 'Page', breadcrumbs: ['/', '/missing', '/section'] };
    const pages = {
        '/': { name: 'Home' },
        '/section': { name: 'Section' },
    };
    const result = SearchBuilder.buildBreadcrumbsString(pageData, pages);

    t.is(result, 'Home → Section → Page');
});

test('buildBreadcrumbsString() - should handle Cyrillic breadcrumbs', (t) => {
    const pageData = { name: 'Страница', breadcrumbs: ['/'] };
    const pages = {
        '/': { name: 'Главная' },
    };
    const result = SearchBuilder.buildBreadcrumbsString(pageData, pages);

    t.is(result, 'Главная → Страница');
});

test('buildBreadcrumbsString() - should handle deep nesting', (t) => {
    const pageData = { name: 'Deep', breadcrumbs: ['/', '/a', '/a/b', '/a/b/c'] };
    const pages = {
        '/': { name: 'Root' },
        '/a': { name: 'A' },
        '/a/b': { name: 'B' },
        '/a/b/c': { name: 'C' },
    };
    const result = SearchBuilder.buildBreadcrumbsString(pageData, pages);

    t.is(result, 'Root → A → B → C → Deep');
});

/**
 * Group 3: generateConfigPhp() - Unit Tests
 * Test PHP file generation
 */

test('generateConfigPhp() - should generate valid PHP file', (t) => {
    const config = {
        cssUrl: '/css/page-abc123.css',
        faviconUrl: '/logo-def456.svg',
        logoSvg: '<svg>test</svg>',
    };
    const result = SearchBuilder.generateConfigPhp(config);

    t.true(result.startsWith('<?php'));
    t.true(result.includes('SEARCH_CSS_URL'));
    t.true(result.includes('SEARCH_FAVICON_URL'));
    t.true(result.includes('SEARCH_LOGO_SVG'));
});

test('generateConfigPhp() - should include CSS URL constant', (t) => {
    const config = {
        cssUrl: '/css/page-abc123.css',
        faviconUrl: '/logo.svg',
        logoSvg: '<svg></svg>',
    };
    const result = SearchBuilder.generateConfigPhp(config);

    t.true(result.includes('define(\'SEARCH_CSS_URL\', \'/css/page-abc123.css\')'));
});

test('generateConfigPhp() - should include favicon URL constant', (t) => {
    const config = {
        cssUrl: '/css/page.css',
        faviconUrl: '/logo-def456.svg',
        logoSvg: '<svg></svg>',
    };
    const result = SearchBuilder.generateConfigPhp(config);

    t.true(result.includes('define(\'SEARCH_FAVICON_URL\', \'/logo-def456.svg\')'));
});

test('generateConfigPhp() - should include logo SVG constant', (t) => {
    const config = {
        cssUrl: '/css/page.css',
        faviconUrl: '/logo.svg',
        logoSvg: '<svg><path d="M0 0"/></svg>',
    };
    const result = SearchBuilder.generateConfigPhp(config);

    t.true(result.includes('define(\'SEARCH_LOGO_SVG\''));
    t.true(result.includes('<svg><path d="M0 0"/></svg>'));
});

test('generateConfigPhp() - should escape single quotes in SVG', (t) => {
    const config = {
        cssUrl: '/css/page.css',
        faviconUrl: '/logo.svg',
        logoSvg: '<svg data-test=\'value\'>test</svg>',
    };
    const result = SearchBuilder.generateConfigPhp(config);

    t.true(result.includes('\\\''));
    t.false(result.includes('data-test=\'value\''));
});

test('generateConfigPhp() - should handle complex SVG with quotes', (t) => {
    const config = {
        cssUrl: '/css/page.css',
        faviconUrl: '/logo.svg',
        logoSvg: '<svg viewBox=\'0 0 100 100\'><path d=\'M10,10\'/></svg>',
    };
    const result = SearchBuilder.generateConfigPhp(config);

    t.true(result.includes('SEARCH_LOGO_SVG'));
    t.true(result.includes('\\\''));
});

/**
 * Group 4: build() - Integration Tests
 * Test the complete build cycle with TestDir
 */

test('SearchBuilder.build() - should create search.db file', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({
        'logo/logo.svg': 'logo-abc123.svg',
    }));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1><p>Welcome</p>',
            },
        ],
    });

    // Write sitemap to build directory so getSitemap() can find it
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const dbPath = path.join(siteDir, 'search.db');
    const exists = fsSync.existsSync(dbPath);

    t.true(exists, 'search.db should be created');
});

test('SearchBuilder.build() - should create FTS5 index', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({}));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const dbPath = path.join(siteDir, 'search.db');
    const db = new Database(dbPath);

    try {
        // Check if FTS5 table exists
        const result = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'pages\'').get();
        t.truthy(result, 'FTS5 table should exist');
    } finally {
        db.close();
    }
});

test('SearchBuilder.build() - should index correct number of pages', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({}));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
            },
            {
                url: '/about',
                title: 'About',
                name: 'About',
                file: 'about.md',
                html: '<h1>About</h1>',
            },
            {
                url: '/contact',
                title: 'Contact',
                name: 'Contact',
                file: 'contact.md',
                html: '<h1>Contact</h1>',
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    const result = await builder.build();

    t.is(result.pages, 3, 'Should index 3 pages');

    const dbPath = path.join(siteDir, 'search.db');
    const db = new Database(dbPath);

    try {
        const count = db.prepare('SELECT COUNT(*) as count FROM pages').get();
        t.is(count.count, 3, 'Database should contain 3 pages');
    } finally {
        db.close();
    }
});

test('SearchBuilder.build() - should support FTS5 search', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({}));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1><p>Welcome to our website</p>',
            },
            {
                url: '/about',
                title: 'About',
                name: 'About',
                file: 'about.md',
                html: '<h1>About</h1><p>Learn about our company</p>',
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const dbPath = path.join(siteDir, 'search.db');
    const db = new Database(dbPath);

    try {
        // Search for "welcome"
        const results = db.prepare('SELECT url, name FROM pages WHERE pages MATCH ?').all('welcome');
        t.is(results.length, 1, 'Should find 1 result for "welcome"');
        t.is(results[0].url, '/', 'Should find home page');
    } finally {
        db.close();
    }
});

test('SearchBuilder.build() - should preserve breadcrumbs in index', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({}));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
            },
            {
                url: '/section',
                title: 'Section',
                name: 'Section',
                file: 'section.md',
                html: '<h1>Section</h1>',
                breadcrumbs: ['/'],
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const dbPath = path.join(siteDir, 'search.db');
    const db = new Database(dbPath);

    try {
        const result = db.prepare('SELECT breadcrumbs FROM pages WHERE url = ?').get('/section');
        t.truthy(result, 'Should find section page');
        t.is(result.breadcrumbs, 'Home → Section', 'Should preserve breadcrumbs');
    } finally {
        db.close();
    }
});

test('SearchBuilder.build() - should create search-config.php', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page-abc123.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({
        'logo/logo.svg': 'logo-def456.svg',
    }));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const phpPath = path.join(siteDir, 'search-config.php');
    const exists = fsSync.existsSync(phpPath);

    t.true(exists, 'search-config.php should be created');
});

test('SearchBuilder.build() - should generate PHP config with correct data', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>logo</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page-abc123.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({
        'logo/logo.svg': 'logo-def456.svg',
    }));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const phpPath = path.join(siteDir, 'search-config.php');
    const phpContent = await fs.readFile(phpPath, 'utf8');

    t.true(phpContent.includes('SEARCH_CSS_URL'), 'Should define SEARCH_CSS_URL');
    t.true(phpContent.includes('SEARCH_FAVICON_URL'), 'Should define SEARCH_FAVICON_URL');
    t.true(phpContent.includes('SEARCH_LOGO_SVG'), 'Should define SEARCH_LOGO_SVG');
    t.true(phpContent.includes('/page-abc123.css'), 'Should include CSS URL');
    t.true(phpContent.includes('logo-def456.svg'), 'Should include favicon URL');
});

test('SearchBuilder.build() - should index pages without HTML', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({}));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1>',
            },
            {
                url: '/empty',
                title: 'Empty',
                name: 'Empty',
                file: 'empty.md',
                html: '',
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const dbPath = path.join(siteDir, 'search.db');
    const db = new Database(dbPath);

    try {
        // Both pages should be indexed (even with empty content)
        const count = db.prepare('SELECT COUNT(*) as count FROM pages').get();
        t.is(count.count, 2, 'Should index all pages including empty ones');

        // Check that empty page has empty content
        const emptyPage = db.prepare('SELECT content FROM pages WHERE url = ?').get('/empty');
        t.is(emptyPage.content, '', 'Empty page should have empty content');
    } finally {
        db.close();
    }
});

test('SearchBuilder.build() - should support Cyrillic search', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({}));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Главная',
                name: 'Главная',
                file: 'index.md',
                html: '<h1>Главная</h1><p>Добро пожаловать на наш сайт</p>',
            },
            {
                url: '/about',
                title: 'О нас',
                name: 'О нас',
                file: 'about.md',
                html: '<h1>О нас</h1><p>Узнайте о нашей компании</p>',
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const dbPath = path.join(siteDir, 'search.db');
    const db = new Database(dbPath);

    try {
        // Search for Cyrillic text
        const results = db.prepare('SELECT url, name FROM pages WHERE pages MATCH ?').all('пожаловать');
        t.is(results.length, 1, 'Should find 1 result for Cyrillic search');
        t.is(results[0].url, '/', 'Should find home page');
    } finally {
        db.close();
    }
});

test('SearchBuilder.build() - should support FTS5 snippet() function', async (t) => {
    const dir = new TestDir();
    const siteDir = dir.getSite();

    // Create required files
    await createTestFile(dir, 'blocks/logo/logo.svg', '<svg>test</svg>');
    await createTestFile(dir, '.build/hash-css.json', JSON.stringify({
        page: { url: '/page.css' },
    }));
    await createTestFile(dir, '.build/image-mapping.json', JSON.stringify({}));

    const sitemap = createMockSitemap({
        pages: [
            {
                url: '/',
                title: 'Home',
                name: 'Home',
                file: 'index.md',
                html: '<h1>Home</h1><p>This is a test of the snippet function with some content</p>',
            },
        ],
    });

    // Write sitemap to build directory
    await createTestFile(dir, '.build/sitemap.json', JSON.stringify(sitemap));

    const builder = new SearchBuilder({ skipWrite: true }, dir);
    await builder.build();

    const dbPath = path.join(siteDir, 'search.db');
    const db = new Database(dbPath);

    try {
        // Use snippet() function to get highlighted results
        const query = 'SELECT snippet(pages, -1, \'<b>\', \'</b>\', \'...\', 10) as snippet ' +
            'FROM pages WHERE pages MATCH ?';
        const result = db.prepare(query).get('snippet');
        t.truthy(result, 'Should return snippet result');
        t.true(result.snippet.includes('<b>'), 'Snippet should include highlight markers');
    } finally {
        db.close();
    }
});
