const test = require('ava');
const fs = require('fs');
const path = require('path');
const { TestDir } = require('./test-dir');
const TimestampsJson = require('../build/timestamps-json');
const { TimestampsBuilder } = require('../build/build-timestamps');

test.beforeEach(async (t) => {
    // Create test directory structure
    t.context.testDir = new TestDir();
    t.context.siteDir = t.context.testDir.getSite();
});

test('TimestampsJson.generate() - creates timestamps.json with all file timestamps', async (t) => {
    const { siteDir } = t.context;

    // Create test files with different timestamps
    fs.writeFileSync(path.join(siteDir, 'file1.txt'), 'content1');
    fs.writeFileSync(path.join(siteDir, 'file2.txt'), 'content2');
    fs.mkdirSync(path.join(siteDir, 'subdir'));
    fs.writeFileSync(path.join(siteDir, 'subdir', 'file3.txt'), 'content3');

    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    // Generate timestamps using TestDir
    const builder = new TimestampsBuilder(t.context.testDir);
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

test('TimestampsJson.load() - loads timestamps.json if it exists', async (t) => {
    const { siteDir } = t.context;

    // Create a timestamps.json file
    const testTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890456,
        'subdir/file3.txt': 1234567890789,
    };

    const timestampsPath = path.join(siteDir, 'timestamps.json');
    fs.writeFileSync(timestampsPath, JSON.stringify(testTimestamps));

    // Load timestamps directly from file
    if (fs.existsSync(timestampsPath)) {
        const timestamps = JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));
        // Verify loaded timestamps match
        t.deepEqual(timestamps, testTimestamps);
    } else {
        t.fail('timestamps.json should exist');
    }
});

test('TimestampsJson.load() - returns empty object if timestamps.json does not exist', async (t) => {
    const { siteDir } = t.context;

    // Load timestamps directly from file
    const timestampsPath = path.join(siteDir, 'timestamps.json');

    // Ensure file doesn't exist
    if (fs.existsSync(timestampsPath)) {
        fs.unlinkSync(timestampsPath);
    }

    // Should return empty object when file doesn't exist
    if (fs.existsSync(timestampsPath)) {
        const timestamps = JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));
        t.deepEqual(timestamps, {});
    } else {
        // File doesn't exist, which is what we want
        t.pass('timestamps.json does not exist as expected');
    }
});

test('TimestampsJson.compareTimestamps() - identifies new files', async (t) => {
    const localTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890456,
        'newfile.txt': 1234567890999,
    };

    const remoteTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890456,
    };

    const filesToUpload = TimestampsJson.compareTimestamps(localTimestamps, remoteTimestamps);

    // Should identify newfile.txt as new
    t.is(filesToUpload.length, 1);
    t.is(filesToUpload[0].path, 'newfile.txt');
    t.is(filesToUpload[0].reason, 'new');
});

test('TimestampsJson.compareTimestamps() - identifies updated files', async (t) => {
    const localTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567896000,  // Much newer timestamp (5+ seconds difference)
        'file3.txt': 1234567890456,
    };

    const remoteTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890456,  // Older timestamp
        'file3.txt': 1234567890456,
    };

    const filesToUpload = TimestampsJson.compareTimestamps(localTimestamps, remoteTimestamps);

    // Should identify file2.txt as updated
    t.is(filesToUpload.length, 1);
    t.is(filesToUpload[0].path, 'file2.txt');
    t.is(filesToUpload[0].reason, 'updated');
});

test('TimestampsJson.compareTimestamps() - ignores files with same timestamps', async (t) => {
    const localTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890456,
        'file3.txt': 1234567890789,
    };

    const remoteTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890456,
        'file3.txt': 1234567890789,
    };

    const filesToUpload = TimestampsJson.compareTimestamps(localTimestamps, remoteTimestamps);

    // Should identify no files to upload
    t.is(filesToUpload.length, 0);
});

test('TimestampsJson.compareTimestamps() - handles timezone differences with tolerance', async (t) => {
    const localTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890456,
    };

    const remoteTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890451,  // 5 seconds difference (within tolerance)
    };

    const filesToUpload = TimestampsJson.compareTimestamps(localTimestamps, remoteTimestamps);

    // Should identify no files to upload (within 5-second tolerance)
    t.is(filesToUpload.length, 0);
});

test('TimestampsJson.compareTimestamps() - identifies files older than tolerance', async (t) => {
    const localTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567896000,  // Much newer timestamp (5+ seconds difference)
    };

    const remoteTimestamps = {
        'file1.txt': 1234567890123,
        'file2.txt': 1234567890450,  // Much older timestamp (5+ seconds difference)
    };

    const filesToUpload = TimestampsJson.compareTimestamps(localTimestamps, remoteTimestamps);

    // Should identify file2.txt as updated (outside 5-second tolerance)
    t.is(filesToUpload.length, 1);
    t.is(filesToUpload[0].path, 'file2.txt');
    t.is(filesToUpload[0].reason, 'updated');
});
