const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');

test.afterEach.always(async (t) => {
    if (t.context.dir) {
        await fs.rm(t.context.dir.getRoot(), { recursive: true, force: true })
            .catch(() => {});
    }
});

test('TestDir.constructor() - should create unique test directory', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const rootDir = dir.getRoot();

    t.true(typeof rootDir === 'string');
    t.true(rootDir.includes('test-'));

    const stats = await fs.stat(rootDir);
    t.true(stats.isDirectory());
});

test('TestDir.constructor() - should create unique directories for each instance', async (t) => {
    const dir1 = new TestDir();
    const dir2 = new TestDir();

    t.context.dir = dir1;

    t.not(dir1.getRoot(), dir2.getRoot());

    await fs.rm(dir2.getRoot(), { recursive: true, force: true })
        .catch(() => {});
});

test('TestDir.getBuild() - should create build directory automatically', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const buildDir = dir.getBuild();

    t.true(typeof buildDir === 'string');
    t.true(buildDir.endsWith('.build'));

    const stats = await fs.stat(buildDir);
    t.true(stats.isDirectory());
});

test('TestDir.getBuild() - should not create directory twice', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const buildDir1 = dir.getBuild();
    const buildDir2 = dir.getBuild();

    t.is(buildDir1, buildDir2);

    const stats = await fs.stat(buildDir1);
    t.true(stats.isDirectory());
});

test('TestDir.getSite() - should create site directory automatically', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const siteDir = dir.getSite();

    t.true(typeof siteDir === 'string');
    t.true(siteDir.endsWith('site'));

    const stats = await fs.stat(siteDir);
    t.true(stats.isDirectory());
});

test('TestDir.getConfig() - should create config directory automatically', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const configDir = dir.getConfig();

    t.true(typeof configDir === 'string');
    t.true(configDir.endsWith('config'));

    const stats = await fs.stat(configDir);
    t.true(stats.isDirectory());
});

test('TestDir.getContent() - should create content directory automatically', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const contentDir = dir.getContent();

    t.true(typeof contentDir === 'string');
    t.true(contentDir.includes('external/voyahchat-content'));

    const stats = await fs.stat(contentDir);
    t.true(stats.isDirectory());
});

test('TestDir.getDocs() - should create docs directory automatically', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const docsDir = dir.getDocs();

    t.true(typeof docsDir === 'string');
    t.true(docsDir.includes('external/voyahchat-docs'));

    const stats = await fs.stat(docsDir);
    t.true(stats.isDirectory());
});

test('TestDir.getInstall() - should create install directory automatically', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const installDir = dir.getInstall();

    t.true(typeof installDir === 'string');
    t.true(installDir.includes('external/voyahchat-install'));

    const stats = await fs.stat(installDir);
    t.true(stats.isDirectory());
});

test('TestDir.getAdaptive() - should create adaptive-layout directory automatically', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const adaptiveDir = dir.getAdaptive();

    t.true(typeof adaptiveDir === 'string');
    t.true(adaptiveDir.includes('external/adaptive-layout'));

    const stats = await fs.stat(adaptiveDir);
    t.true(stats.isDirectory());
});

test('TestDir.getBlocks() - should create blocks directory automatically', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const blocksDir = dir.getBlocks();

    t.true(typeof blocksDir === 'string');
    t.true(blocksDir.endsWith('blocks'));

    const stats = await fs.stat(blocksDir);
    t.true(stats.isDirectory());
});

test('TestDir.ensure() - should create directory if it does not exist', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const customDir = path.join(dir.getRoot(), 'custom', 'nested', 'dir');

    await dir.ensure(customDir);

    const stats = await fs.stat(customDir);
    t.true(stats.isDirectory());
});

test('TestDir.ensure() - should not fail if directory already exists', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const customDir = path.join(dir.getRoot(), 'custom');

    await dir.ensure(customDir);
    await dir.ensure(customDir);

    const stats = await fs.stat(customDir);
    t.true(stats.isDirectory());
});

test('TestDir.scan() - should find files with specific extensions', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const testDir = dir.getRoot();

    await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.css'), 'content');
    await fs.writeFile(path.join(testDir, 'file3.txt'), 'content');

    const jsFiles = await dir.scan(testDir, ['.js']);

    t.is(jsFiles.length, 1);
    t.true(jsFiles[0].endsWith('file1.js'));
});

test('TestDir.scan() - should scan recursively', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const testDir = dir.getRoot();
    const subDir = path.join(testDir, 'subdir');

    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
    await fs.writeFile(path.join(subDir, 'file2.js'), 'content');

    const jsFiles = await dir.scan(testDir, ['.js']);

    t.is(jsFiles.length, 2);
});

test('TestDir.scan() - should exclude specified directories', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const testDir = dir.getRoot();
    const excludedDir = path.join(testDir, 'node_modules');

    await fs.mkdir(excludedDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
    await fs.writeFile(path.join(excludedDir, 'file2.js'), 'content');

    const jsFiles = await dir.scan(testDir, ['.js'], ['node_modules']);

    t.is(jsFiles.length, 1);
    t.true(jsFiles[0].endsWith('file1.js'));
});

test('TestDir.scan() - should exclude dot directories', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const testDir = dir.getRoot();
    const dotDir = path.join(testDir, '.hidden');

    await fs.mkdir(dotDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
    await fs.writeFile(path.join(dotDir, 'file2.js'), 'content');

    const jsFiles = await dir.scan(testDir, ['.js']);

    t.is(jsFiles.length, 1);
    t.true(jsFiles[0].endsWith('file1.js'));
});

test('TestDir.scan() - should return all files when no extensions specified', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const testDir = dir.getRoot();

    await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.css'), 'content');
    await fs.writeFile(path.join(testDir, 'file3.txt'), 'content');

    const allFiles = await dir.scan(testDir);

    t.is(allFiles.length, 3);
});

test('TestDir.ensure() - static method should create directory', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const customDir = path.join(dir.getRoot(), 'static-test');

    await TestDir.ensure(customDir);

    const stats = await fs.stat(customDir);
    t.true(stats.isDirectory());
});

test('TestDir.scan() - static method should scan directory', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const testDir = dir.getRoot();

    await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
    await fs.writeFile(path.join(testDir, 'file2.css'), 'content');

    const jsFiles = await TestDir.scan(testDir, ['.js']);

    t.is(jsFiles.length, 1);
    t.true(jsFiles[0].endsWith('file1.js'));
});

test('TestDir - multiple directory methods should work together', async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    const buildDir = dir.getBuild();
    const siteDir = dir.getSite();
    const configDir = dir.getConfig();

    await fs.writeFile(path.join(buildDir, 'test.json'), '{}');
    await fs.writeFile(path.join(siteDir, 'index.html'), '<html></html>');
    await fs.writeFile(path.join(configDir, 'config.yml'), 'test: true');

    const buildStats = await fs.stat(buildDir);
    const siteStats = await fs.stat(siteDir);
    const configStats = await fs.stat(configDir);

    t.true(buildStats.isDirectory());
    t.true(siteStats.isDirectory());
    t.true(configStats.isDirectory());

    const buildFile = await fs.readFile(path.join(buildDir, 'test.json'), 'utf8');
    t.is(buildFile, '{}');
});
