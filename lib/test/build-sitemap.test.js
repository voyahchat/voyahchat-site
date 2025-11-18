/**
 * AVA tests for build sitemap functionality
 */

const fs = require('fs');
const path = require('path');
const test = require('ava');
const { Dir } = require('../build/dir');
const { TestDir } = require('./test-dir');
const {
    parseSitemapLine,
    buildFullUrl,
    parseIndentedSitemap,
    processSitemap,
    getLastModFromGit,
    extractHeadingsFromMarkdown,
} = require('../build/build-sitemap');
const {
    fileExists,
    readJsonFile,
    skipIfFileNotFound,
    assertPositiveNumber,
    getSitemap,
} = require('./utils');

// parseSitemapLine tests
test('parseSitemapLine() - should parse simple format', (t) => {
    const result = parseSitemapLine('Home [/, index.md]');

    t.deepEqual(result, {title: 'Home', url: '/', file: 'index.md', meta: {}});
});

test('parseSitemapLine() - should parse relative URL', (t) => {
    const result = parseSitemapLine('About [about, about.md]');

    t.deepEqual(result, {title: 'About', url: 'about', file: 'about.md', meta: {}});
});

test('parseSitemapLine() - should parse nested path', (t) => {
    const result = parseSitemapLine('Contact [contact/info, contact/info.md]');

    t.deepEqual(result, {title: 'Contact', url: 'contact/info', file: 'contact/info.md', meta: {}});
});

test('parseSitemapLine() - should parse title with spaces', (t) => {
    const result = parseSitemapLine('Title with spaces [/path, file.md]');

    t.deepEqual(result, {title: 'Title with spaces', url: '/path', file: 'file.md', meta: {}});
});

test('parseSitemapLine() - should return null for invalid format', (t) => {
    const result = parseSitemapLine('Invalid format');

    t.is(result, null);
});

test('parseSitemapLine() - should parse Cyrillic characters', (t) => {
    const result = parseSitemapLine('Главная [/, index.md]');

    t.deepEqual(result, {title: 'Главная', url: '/', file: 'index.md', meta: {}});
});

test('parseSitemapLine() - should parse complex path with subdirectories', (t) => {
    const result = parseSitemapLine('Deep Page [/section/subsection/page, section/subsection/page.md]');

    t.deepEqual(result, {
        title: 'Deep Page',
        url: '/section/subsection/page',
        file: 'section/subsection/page.md',
        meta: {},
    });
});

test('parseSitemapLine() - should parse special characters in title', (t) => {
    const result = parseSitemapLine('Title & "Quotes" [/special, special.md]');

    t.deepEqual(result, {title: 'Title & "Quotes"', url: '/special', file: 'special.md', meta: {}});
});

test('parseSitemapLine() - should parse empty title', (t) => {
    const result = parseSitemapLine(' [/empty, empty.md]');

    t.deepEqual(result, {title: '', url: '/empty', file: 'empty.md', meta: {}});
});

test('parseSitemapLine() - should return null for malformed brackets', (t) => {
    const result = parseSitemapLine('Bad Format [/bad');

    t.is(result, null);
});

test('parseSitemapLine() - should parse missing file extension', (t) => {
    const result = parseSitemapLine('No Extension [/noext, noext]');

    t.deepEqual(result, {title: 'No Extension', url: '/noext', file: 'noext', meta: {}});
});

// buildFullUrl tests
test('buildFullUrl() - should build relative URL with parent', (t) => {
    const result = buildFullUrl('/docs', 'page');

    t.is(result, '/docs/page');
});

test('buildFullUrl() - should handle parent with trailing slash', (t) => {
    const result = buildFullUrl('/docs/', 'page');

    t.is(result, '/docs/page');
});

test('buildFullUrl() - should ignore parent for absolute URL', (t) => {
    const result = buildFullUrl('/docs', '/absolute');

    t.is(result, '/absolute');
});

test('buildFullUrl() - should handle empty parent', (t) => {
    const result = buildFullUrl('', 'relative');

    t.is(result, '/relative');
});

test('buildFullUrl() - should handle multiple slashes in parent', (t) => {
    const result = buildFullUrl('/docs//section/', 'page');

    t.is(result, '/docs//section/page');
});

test('buildFullUrl() - should handle root parent with relative current', (t) => {
    const result = buildFullUrl('/', 'page');

    t.is(result, '/page');
});

test('buildFullUrl() - should handle complex nested path', (t) => {
    const result = buildFullUrl('/docs/api/v1', 'endpoints');

    t.is(result, '/docs/api/v1/endpoints');
});

// parseIndentedSitemap tests
test('parseIndentedSitemap() - should parse single item', (t) => {
    const input = `sitemap:
  - Home [/, index.md]`;
    const result = parseIndentedSitemap(input);

    t.deepEqual(result, ['Home [/, index.md]']);
});

test('parseIndentedSitemap() - should parse two items', (t) => {
    const input = `sitemap:
  - Home [/, index.md]
  - About [/about, about.md]`;
    const expected = [
        'Home [/, index.md]',
        'About [/about, about.md]',
    ];
    const result = parseIndentedSitemap(input);

    t.deepEqual(result, expected);
});

test('parseIndentedSitemap() - should parse nested structure', (t) => {
    const input = `sitemap:
  - Home [/, index.md]
  - Section [/section, section/index.md]
    - Page [page, section/page.md]`;

    const result = parseIndentedSitemap(input);

    // Should have Home as string and Section as object with children
    t.is(result.length, 2);
    t.is(result[0], 'Home [/, index.md]');
    t.true(typeof result[1] === 'object');
    t.true('Section [/section, section/index.md]' in result[1]);
    t.deepEqual(result[1]['Section [/section, section/index.md]'], ['Page [page, section/page.md]']);
});

// processSitemap tests
test('processSitemap() - should process simple items', (t) => {
    const input = ['Home [/, index.md]', 'About [/about, about.md]'];
    const result = processSitemap(input);

    t.truthy(result.sitemap);
    t.truthy(result.pages);
    t.truthy(result.urlMapping);

    // Check sitemap structure
    t.deepEqual(result.sitemap, ['/', '/about']);

    // Check pages structure with new field names
    t.truthy(result.pages['/']);
    t.truthy(result.pages['/about']);
    t.is(result.pages['/'].name, 'Home');
    t.is(result.pages['/'].title, 'Home'); // Root page without suffix
    t.is(result.pages['/about'].name, 'About');
    t.is(result.pages['/about'].title, 'About | Home'); // With root suffix
});

test('processSitemap() - should handle hierarchical structure', (t) => {
    const input = [
        'Home [/, index.md]',
        {'Section [/section, section/index.md]': ['Page [page, section/page.md]']},
    ];

    const result = processSitemap(input);

    // Check that hierarchical structure is created
    t.is(result.sitemap.length, 2);
    t.is(result.sitemap[0], '/');
    t.true(typeof result.sitemap[1] === 'object');
    t.truthy(result.sitemap[1]['/section']);

    // Check pages
    t.truthy(result.pages['/']);
    t.truthy(result.pages['/section']);
    t.truthy(result.pages['/section/page']);

    // Check breadcrumbs
    t.deepEqual(result.pages['/section/page'].breadcrumbs, ['/section']);
});

test('processSitemap() - should generate correct page titles with new field structure', (t) => {
    const input = [
        'VoyahChat [/, index.md]',
        {'Section [/section, section/index.md]': ['Page [page, section/page.md]']},
    ];

    const result = processSitemap(input);

    // Check page structure with new fields
    t.is(result.pages['/'].name, 'VoyahChat');
    t.is(result.pages['/'].title, 'VoyahChat'); // Root page should not have suffix

    t.is(result.pages['/section'].name, 'Section');
    t.is(result.pages['/section'].title, 'Section | VoyahChat'); // Should have root suffix

    t.is(result.pages['/section/page'].name, 'Page');
    t.is(result.pages['/section/page'].title, 'Page | Section | VoyahChat'); // Should have full hierarchy
});

test('processSitemap() - should handle custom root title correctly', (t) => {
    const input = [
        'MySite [/, index.md]',
        {'Docs [/docs, docs/index.md]': ['API [api, docs/api.md]']},
    ];

    const result = processSitemap(input);

    // Check that custom root title is used as suffix
    t.is(result.pages['/'].name, 'MySite');
    t.is(result.pages['/'].title, 'MySite'); // Root page without suffix

    t.is(result.pages['/docs'].name, 'Docs');
    t.is(result.pages['/docs'].title, 'Docs | MySite'); // Custom root suffix

    t.is(result.pages['/docs/api'].name, 'API');
    t.is(result.pages['/docs/api'].title, 'API | Docs | MySite'); // Full hierarchy with custom root
});

test('processSitemap() - should maintain name field for all pages', (t) => {
    const input = [
        'Home [/, index.md]',
        'About [/about, about.md]',
        {
            'Services [/services, services/index.md]': [
                'Web Design [web, services/web.md]',
                'SEO [seo, services/seo.md]',
            ],
        },
    ];

    const result = processSitemap(input);

    // Check that all pages have name field
    Object.values(result.pages).forEach((page) => {
        t.truthy(page.name, `Page ${page.url} should have name field`);
        t.is(typeof page.name, 'string', `Page ${page.url} name should be string`);
    });

    // Check specific names
    t.is(result.pages['/'].name, 'Home');
    t.is(result.pages['/about'].name, 'About');
    t.is(result.pages['/services'].name, 'Services');
    t.is(result.pages['/services/web'].name, 'Web Design');
    t.is(result.pages['/services/seo'].name, 'SEO');
});

test('processSitemap() - should create URL mappings', (t) => {
    const input = ['Home [/, index.md]', 'About [/about, about.md]'];
    const result = processSitemap(input);

    // Check URL mapping
    t.is(result.urlMapping.get('index.md'), '/');
    t.is(result.urlMapping.get('about.md'), '/about');
});

test('processSitemap() - should generate correct nested URLs with parent prefix', (t) => {
    const input = [
        'Home [/, index.md]',
        {
            'Free [/free, free/index.md]': [
                'Models [models, free/models.md]',
                {
                    'Прошивка [firmware, free/firmware.md]': [
                        '2021, NXP [2021, free/firmware_2021.md]',
                        '2023 [2023, free/firmware_2023.md]',
                    ],
                },
                {'Обслуживание [maintenance, free/maintenance.md]': ['2021 [2021, free/maintenance_2021.md]']},
            ],
        },
    ];

    const result = processSitemap(input);

    // Check that nested URLs correctly include parent prefix
    t.truthy(result.pages['/free/firmware'], 'Should have /free/firmware URL');
    t.truthy(result.pages['/free/firmware/2021'], 'Should have /free/firmware/2021 URL');
    t.truthy(result.pages['/free/firmware/2023'], 'Should have /free/firmware/2023 URL');
    t.truthy(result.pages['/free/maintenance'], 'Should have /free/maintenance URL');
    t.truthy(result.pages['/free/maintenance/2021'], 'Should have /free/maintenance/2021 URL');

    // Check that URLs are NOT missing the parent prefix
    t.falsy(result.pages['/firmware'], 'Should NOT have /firmware URL (missing parent prefix)');
    t.falsy(result.pages['/maintenance'], 'Should NOT have /maintenance URL (missing parent prefix)');

    // Check page data for correct URLs and sections
    t.is(result.pages['/free/firmware'].url, '/free/firmware');
    t.is(result.pages['/free/firmware'].section, 'free');
    t.is(result.pages['/free/firmware'].name, 'Прошивка');
    t.is(result.pages['/free/firmware'].title, 'Прошивка | Free | Home'); // Full title with hierarchy

    t.is(result.pages['/free/maintenance'].url, '/free/maintenance');
    t.is(result.pages['/free/maintenance'].section, 'free');
    t.is(result.pages['/free/maintenance'].name, 'Обслуживание');
    t.is(result.pages['/free/maintenance'].title, 'Обслуживание | Free | Home'); // Full title with hierarchy

    // Check breadcrumbs for nested pages
    t.deepEqual(result.pages['/free/firmware'].breadcrumbs, ['/free']);
    t.deepEqual(result.pages['/free/firmware/2021'].breadcrumbs, ['/free', '/free/firmware']);
    t.deepEqual(result.pages['/free/maintenance'].breadcrumbs, ['/free']);
});

test('processSitemap() - should handle multiple nesting levels correctly', (t) => {
    const input = [
        {
            'Section [/section, section/index.md]': [
                {
                    'Subsection [subsection, section/subsection.md]': [
                        'Deep Page [deep, section/subsection/deep.md]',
                    ],
                },
            ],
        },
    ];

    const result = processSitemap(input);

    // Check multi-level nesting
    t.truthy(result.pages['/section/subsection'], 'Should have /section/subsection URL');
    t.truthy(result.pages['/section/subsection/deep'], 'Should have /section/subsection/deep URL');

    // Check breadcrumbs
    t.deepEqual(result.pages['/section/subsection'].breadcrumbs, ['/section']);
    t.deepEqual(result.pages['/section/subsection/deep'].breadcrumbs, ['/section', '/section/subsection']);

    // Check sections
    t.is(result.pages['/section/subsection'].section, 'section');
    t.is(result.pages['/section/subsection/deep'].section, 'section');
});

// getLastModFromGit tests
test('getLastModFromGit() - should return date for existing file', async (t) => {
    const contentDir = Dir.getExternalContent();
    const result = await getLastModFromGit('README.md', contentDir);

    // Should return a date in YYYY-MM-DD format or null
    if (result !== null) {
        t.regex(result, /^\d{4}-\d{2}-\d{2}$/);
    } else {
        // If null, file might not be in Git yet
        t.pass();
    }
});

test('getLastModFromGit() - should return null for non-existent file', async (t) => {
    const contentDir = Dir.getExternalContent();
    const result = await getLastModFromGit('non-existent-file-12345.md', contentDir);

    t.is(result, null);
});

test('getLastModFromGit() - should return valid dates for all sitemap files', async (t) => {
    // Load sitemap using helper
    const sitemap = getSitemap();

    // Skip test if sitemap is empty
    if (Object.keys(sitemap.pages).length === 0) {
        t.pass('Skipping test - sitemap not available');
        return;
    }

    const { pages } = sitemap;

    // Check a few sample files
    const sampleFiles = Object.values(pages).slice(0, 5).map((p) => p.file);

    const contentDir = Dir.getExternalContent();

    for (const file of sampleFiles) {
        const lastmod = await getLastModFromGit(file, contentDir);

        if (lastmod !== null) {
            // Should be in YYYY-MM-DD format
            t.regex(lastmod, /^\d{4}-\d{2}-\d{2}$/, `File ${file} should have valid date format`);

            // Verify the date is reasonable (not in the future, not too old)
            const date = new Date(lastmod);
            const now = new Date();
            const fiveYearsAgo = new Date();
            fiveYearsAgo.setFullYear(now.getFullYear() - 5);

            t.true(date <= now, `Date for ${file} should not be in the future`);
            t.true(date >= fiveYearsAgo, `Date for ${file} should not be more than 5 years old`);
        }
    }

    t.pass();
});

// build-sitemap.json tests
test('build-sitemap.json - file exists after build', (t) => {
    const buildSitemapPath = path.join(Dir.getBuild(), 'build-sitemap.json');

    // Skip test if build-sitemap.json doesn't exist
    skipIfFileNotFound(t, buildSitemapPath, 'Skipping test');

    t.true(fileExists(buildSitemapPath), 'build-sitemap.json should exist');
});

test('build-sitemap.json - has unified format', (t) => {
    const buildSitemapPath = path.join(Dir.getBuild(), 'build-sitemap.json');

    // Skip test if build-sitemap.json doesn't exist
    skipIfFileNotFound(t, buildSitemapPath, 'Skipping test');

    const buildSitemap = readJsonFile(buildSitemapPath);

    // Check sitemap.xml entry
    t.truthy(buildSitemap['sitemap.xml'], 'Should have sitemap.xml entry');

    const sitemapEntry = buildSitemap['sitemap.xml'];

    t.truthy(sitemapEntry.source, 'sitemap.xml should have source');
    assertPositiveNumber(t, sitemapEntry.size, 'sitemap.xml.size');
    t.truthy(sitemapEntry.metadata, 'sitemap.xml should have metadata');
    t.truthy(sitemapEntry.metadata.url, 'sitemap.xml should have metadata.url');
    assertPositiveNumber(t, sitemapEntry.metadata.urlsCount, 'sitemap.xml.metadata.urlsCount');
});

test('build-sitemap.json - urlsCount matches sitemap pages', (t) => {
    const buildSitemapPath = path.join(Dir.getBuild(), 'build-sitemap.json');

    // Skip test if build-sitemap.json doesn't exist
    if (!fileExists(buildSitemapPath)) {
        t.pass('Skipping test - build-sitemap.json not found');
        return;
    }

    const buildSitemap = readJsonFile(buildSitemapPath);
    const sitemap = getSitemap();

    // Skip if sitemap is empty
    if (Object.keys(sitemap.pages).length === 0) {
        t.pass('Skipping test - sitemap not available');
        return;
    }

    const { urlsCount } = buildSitemap['sitemap.xml'].metadata;
    const pagesCount = Object.keys(sitemap.pages).length;

    t.is(urlsCount, pagesCount, 'urlsCount should match number of pages in sitemap');
});

test('build-sitemap.json - sitemap.xml file size is reasonable', (t) => {
    const buildSitemapPath = path.join(Dir.getBuild(), 'build-sitemap.json');

    // Skip test if build-sitemap.json doesn't exist
    skipIfFileNotFound(t, buildSitemapPath, 'Skipping test');

    const buildSitemap = readJsonFile(buildSitemapPath);
    const sitemapSize = buildSitemap['sitemap.xml'].size;

    // sitemap.xml should be at least 100 bytes and less than 1MB
    t.true(sitemapSize > 100, 'sitemap.xml should be larger than 100 bytes');
    t.true(sitemapSize < 1024 * 1024, 'sitemap.xml should be smaller than 1MB');
});

test('build-sitemap.json - urlsCount matches actual sitemap.xml URLs', (t) => {
    const buildSitemapPath = path.join(Dir.getBuild(), 'build-sitemap.json');
    const sitemapXmlPath = path.join(Dir.getSite(), 'sitemap.xml');

    // Skip test if files don't exist
    if (!fileExists(buildSitemapPath) || !fileExists(sitemapXmlPath)) {
        t.pass('Skipping test - required files not found');

        return;
    }

    const buildSitemap = readJsonFile(buildSitemapPath);
    const sitemapXml = fs.readFileSync(sitemapXmlPath, 'utf8');

    // Count <url> tags in sitemap.xml
    const urlMatches = sitemapXml.match(/<url>/g);
    const actualUrlsCount = urlMatches ? urlMatches.length : 0;

    const recordedUrlsCount = buildSitemap['sitemap.xml'].metadata.urlsCount;

    t.is(recordedUrlsCount, actualUrlsCount, 'urlsCount in build-sitemap.json should match actual URLs in sitemap.xml');
});


// extractHeadingsFromMarkdown tests
test('extractHeadingsFromMarkdown() - should extract numbered headings correctly', (t) => {
    const content = `# Main Title

## 7. Выбор приложения навигации

Some content here.

## 8. Выбор приложения музыки

More content.
`;

    const headings = extractHeadingsFromMarkdown(content, 'test.md');

    t.is(headings.length, 3); // Including H1 title

    // Check H1 heading
    const h1Heading = headings[0];
    t.is(h1Heading.text, 'Main Title');
    t.is(h1Heading.level, 1);
    t.is(h1Heading.anchor, 'main-title');

    // Check first numbered heading
    const firstHeading = headings[1];
    t.is(firstHeading.text, '7. Выбор приложения навигации');
    t.is(firstHeading.level, 2);
    t.is(firstHeading.anchor, 'main-title-выбор-приложения-навигации');

    // Check second numbered heading
    const secondHeading = headings[2];
    t.is(secondHeading.text, '8. Выбор приложения музыки');
    t.is(secondHeading.level, 2);
    t.is(secondHeading.anchor, 'main-title-выбор-приложения-музыки');
});

test('extractHeadingsFromMarkdown() - should handle hierarchical headings', (t) => {
    const content = `# Мультимедия

## 7. Выбор приложения навигации

### Subsection

Some content.

## 8. Выбор приложения музыки
`;

    const headings = extractHeadingsFromMarkdown(content, 'test.md');

    t.is(headings.length, 4); // Including H1 title

    // Check H1 heading
    const h1Heading = headings[0];
    t.is(h1Heading.text, 'Мультимедия');
    t.is(h1Heading.level, 1);
    t.is(h1Heading.anchor, 'мультимедия');

    // Check main section heading
    const mainHeading = headings[1];
    t.is(mainHeading.text, '7. Выбор приложения навигации');
    t.is(mainHeading.anchor, 'мультимедия-выбор-приложения-навигации');

    // Check subsection heading
    const subHeading = headings[2];
    t.is(subHeading.text, 'Subsection');
    t.is(subHeading.anchor, 'мультимедия-выбор-приложения-навигации-subsection');

    // Check second main heading
    const secondHeading = headings[3];
    t.is(secondHeading.text, '8. Выбор приложения музыки');
    t.is(secondHeading.anchor, 'мультимедия-выбор-приложения-музыки');
});

test('extractHeadingsFromMarkdown() - should handle root level headings without leading dash', (t) => {
    const content = `# Test

## Руководства пользователя

Some content.
`;

    const headings = extractHeadingsFromMarkdown(content, 'test.md');

    t.is(headings.length, 2); // Including H1 title

    // Check H1 heading
    const h1Heading = headings[0];
    t.is(h1Heading.text, 'Test');
    t.is(h1Heading.level, 1);
    t.is(h1Heading.anchor, 'test');

    // Check H2 heading
    const heading = headings[1];
    t.is(heading.text, 'Руководства пользователя');
    t.is(heading.anchor, 'test-руководства-пользователя'); // Prefixed with H1
});

test('extractHeadingsFromMarkdown() - should handle custom anchors', (t) => {
    const content = `# Test

## Section {#custom-id}

Some content.
`;

    const headings = extractHeadingsFromMarkdown(content, 'test.md');

    t.is(headings.length, 2); // Including H1 title

    // Check H1 heading
    const h1Heading = headings[0];
    t.is(h1Heading.text, 'Test');
    t.is(h1Heading.level, 1);
    t.is(h1Heading.anchor, 'test');

    // Check H2 heading with custom anchor
    const heading = headings[1];
    t.is(heading.text, 'Section');
    t.is(heading.anchor, 'custom-id');
});

test('extractHeadingsFromMarkdown() - should handle Cyrillic characters', (t) => {
    const content = `# Тест

## Раздел на русском

Содержимое на русском.
`;

    const headings = extractHeadingsFromMarkdown(content, 'test.md');

    t.is(headings.length, 2); // Including H1 title

    // Check H1 heading
    const h1Heading = headings[0];
    t.is(h1Heading.text, 'Тест');
    t.is(h1Heading.level, 1);
    t.is(h1Heading.anchor, 'тест');

    // Check H2 heading
    const heading = headings[1];
    t.is(heading.text, 'Раздел на русском');
    t.is(heading.anchor, 'тест-раздел-на-русском');
});

// SitemapBuilder.build() tests
const { SitemapBuilder } = require('../build/build-sitemap');
const fsPromises = require('fs').promises;
const {
    createTestFile,
    createTestContent,
    createTestSitemap,
    cleanupTestDir,
} = require('./utils');

// Basic Functionality Tests
test('SitemapBuilder.build() - builds sitemap from valid config', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    // Setup test data
    await createTestSitemap(dir, 'Home [/, index.md]\n  - About [/about, about.md]\n');
    await createTestContent(dir, {
        'index.md': '# Home\n\nWelcome home.',
        'about.md': '# About\n\nAbout us.',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        t.truthy(result);
        t.true(Array.isArray(result.sitemap));
        t.is(typeof result.pages, 'object');
        t.is(typeof result.md2url, 'object');
        t.is(typeof result.url2md, 'object');

        // Verify sitemap structure
        t.deepEqual(result.sitemap, ['/', '/about']);

        // Verify pages
        t.truthy(result.pages['/']);
        t.truthy(result.pages['/about']);
        t.is(result.pages['/'].name, 'Home');
        t.is(result.pages['/about'].name, 'About');
    } finally {
        // Cleanup
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - creates sitemap.json with correct structure', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(dir, 'Test [/, test.md]\n');
    await createTestContent(dir, {
        'test.md': '# Test\n\nTest content.',
    });

    try {
        // Act
        await builder.build();

        // Assert
        const sitemapPath = path.join(dir.getBuild(), 'sitemap.json');
        t.true(fileExists(sitemapPath));

        // Verify structure
        const sitemap = readJsonFile(sitemapPath);
        t.truthy(sitemap.sitemap);
        t.truthy(sitemap.pages);
        t.truthy(sitemap.md2url);
        t.truthy(sitemap.url2md);
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - processes hierarchical navigation correctly', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(
        dir,
        'Home [/, index.md]\n  - Docs [/docs, docs/index.md]\n    - Guide [guide, docs/guide.md]\n',
    );
    await createTestContent(dir, {
        'index.md': '# Home',
        'docs/index.md': '# Docs',
        'docs/guide.md': '# Guide',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        // Verify hierarchical structure
        t.is(result.sitemap.length, 2);
        t.is(result.sitemap[0], '/');
        t.true(typeof result.sitemap[1] === 'object');
        t.truthy(result.sitemap[1]['/docs']);

        // Verify nested page
        t.truthy(result.pages['/docs/guide']);
        t.is(result.pages['/docs/guide'].url, '/docs/guide');
        t.deepEqual(result.pages['/docs/guide'].breadcrumbs, ['/docs']);
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - handles different URL formats', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(
        dir,
        'Home [/, index.md]\n  - Section [/section, section/index.md]\n' +
        '    - Relative [relative, section/relative.md]\n    - Absolute [/absolute, absolute.md]\n',
    );
    await createTestContent(dir, {
        'index.md': '# Home',
        'section/index.md': '# Section',
        'section/relative.md': '# Relative',
        'absolute.md': '# Absolute',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        // Verify relative URL is combined with parent
        t.truthy(result.pages['/section/relative']);
        t.is(result.pages['/section/relative'].url, '/section/relative');

        // Verify absolute URL ignores parent
        t.truthy(result.pages['/absolute']);
        t.is(result.pages['/absolute'].url, '/absolute');
    } finally {
        await cleanupTestDir(dir);
    }
});

// Error Handling Tests
test('SitemapBuilder.build() - throws error for missing sitemap.yml', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    try {
        // Act & Assert
        await t.throwsAsync(
            async () => await builder.build(),
            { message: /Sitemap generation failed/ },
        );
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - handles invalid YAML syntax', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestFile(dir, 'config/sitemap.yml', 'sitemap:\n  - Invalid [unclosed bracket\n');

    try {
        // Act
        const result = await builder.build();

        // Assert - should handle gracefully - invalid lines are skipped with warnings
        t.truthy(result);
        t.true(Array.isArray(result.sitemap));
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - handles missing markdown files gracefully', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(dir, 'Missing [/, missing.md]\n');

    try {
        // Act
        const result = await builder.build();

        // Assert - should complete but page will have empty HTML
        t.truthy(result);
        t.truthy(result.pages['/']);
        t.is(result.pages['/'].html, '');
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - handles circular references in navigation', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(dir, 'Page1 [/page1, page1.md]\n  - Page2 [/page2, page2.md]\n');
    await createTestContent(dir, {
        'page1.md': '# Page 1\n\nLink to [page2](page2.md)',
        'page2.md': '# Page 2\n\nLink to [page1](page1.md)',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert - should handle circular references without infinite loop
        t.truthy(result);
        t.truthy(result.pages['/page1']);
        t.truthy(result.pages['/page2']);
    } finally {
        await cleanupTestDir(dir);
    }
});

// Data Structure Validation Tests
test('SitemapBuilder.build() - sitemap array is correctly populated', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(
        dir,
        'Home [/, index.md]\n  - About [/about, about.md]\n  - Contact [/contact, contact.md]\n',
    );
    await createTestContent(dir, {
        'index.md': '# Home',
        'about.md': '# About',
        'contact.md': '# Contact',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        // Verify sitemap array
        t.true(Array.isArray(result.sitemap));
        t.is(result.sitemap.length, 3);
        t.deepEqual(result.sitemap, ['/', '/about', '/contact']);
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - pages object has correct structure', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(dir, 'Test [/test, test.md]\n');
    await createTestContent(dir, {
        'test.md': '# Test\n\nContent.',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        // Verify page structure
        const page = result.pages['/test'];
        t.truthy(page);
        t.is(page.url, '/test');
        t.is(page.file, 'test.md');
        t.is(page.name, 'Test');
        t.is(typeof page.title, 'string');
        t.true(Array.isArray(page.breadcrumbs));
        t.is(typeof page.html, 'string');
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - md2url and url2md mappings are accurate', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(dir, 'Home [/, index.md]\n  - Docs [/docs, docs/guide.md]\n');
    await createTestContent(dir, {
        'index.md': '# Home',
        'docs/guide.md': '# Docs',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        // Verify md2url mapping
        t.is(result.md2url['index.md'], '/');
        t.is(result.md2url['docs/guide.md'], '/docs');

        // Verify url2md mapping
        t.is(result.url2md['/'], 'index.md');
        t.is(result.url2md['/docs'], 'docs/guide.md');

        // Verify bidirectional consistency
        Object.entries(result.md2url).forEach(([file, url]) => {
            t.is(result.url2md[url], file);
        });
    } finally {
        await cleanupTestDir(dir);
    }
});

// Edge Cases Tests
test('SitemapBuilder.build() - handles empty sitemap', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestFile(dir, 'config/sitemap.yml', 'sitemap:\n');

    try {
        // Act
        const result = await builder.build();

        // Assert - should handle empty sitemap gracefully
        t.truthy(result);
        t.true(Array.isArray(result.sitemap));
        t.is(result.sitemap.length, 0);
        t.deepEqual(result.pages, {});
        t.deepEqual(result.md2url, {});
        t.deepEqual(result.url2md, {});
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - handles very deep navigation hierarchy', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(
        dir,
        'L1 [/l1, l1.md]\n    - L2 [l2, l2.md]\n      - L3 [l3, l3.md]\n' +
        '        - L4 [l4, l4.md]\n          - L5 [l5, l5.md]\n',
    );
    await createTestContent(dir, {
        'l1.md': '# L1',
        'l2.md': '# L2',
        'l3.md': '# L3',
        'l4.md': '# L4',
        'l5.md': '# L5',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        // Verify deep nesting works
        t.truthy(result.pages['/l1/l2/l3/l4/l5']);
        t.is(result.pages['/l1/l2/l3/l4/l5'].url, '/l1/l2/l3/l4/l5');
        t.deepEqual(
            result.pages['/l1/l2/l3/l4/l5'].breadcrumbs,
            ['/l1', '/l1/l2', '/l1/l2/l3', '/l1/l2/l3/l4'],
        );
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - handles special characters in URLs', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    await createTestSitemap(dir, 'Cyrillic [/cyrillic, test.md]\n  - FAQ [/faq-2024, faq.md]\n');
    await createTestContent(dir, {
        'test.md': '# Cyrillic',
        'faq.md': '# FAQ',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        // Verify URL with dash and number
        t.truthy(result.pages['/faq-2024']);
        t.is(result.pages['/faq-2024'].name, 'FAQ');

        // Verify Cyrillic title
        t.truthy(result.pages['/cyrillic']);
        t.is(result.pages['/cyrillic'].name, 'Cyrillic');
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder.build() - skipWrite option prevents file creation', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
        skipWrite: true,
    }, dir);

    await createTestSitemap(dir, 'Test [/, test.md]\n');
    await createTestContent(dir, {
        'test.md': '# Test',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert - should return result but not write files
        t.truthy(result);
        t.false(fileExists(path.join(dir.getBuild(), 'sitemap.json')));
        t.false(fileExists(path.join(dir.getSite(), 'sitemap.xml')));
    } finally {
        await cleanupTestDir(dir);
    }
});

// Error Recovery Tests

test('SitemapBuilder - recovers from corrupted sitemap.yml mid-processing', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
        skipWrite: true,
    }, dir);

    await createTestFile(
        dir,
        'config/sitemap.yml',
        'sitemap:\n  - Valid [/, index.md]\n  - Corrupted [broken format without brackets\n' +
        '  - Another Valid [/valid, valid.md]\n',
    );
    await createTestContent(dir, {
        'index.md': '# Home',
        'valid.md': '# Valid',
    });

    try {
        // Act
        const result = await builder.build();

        // Assert
        t.truthy(result, 'Should return result despite corrupted lines');
        t.true(Array.isArray(result.sitemap), 'Should have sitemap array');

        // Should process valid entries
        t.truthy(result.pages['/'], 'Should process valid home page');
        t.truthy(result.pages['/valid'], 'Should process valid page');

        // Corrupted entry should be skipped
        t.is(Object.keys(result.pages).length, 2, 'Should only have 2 valid pages');
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder - cleans up after sitemap build failure', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
    }, dir);

    // Don't create sitemap.yml to trigger failure

    try {
        // Act & Assert
        await t.throwsAsync(
            async () => await builder.build(),
            { message: /Sitemap generation failed/ },
            'Should throw error for missing sitemap.yml',
        );

        // Verify no partial artifacts were created
        const buildFiles = await fsPromises.readdir(dir.getBuild()).catch(() => []);
        const siteFiles = await fsPromises.readdir(dir.getSite()).catch(() => []);

        t.false(buildFiles.includes('sitemap.json'), 'Should not create sitemap.json on failure');
        t.false(siteFiles.includes('sitemap.xml'), 'Should not create sitemap.xml on failure');
    } finally {
        await cleanupTestDir(dir);
    }
});

test('SitemapBuilder - handles circular dependencies without infinite loops', async (t) => {
    // Arrange
    const dir = new TestDir();
    const builder = new SitemapBuilder({
        sitemapPath: path.join(dir.getConfig(), 'sitemap.yml'),
        outputPath: path.join(dir.getBuild(), 'sitemap.json'),
        skipWrite: true,
    }, dir);

    await createTestSitemap(
        dir,
        'Page1 [/page1, page1.md]\n  - Page2 [/page2, page2.md]\n  - Page3 [/page3, page3.md]\n',
    );
    await createTestContent(dir, {
        'page1.md': '# Page 1\n\nLink to [page2](page2.md) and [page3](page3.md)',
        'page2.md': '# Page 2\n\nLink to [page3](page3.md) and [page1](page1.md)',
        'page3.md': '# Page 3\n\nLink to [page1](page1.md) and [page2](page2.md)',
    });

    try {
        // Set a timeout to ensure we don't hang indefinitely
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Build timed out - possible infinite loop')), 5000);
        });

        const buildPromise = builder.build();

        // Act
        const result = await Promise.race([buildPromise, timeoutPromise]);

        // Assert
        t.truthy(result, 'Should complete without infinite loop');
        t.truthy(result.pages['/page1'], 'Should process page1');
        t.truthy(result.pages['/page2'], 'Should process page2');
        t.truthy(result.pages['/page3'], 'Should process page3');
    } finally {
        await cleanupTestDir(dir);
    }
});
