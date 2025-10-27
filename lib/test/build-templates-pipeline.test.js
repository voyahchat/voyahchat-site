/**
 * Pipeline Integration Tests: Template Optimization → HTML Build
 *
 * Tests the full pipeline integration between TemplateOptimizer and HTMLBuilder:
 * - Template optimization must run before HTML build
 * - HTML builder must use optimized templates
 * - Generated HTML must contain optimizations
 * - Pipeline must fail if templates are missing
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');
const { HTMLBuilder } = require('../build/build-html');
const { TemplateOptimizer } = require('../build/build-templates');

test.beforeEach(async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;
    t.context.testDir = dir.getRoot();
    t.context.buildDir = path.join(t.context.testDir, '.build');
    t.context.siteDir = path.join(t.context.testDir, 'site');
    t.context.blocksDir = path.join(t.context.testDir, 'blocks', 'page');
    t.context.contentDir = path.join(t.context.testDir, 'external', 'voyahchat-content');

    // Create directory structure
    await fs.mkdir(t.context.buildDir, { recursive: true });
    await fs.mkdir(t.context.siteDir, { recursive: true });
    await fs.mkdir(t.context.blocksDir, { recursive: true });
    await fs.mkdir(t.context.contentDir, { recursive: true });
});

// Test 1: Build pipeline - should optimize templates before HTML build
test('Build pipeline - should optimize templates before HTML build', async (t) => {
    // Arrange
    const { dir, testDir, buildDir, blocksDir } = t.context;

    // Create template with optimization opportunities
    const templateContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ page.title }}</title>
  <link rel="stylesheet" href="{{ page.css }}">
</head>
<body class="page">
  <main class="content">
    {{ content | safe }}
  </main>
</body>
</html>`;

    await fs.writeFile(path.join(blocksDir, 'page.njk'), templateContent, 'utf8');

    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    // Act
    const result = await optimizer.build();

    // Assert
    t.is(result.templatesProcessed, 1);
    t.true(result.totalSavings > 0);

    // Verify optimized template exists
    const optimizedPath = path.join(buildDir, 'templates', 'blocks', 'page', 'page.njk');
    const optimizedExists = await fs.access(optimizedPath).then(() => true).catch(() => false);
    t.true(optimizedExists);

    // Verify optimizations were applied
    const optimizedContent = await fs.readFile(optimizedPath, 'utf8');
    t.true(optimizedContent.includes('class=page'), 'Should remove quotes from class attribute');
    t.false(optimizedContent.includes('</body></html>'), 'Should remove optional closing tags');
    t.false(optimizedContent.includes('>\n<'), 'Should remove whitespace between tags');
});

// Test 2: Build pipeline - should use optimized templates in HTML generation
test('Build pipeline - should use optimized templates in HTML generation', async (t) => {
    // Arrange
    const { dir, testDir, buildDir, siteDir, blocksDir, contentDir } = t.context;

    // Create template
    const templateContent = `<!doctype html>
<html lang="en">
<head>
  <title>{{ page.title }}</title>
</head>
<body class="page">
  {{ content | safe }}
</body>
</html>`;

    await fs.writeFile(path.join(blocksDir, 'page.njk'), templateContent, 'utf8');

    // Create content
    await fs.writeFile(path.join(contentDir, 'test.md'), '# Test Page\n\nTest content.', 'utf8');

    // Create sitemap
    const sitemap = {
        sitemap: [
            { title: 'Test', url: '/', file: 'test.md' },
        ],
        pages: {
            '/': {
                title: 'Test',
                url: '/',
                file: 'test.md',
                html: '<h1>Test Page</h1><p>Test content.</p>',
                layout: 'blocks/page/page.njk',
            },
        },
    };

    // Create hash files
    await fs.writeFile(
        path.join(buildDir, 'hash-css.json'),
        JSON.stringify({ page: { url: '/css/page.css' } }),
        'utf8',
    );
    await fs.writeFile(
        path.join(buildDir, 'hash-js.json'),
        JSON.stringify({ page: { url: '/js/page.js' } }),
        'utf8',
    );

    // Create image mapping
    await fs.writeFile(
        path.join(buildDir, 'image-mapping.json'),
        JSON.stringify({ 'logo/logo.svg': 'logo/logo.svg' }),
        'utf8',
    );

    // Step 1: Optimize templates
    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    await optimizer.build();

    // Step 2: Build HTML using optimized templates
    const htmlBuilder = new HTMLBuilder({
        buildDir,
        siteDir,
        sitemap,
        imageMapping: { 'logo/logo.svg': 'logo/logo.svg' },
        skipMinify: true,
    });

    // Act
    const buildResult = await htmlBuilder.build();

    // Assert
    t.is(buildResult.pagesProcessed, 1);

    // Verify HTML was generated
    const htmlPath = path.join(siteDir, 'index.html');
    const htmlExists = await fs.access(htmlPath).then(() => true).catch(() => false);
    t.true(htmlExists);

    // Verify HTML uses optimized template
    const htmlContent = await fs.readFile(htmlPath, 'utf8');
    t.true(htmlContent.includes('class=page'), 'Generated HTML should have unquoted attributes');
    t.false(htmlContent.includes('</body></html>'), 'Generated HTML should not have optional closing tags');
});

// Test 3: Build pipeline - should generate optimized HTML output
test('Build pipeline - should generate optimized HTML output', async (t) => {
    // Arrange
    const { dir, testDir, buildDir, siteDir, blocksDir, contentDir } = t.context;

    // Create template with multiple optimization opportunities
    const templateContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ page.title }}</title>
  <link rel="stylesheet" href="{{ page.css }}">
</head>
<body class="page">
  <header class="header">
    <nav class="nav">
      <ul class="nav-list">
        <li class="nav-item">
          <a href="/" class="nav-link">Home</a>
        </li>
      </ul>
    </nav>
  </header>
  <main class="content">
    {{ content | safe }}
  </main>
</body>
</html>`;

    await fs.writeFile(path.join(blocksDir, 'page.njk'), templateContent, 'utf8');

    // Create content
    await fs.writeFile(path.join(contentDir, 'test.md'), '# Test\n\nContent.', 'utf8');

    // Create sitemap
    const sitemap = {
        sitemap: [
            { title: 'Test', url: '/', file: 'test.md' },
        ],
        pages: {
            '/': {
                title: 'Test',
                url: '/',
                file: 'test.md',
                html: '<h1>Test</h1><p>Content.</p>',
                layout: 'blocks/page/page.njk',
            },
        },
    };

    // Create hash files
    await fs.writeFile(
        path.join(buildDir, 'hash-css.json'),
        JSON.stringify({ page: { url: '/css/page.css' } }),
        'utf8',
    );
    await fs.writeFile(
        path.join(buildDir, 'hash-js.json'),
        JSON.stringify({ page: { url: '/js/page.js' } }),
        'utf8',
    );

    // Create image mapping
    await fs.writeFile(
        path.join(buildDir, 'image-mapping.json'),
        JSON.stringify({}),
        'utf8',
    );

    // Step 1: Optimize templates
    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    await optimizer.build();

    // Step 2: Build HTML
    const htmlBuilder = new HTMLBuilder({
        buildDir,
        siteDir,
        sitemap,
        imageMapping: {},
        skipMinify: true,
    });

    // Act
    await htmlBuilder.build();

    // Assert
    const htmlPath = path.join(siteDir, 'index.html');
    const htmlContent = await fs.readFile(htmlPath, 'utf8');

    // Verify removed quotes
    t.true(htmlContent.includes('class=page'), 'Should have unquoted class=page');
    t.true(htmlContent.includes('class=header'), 'Should have unquoted class=header');
    t.true(htmlContent.includes('class=nav'), 'Should have unquoted class=nav');

    // Verify removed closing tags
    t.false(htmlContent.includes('</body></html>'), 'Should not have </body></html>');
    t.false(htmlContent.includes('</li>\n'), 'Should not have </li> with newline');

    // Verify removed whitespace
    t.false(htmlContent.includes('>\n<'), 'Should not have whitespace between tags');
    t.true(htmlContent.includes('><'), 'Should have tags directly adjacent');
});

// Test 4: Build pipeline - should save statistics correctly
test('Build pipeline - should save statistics correctly', async (t) => {
    // Arrange
    const { dir, testDir, buildDir, siteDir, blocksDir, contentDir } = t.context;

    // Create template
    const templateContent = `<!doctype html>
<html>
<head>
  <title>{{ page.title }}</title>
</head>
<body class="page">
  {{ content | safe }}
</body>
</html>`;

    await fs.writeFile(path.join(blocksDir, 'page.njk'), templateContent, 'utf8');

    // Create content
    await fs.writeFile(path.join(contentDir, 'test.md'), '# Test\n\nContent.', 'utf8');

    // Create sitemap
    const sitemap = {
        sitemap: [
            { title: 'Test', url: '/', file: 'test.md' },
        ],
        pages: {
            '/': {
                title: 'Test',
                url: '/',
                file: 'test.md',
                html: '<h1>Test</h1><p>Content.</p>',
                layout: 'blocks/page/page.njk',
            },
        },
    };

    // Create hash files
    await fs.writeFile(
        path.join(buildDir, 'hash-css.json'),
        JSON.stringify({ page: { url: '/css/page.css' } }),
        'utf8',
    );
    await fs.writeFile(
        path.join(buildDir, 'hash-js.json'),
        JSON.stringify({ page: { url: '/js/page.js' } }),
        'utf8',
    );

    // Create image mapping
    await fs.writeFile(
        path.join(buildDir, 'image-mapping.json'),
        JSON.stringify({}),
        'utf8',
    );

    // Step 1: Optimize templates
    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    await optimizer.build();

    // Step 2: Build HTML
    const htmlBuilder = new HTMLBuilder({
        buildDir,
        siteDir,
        sitemap,
        imageMapping: {},
    });

    // Act
    await htmlBuilder.build();

    // Assert - Verify template statistics
    const templateStatsPath = path.join(buildDir, 'build-templates.json');
    const templateStatsExists = await fs.access(templateStatsPath).then(() => true).catch(() => false);
    t.true(templateStatsExists, 'Template statistics should exist');

    const templateStats = JSON.parse(await fs.readFile(templateStatsPath, 'utf8'));
    t.truthy(templateStats['blocks/page/page.njk'], 'Should have template stats');
    t.true(typeof templateStats['blocks/page/page.njk'].size === 'number');
    t.truthy(templateStats['blocks/page/page.njk'].metadata);
    t.true(typeof templateStats['blocks/page/page.njk'].metadata.originalSize === 'number');
    t.true(typeof templateStats['blocks/page/page.njk'].metadata.savings === 'number');

    // Assert - Verify HTML statistics
    const htmlStatsPath = path.join(buildDir, 'build-html.json');
    const htmlStatsExists = await fs.access(htmlStatsPath).then(() => true).catch(() => false);
    t.true(htmlStatsExists, 'HTML statistics should exist');

    const htmlStats = JSON.parse(await fs.readFile(htmlStatsPath, 'utf8'));
    t.truthy(htmlStats['index.html'], 'Should have HTML stats');
    t.is(htmlStats['index.html'].source, 'test.md');
    t.true(typeof htmlStats['index.html'].size === 'number');
});

// Test 5: Build pipeline - should fail if optimized templates are missing
test('Build pipeline - should fail if optimized templates are missing', async (t) => {
    // Arrange
    const { buildDir, siteDir } = t.context;

    // Create sitemap without optimizing templates first
    const sitemap = {
        sitemap: [
            { title: 'Test', url: '/', file: 'test.md' },
        ],
        pages: {
            '/': {
                title: 'Test',
                url: '/',
                file: 'test.md',
                html: '<h1>Test</h1><p>Content.</p>',
                layout: 'blocks/page/page.njk',
            },
        },
    };

    // Create hash files
    await fs.writeFile(
        path.join(buildDir, 'hash-css.json'),
        JSON.stringify({ page: { url: '/css/page.css' } }),
        'utf8',
    );
    await fs.writeFile(
        path.join(buildDir, 'hash-js.json'),
        JSON.stringify({ page: { url: '/js/page.js' } }),
        'utf8',
    );

    // Create image mapping
    await fs.writeFile(
        path.join(buildDir, 'image-mapping.json'),
        JSON.stringify({}),
        'utf8',
    );

    const htmlBuilder = new HTMLBuilder({
        buildDir,
        siteDir,
        sitemap,
        imageMapping: {},
    });

    // Act & Assert
    const error = await t.throwsAsync(async () => {
        await htmlBuilder.build();
    });

    t.truthy(error);
    t.true(error.message.includes('Optimized templates not found'));
    t.true(error.message.includes('.build/templates/'));
    t.true(error.message.includes('npm run build:templates'));
});
