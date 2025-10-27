/**
 * Integration Tests: Template Optimization
 *
 * Tests for TemplateOptimizer class integration with file system:
 * - optimizeFile() with real file I/O
 * - build() with directory scanning
 * - Statistics generation
 */

const test = require('ava');
const { TemplateOptimizer } = require('../build/build-templates');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');

test.beforeEach(async (t) => {
    t.context.dir = new TestDir();
});

// Test optimizeFile()

test('TemplateOptimizer.optimizeFile() - should optimize template file', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const inputPath = path.join(testDir, 'input.njk');
    const outputPath = path.join(testDir, 'output.njk');

    const templateContent = '<div class="container">  <span>  text  </span>  </div>';
    await fs.writeFile(inputPath, templateContent, 'utf8');

    const optimizer = new TemplateOptimizer({}, dir);

    // Act
    const result = await optimizer.optimizeFile(inputPath, outputPath);

    // Assert
    t.is(result.inputPath, inputPath);
    t.is(result.outputPath, outputPath);
    t.is(result.originalSize, Buffer.byteLength(templateContent, 'utf8'));
    t.true(result.optimizedSize < result.originalSize);
    t.true(result.savings > 0);
    t.true(result.optimized);

    const outputContent = await fs.readFile(outputPath, 'utf8');
    t.is(outputContent, '<div class=container><span>  text  </span></div>');
});

test('TemplateOptimizer.optimizeFile() - should preserve Nunjucks syntax', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const inputPath = path.join(testDir, 'input.njk');
    const outputPath = path.join(testDir, 'output.njk');

    const templateContent = `<div class="container">
  {% for item in items %}
    <div class="item">{{ item.name }}</div>
  {% endfor %}
</div>`;
    await fs.writeFile(inputPath, templateContent, 'utf8');

    const optimizer = new TemplateOptimizer({}, dir);

    // Act
    const result = await optimizer.optimizeFile(inputPath, outputPath);

    // Assert
    t.true(result.optimized);

    const outputContent = await fs.readFile(outputPath, 'utf8');
    t.true(outputContent.includes('{% for item in items %}'));
    t.true(outputContent.includes('{{ item.name }}'));
    t.true(outputContent.includes('{% endfor %}'));
});

test('TemplateOptimizer.optimizeFile() - should handle includes', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const inputPath = path.join(testDir, 'input.njk');
    const outputPath = path.join(testDir, 'output.njk');

    const templateContent = `<div class="page">
  {% include "header.njk" %}
  <main class="content">Content here</main>
  {% include "footer.njk" %}
</div>`;
    await fs.writeFile(inputPath, templateContent, 'utf8');

    const optimizer = new TemplateOptimizer({}, dir);

    // Act
    const result = await optimizer.optimizeFile(inputPath, outputPath);

    // Assert
    t.true(result.optimized);

    const outputContent = await fs.readFile(outputPath, 'utf8');
    t.true(outputContent.includes('{% include "header.njk" %}'));
    t.true(outputContent.includes('{% include "footer.njk" %}'));
});

test('TemplateOptimizer.optimizeFile() - should handle variables', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const inputPath = path.join(testDir, 'input.njk');
    const outputPath = path.join(testDir, 'output.njk');

    const templateContent = `<html>
  <head>
    <title>{{ page.title }}</title>
    <link href="{{ page.css }}" rel="stylesheet">
  </head>
  <body>
    <h1>{{ page.heading }}</h1>
  </body>
</html>`;
    await fs.writeFile(inputPath, templateContent, 'utf8');

    const optimizer = new TemplateOptimizer({}, dir);

    // Act
    const result = await optimizer.optimizeFile(inputPath, outputPath);

    // Assert
    t.true(result.optimized);

    const outputContent = await fs.readFile(outputPath, 'utf8');
    t.true(outputContent.includes('{{ page.title }}'));
    t.true(outputContent.includes('{{ page.css }}'));
    t.true(outputContent.includes('{{ page.heading }}'));
});

test('TemplateOptimizer.optimizeFile() - should create output directory if needed', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const inputPath = path.join(testDir, 'input.njk');
    const outputPath = path.join(testDir, 'nested', 'deep', 'output.njk');

    const templateContent = '<div>test</div>';
    await fs.writeFile(inputPath, templateContent, 'utf8');

    const optimizer = new TemplateOptimizer({}, dir);

    // Act
    const result = await optimizer.optimizeFile(inputPath, outputPath);

    // Assert
    t.true(result.optimized);

    const outputExists = await fs.access(outputPath).then(() => true).catch(() => false);
    t.true(outputExists);
});

test('TemplateOptimizer.optimizeFile() - should handle invalid template gracefully', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const inputPath = path.join(testDir, 'input.njk');
    const outputPath = path.join(testDir, 'output.njk');

    const templateContent = '{% invalid syntax that will fail parsing %}';
    await fs.writeFile(inputPath, templateContent, 'utf8');

    const optimizer = new TemplateOptimizer({}, dir);

    // Act
    const result = await optimizer.optimizeFile(inputPath, outputPath);

    // Assert
    t.false(result.optimized);
    t.is(result.savings, 0);

    const outputContent = await fs.readFile(outputPath, 'utf8');
    t.is(outputContent, templateContent);
});

// Test build()

test('TemplateOptimizer.build() - should optimize all templates', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const blocksDir = path.join(testDir, 'blocks', 'page');
    const buildDir = path.join(testDir, '.build');

    await fs.mkdir(blocksDir, { recursive: true });

    await fs.writeFile(
        path.join(blocksDir, 'page.njk'),
        '<div class="page">  <h1>{{ title }}</h1>  </div>',
        'utf8',
    );
    await fs.writeFile(
        path.join(blocksDir, 'header.njk'),
        '<header class="header">  <nav>  links  </nav>  </header>',
        'utf8',
    );

    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    // Act
    const result = await optimizer.build();

    // Assert
    t.is(result.templatesProcessed, 2);
    t.true(result.totalOriginalSize > 0);
    t.true(result.totalOptimizedSize > 0);
    t.true(result.totalSavings > 0);
    t.true(parseFloat(result.savingsPercent) > 0);

    const outputPage = await fs.readFile(
        path.join(buildDir, 'templates', 'blocks', 'page', 'page.njk'),
        'utf8',
    );
    t.is(outputPage, '<div class=page><h1>{{ title }}</h1></div>');

    const outputHeader = await fs.readFile(
        path.join(buildDir, 'templates', 'blocks', 'page', 'header.njk'),
        'utf8',
    );
    t.is(outputHeader, '<header class=header><nav>  links  </nav></header>');
});

test('TemplateOptimizer.build() - should save statistics', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const blocksDir = path.join(testDir, 'blocks');
    const buildDir = path.join(testDir, '.build');

    await fs.mkdir(blocksDir, { recursive: true });

    await fs.writeFile(
        path.join(blocksDir, 'test.njk'),
        '<div class="test">  content  </div>',
        'utf8',
    );

    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    // Act
    await optimizer.build();

    // Assert
    const statsPath = path.join(buildDir, 'build-templates.json');
    const statsExists = await fs.access(statsPath).then(() => true).catch(() => false);
    t.true(statsExists);

    const statsContent = await fs.readFile(statsPath, 'utf8');
    const stats = JSON.parse(statsContent);

    t.truthy(stats['blocks/test.njk']);
    t.is(stats['blocks/test.njk'].source, 'blocks/test.njk');
    t.true(typeof stats['blocks/test.njk'].size === 'number');
    t.truthy(stats['blocks/test.njk'].metadata);
    t.true(typeof stats['blocks/test.njk'].metadata.originalSize === 'number');
    t.true(typeof stats['blocks/test.njk'].metadata.savings === 'number');
});

test('TemplateOptimizer.build() - should handle external templates', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const externalDir = path.join(testDir, 'external', 'adaptive-layout', 'blocks', 'header');
    const buildDir = path.join(testDir, '.build');

    await fs.mkdir(externalDir, { recursive: true });

    await fs.writeFile(
        path.join(externalDir, 'header.njk'),
        '<header>  <h1>{{ title }}</h1>  </header>',
        'utf8',
    );

    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    // Act
    const result = await optimizer.build();

    // Assert
    t.is(result.templatesProcessed, 1);

    const outputPath = path.join(
        buildDir,
        'templates',
        'external',
        'adaptive-layout',
        'blocks',
        'header',
        'header.njk',
    );
    const outputExists = await fs.access(outputPath).then(() => true).catch(() => false);
    t.true(outputExists);

    const outputContent = await fs.readFile(outputPath, 'utf8');
    t.is(outputContent, '<header><h1>{{ title }}</h1></header>');
});

test('TemplateOptimizer.build() - should handle empty directories', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const blocksDir = path.join(testDir, 'blocks');
    const buildDir = path.join(testDir, '.build');

    await fs.mkdir(blocksDir, { recursive: true });

    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    // Act
    const result = await optimizer.build();

    // Assert
    t.is(result.templatesProcessed, 0);
    t.is(result.totalOriginalSize, 0);
    t.is(result.totalOptimizedSize, 0);
    t.is(result.totalSavings, 0);
    t.is(result.savingsPercent, 0);
});

test('TemplateOptimizer.build() - should handle nested template directories', async (t) => {
    // Arrange
    const dir = t.context.dir;
    const testDir = dir.getRoot();
    const nestedDir = path.join(testDir, 'blocks', 'components', 'button');
    const buildDir = path.join(testDir, '.build');

    await fs.mkdir(nestedDir, { recursive: true });

    await fs.writeFile(
        path.join(nestedDir, 'button.njk'),
        '<button class="btn">  {{ text }}  </button>',
        'utf8',
    );

    const optimizer = new TemplateOptimizer({
        rootDir: testDir,
        buildDir,
    }, dir);

    // Act
    const result = await optimizer.build();

    // Assert
    t.is(result.templatesProcessed, 1);

    const outputPath = path.join(
        buildDir,
        'templates',
        'blocks',
        'components',
        'button',
        'button.njk',
    );
    const outputExists = await fs.access(outputPath).then(() => true).catch(() => false);
    t.true(outputExists);

    const outputContent = await fs.readFile(outputPath, 'utf8');
    t.is(outputContent, '<button class=btn>{{ text }}</button>');
});
