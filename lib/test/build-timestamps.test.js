const test = require('ava');
const fs = require('fs');
const path = require('path');
const { TestDir } = require('./test-dir');
const { TimestampsBuilder } = require('../build/build-timestamps');

test.beforeEach(async (t) => {
    // Create test directory structure
    t.context.testDir = new TestDir();
    t.context.siteDir = t.context.testDir.getSite();
});

test('TimestampsBuilder.generate() - creates timestamps.json with all file timestamps', async (t) => {
    const { siteDir } = t.context;

    // Create test files with different timestamps
    fs.writeFileSync(path.join(siteDir, 'file1.txt'), 'content1');
    fs.writeFileSync(path.join(siteDir, 'file2.txt'), 'content2');
    fs.mkdirSync(path.join(siteDir, 'subdir'));
    fs.writeFileSync(path.join(siteDir, 'subdir', 'file3.txt'), 'content3');

    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    // Create builder with custom Dir
    const builder = new TimestampsBuilder({
        getSite: () => siteDir,
    });

    // Generate timestamps
    const timestamps = builder.generate();

    // Verify timestamps.json was created
    const timestampsPath = path.join(siteDir, 'timestamps.json');
    t.true(fs.existsSync(timestampsPath));

    // Verify all files are included
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'file1.txt'));
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'file2.txt'));
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'subdir/file3.txt'));

    // Verify timestamps are numbers (milliseconds since epoch)
    t.true(typeof timestamps['file1.txt'] === 'number');
    t.true(typeof timestamps['file2.txt'] === 'number');
    t.true(typeof timestamps['subdir/file3.txt'] === 'number');

    // Verify timestamps are recent (within last minute)
    const now = Date.now();
    t.true(now - timestamps['file1.txt'] < 60000);
    t.true(now - timestamps['file2.txt'] < 60000);
    t.true(now - timestamps['subdir/file3.txt'] < 60000);
});

test('TimestampsBuilder.generate() - handles empty directory', async (t) => {
    const { siteDir } = t.context;

    // Create builder with custom Dir
    const builder = new TimestampsBuilder({
        getSite: () => siteDir,
    });

    // Generate timestamps
    const timestamps = builder.generate();

    // Verify timestamps.json was created
    const timestampsPath = path.join(siteDir, 'timestamps.json');
    t.true(fs.existsSync(timestampsPath));

    // Should be empty
    t.deepEqual(timestamps, {});
});

test('TimestampsBuilder.generate() - handles nested directories', async (t) => {
    const { siteDir } = t.context;

    // Create nested directory structure
    fs.mkdirSync(path.join(siteDir, 'level1'));
    fs.mkdirSync(path.join(siteDir, 'level1', 'level2'));
    fs.mkdirSync(path.join(siteDir, 'level1', 'level2', 'level3'));

    // Create files at different levels
    fs.writeFileSync(path.join(siteDir, 'root.txt'), 'root');
    fs.writeFileSync(path.join(siteDir, 'level1', 'level1.txt'), 'level1');
    fs.writeFileSync(path.join(siteDir, 'level1', 'level2', 'level2.txt'), 'level2');
    fs.writeFileSync(path.join(siteDir, 'level1', 'level2', 'level3', 'level3.txt'), 'level3');

    // Create builder with custom Dir
    const builder = new TimestampsBuilder({
        getSite: () => siteDir,
    });

    // Generate timestamps
    const timestamps = builder.generate();

    // Verify all files are included with correct paths
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'root.txt'));
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'level1/level1.txt'));
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'level1/level2/level2.txt'));
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'level1/level2/level3/level3.txt'));

    // Verify timestamps are numbers
    t.true(typeof timestamps['root.txt'] === 'number');
    t.true(typeof timestamps['level1/level1.txt'] === 'number');
    t.true(typeof timestamps['level1/level2/level2.txt'] === 'number');
    t.true(typeof timestamps['level1/level2/level3/level3.txt'] === 'number');
});

test('TimestampsBuilder.generate() - overwrites existing timestamps.json', async (t) => {
    const { siteDir } = t.context;

    // Create existing timestamps.json
    const existingTimestamps = {
        'old.txt': 1234567890123,
    };
    const timestampsPath = path.join(siteDir, 'timestamps.json');
    fs.writeFileSync(timestampsPath, JSON.stringify(existingTimestamps));

    // Create a new file
    fs.writeFileSync(path.join(siteDir, 'new.txt'), 'new');

    // Create builder with custom Dir
    const builder = new TimestampsBuilder({
        getSite: () => siteDir,
    });

    // Generate timestamps
    const timestamps = builder.generate();

    // Should only contain the new file
    t.false(Object.prototype.hasOwnProperty.call(timestamps, 'old.txt'));
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'new.txt'));
});

test('TimestampsBuilder constructor - accepts custom Dir implementation', async (t) => {
    const { siteDir } = t.context;

    // Create mock Dir
    const mockDir = {
        getSite: () => siteDir,
    };

    // Create builder with mock Dir
    const builder = new TimestampsBuilder(mockDir);

    // Create a test file
    fs.writeFileSync(path.join(siteDir, 'test.txt'), 'test');

    // Generate timestamps
    const timestamps = builder.generate();

    // Should work with custom Dir
    t.true(Object.prototype.hasOwnProperty.call(timestamps, 'test.txt'));
});
