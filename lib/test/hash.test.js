const fs = require('fs');
const path = require('path');
const test = require('ava');
const { getHash } = require('../build/build-html');
const { TestDir } = require('./test-dir');

test('Hash system - provides CSS and JS hashes', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    const hashes = await getHash(testDir);

    t.truthy(hashes.css, 'CSS hashes should exist');
    t.truthy(hashes.js, 'JS hashes should exist');
    // When no hash files exist, css and js should be empty objects
    t.deepEqual(hashes.css, {}, 'CSS hashes should be empty when no files exist');
    t.deepEqual(hashes.js, {}, 'JS hashes should be empty when no files exist');
});

test('Hash system - provides default values when no hash files exist', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    const hashes = await getHash(testDir);

    // When no hash files exist, should return empty objects
    t.deepEqual(hashes.css, {}, 'CSS hashes should be empty when no files exist');
    t.deepEqual(hashes.js, {}, 'JS hashes should be empty when no files exist');
});

test('Hash system - reads from build directory', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    const testCssHash = {
        page: {
            hash: 'test1234567890ab',
            filename: 'test1234567890ab.css',
            url: '/test1234567890ab.css',
        },
    };

    const testJsHash = {
        page: {
            hash: 'test0987654321cd',
            filename: 'test0987654321cd.js',
            url: '/test0987654321cd.js',
        },
    };

    const cssHashPath = path.join(testDir, 'hash-css.json');
    const jsHashPath = path.join(testDir, 'hash-js.json');

    fs.writeFileSync(cssHashPath, JSON.stringify(testCssHash, null, 2));
    fs.writeFileSync(jsHashPath, JSON.stringify(testJsHash, null, 2));

    const hashes = await getHash(testDir);

    t.deepEqual(hashes.css, testCssHash, 'CSS hashes should match test data');
    t.deepEqual(hashes.js, testJsHash, 'JS hashes should match test data');
});

test('Hash system - handles malformed JSON gracefully', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    const cssHashPath = path.join(testDir, 'hash-css.json');
    const jsHashPath = path.join(testDir, 'hash-js.json');

    // Write malformed JSON
    fs.writeFileSync(cssHashPath, '{ invalid json }');
    fs.writeFileSync(jsHashPath, '{ invalid json }');

    // Should throw SyntaxError when JSON is malformed
    await t.throwsAsync(async () => {
        await getHash(testDir);
    }, {
        name: 'SyntaxError',
        message: /Expected property name|JSON at position/,
    });
});
