const test = require('ava');
const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const FTP = require('../deploy/ftp');
const Manifest = require('../utils/manifest');
const TestDir = require('./test-dir').TestDir;

class MockFTPClient {
    constructor() {
        this.files = new Map();
        this.connected = false;
    }

    async access(config) {
        this.connected = true;
        this.config = config;
    }

    async cd(dirPath) {
        this.currentDir = dirPath;
    }

    async uploadFrom(localPath, remotePath) {
        const content = fs.readFileSync(localPath);
        this.files.set(remotePath, { content });
    }

    async downloadTo(localPath, remotePath) {
        const file = this.files.get(remotePath);
        if (file) {
            fs.writeFileSync(localPath, file.content);
        } else {
            throw new Error('550 File not found');
        }
    }

    async remove(remotePath) {
        if (!this.files.has(remotePath)) {
            throw new Error('550 File not found');
        }
        this.files.delete(remotePath);
    }

    close() {
        this.connected = false;
    }
}

test.beforeEach(t => {
    t.context.testDir = new TestDir();
    t.context.mockClient = new MockFTPClient();
    t.context.originalClient = ftp.Client;
    ftp.Client = function() {
        return t.context.mockClient;
    };
});

test.afterEach(t => {
    ftp.Client = t.context.originalClient;
});

test('Manifest.compare() - detects new files', t => {
    const local = {
        'file1.txt': { size: 10, hash: 'hash1' },
        'file2.txt': { size: 20, hash: 'hash2' },
        'new.txt': { size: 30, hash: 'hash3' },
    };
    const server = {
        'file1.txt': { size: 10, hash: 'hash1' },
        'file2.txt': { size: 20, hash: 'hash2' },
    };
    const result = Manifest.compare(local, server);
    t.is(result.totalToUpload, 1);
    t.is(result.toUpload[0].path, 'new.txt');
    t.is(result.toUpload[0].reason, 'new');
    t.is(result.totalToDelete, 0);
});

test('Manifest.compare() - detects changed files by size', t => {
    const local = { 'file1.txt': { size: 10, hash: 'hash1' }, 'file2.txt': { size: 25, hash: 'hash2' } };
    const server = { 'file1.txt': { size: 10, hash: 'hash1' }, 'file2.txt': { size: 20, hash: 'hash2' } };
    const result = Manifest.compare(local, server);
    t.is(result.totalToUpload, 1);
    t.is(result.toUpload[0].path, 'file2.txt');
    t.is(result.toUpload[0].reason, 'changed');
});

test('Manifest.compare() - detects changed files by hash (same size)', t => {
    const local = { 'file1.txt': { size: 10, hash: 'hash1' }, 'file2.txt': { size: 20, hash: 'hash-new' } };
    const server = { 'file1.txt': { size: 10, hash: 'hash1' }, 'file2.txt': { size: 20, hash: 'hash-old' } };
    const result = Manifest.compare(local, server);
    t.is(result.totalToUpload, 1);
    t.is(result.toUpload[0].path, 'file2.txt');
    t.is(result.toUpload[0].reason, 'changed');
});

test('Manifest.compare() - detects orphaned files', t => {
    const local = { 'file1.txt': { size: 10, hash: 'hash1' } };
    const server = { 'file1.txt': { size: 10, hash: 'hash1' }, 'old.txt': { size: 5, hash: 'hash-old' } };
    const result = Manifest.compare(local, server);
    t.is(result.totalToUpload, 0);
    t.is(result.totalToDelete, 1);
    t.is(result.toDelete[0], 'old.txt');
});

test('Manifest.compare() - no changes', t => {
    const local = { 'file1.txt': { size: 10, hash: 'hash1' }, 'file2.txt': { size: 20, hash: 'hash2' } };
    const server = { 'file1.txt': { size: 10, hash: 'hash1' }, 'file2.txt': { size: 20, hash: 'hash2' } };
    const result = Manifest.compare(local, server);
    t.is(result.totalToUpload, 0);
    t.is(result.totalToDelete, 0);
    t.is(result.totalUnchanged, 2);
});

test('Manifest.compare() - empty server (first deploy)', t => {
    const local = { 'file1.txt': { size: 10, hash: 'hash1' }, 'file2.txt': { size: 20, hash: 'hash2' } };
    const result = Manifest.compare(local, {});
    t.is(result.totalToUpload, 2);
    t.is(result.totalToDelete, 0);
});

test('Manifest.generateFileHash() - produces consistent hash', async t => {
    const testFile = path.join(t.context.testDir.getRoot(), 'test.txt');
    fs.writeFileSync(testFile, 'hello world');
    const hash1 = await Manifest.generateFileHash(testFile);
    const hash2 = await Manifest.generateFileHash(testFile);
    t.is(hash1, hash2);
    t.is(hash1.length, 16);
});

test('Manifest.generate() - excludes manifest.json itself', async t => {
    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'file.txt'), 'content');
    const manifest = await Manifest.generate(siteDir);
    t.true('file.txt' in manifest);
    t.false(Manifest.getFileName() in manifest);
});

test('FTP.deploy() - first deploy uploads only manifest (files already on server)', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    fs.writeFileSync(configPath, `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`);

    const ftpInstance = new FTP(configPath, t.context.testDir);
    ftpInstance.config = ftpInstance.loadConfig();

    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(siteDir, 'style.css'), 'body{}');

    await Manifest.generate(siteDir);

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    // Only manifest.json uploaded, not the content files
    t.is(ftpInstance.stats.uploaded, 1);
    t.true(t.context.mockClient.files.has(Manifest.getFileName()));
});

test('FTP.deploy() - skips unchanged files', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    fs.writeFileSync(configPath, `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`);

    const ftpInstance = new FTP(configPath, t.context.testDir);
    ftpInstance.config = ftpInstance.loadConfig();

    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'file1.txt'), 'content1');
    fs.writeFileSync(path.join(siteDir, 'file2.txt'), 'content2');

    const localManifest = await Manifest.generate(siteDir);

    // Simulate server having the same manifest
    t.context.mockClient.files.set(Manifest.getFileName(), {
        content: Buffer.from(JSON.stringify(localManifest)),
    });

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    // Only manifest.json should be uploaded
    t.is(ftpInstance.stats.uploaded, 1);
});

test('FTP.deploy() - deletes orphaned files', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    fs.writeFileSync(configPath, `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`);

    const ftpInstance = new FTP(configPath, t.context.testDir);
    ftpInstance.config = ftpInstance.loadConfig();

    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'file1.txt'), 'content1');
    const localManifest = await Manifest.generate(siteDir);

    // Server has extra file
    const serverManifest = { ...localManifest, 'old.txt': { size: 3, hash: 'orphanhash' } };
    t.context.mockClient.files.set(Manifest.getFileName(), {
        content: Buffer.from(JSON.stringify(serverManifest)),
    });
    t.context.mockClient.files.set('old.txt', { content: Buffer.from('old') });

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    t.is(ftpInstance.stats.deleted, 1);
    t.false(t.context.mockClient.files.has('old.txt'));
});

test('FTP.deploy() - handles force option', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    fs.writeFileSync(configPath, `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`);

    const ftpInstance = new FTP(configPath, t.context.testDir);
    ftpInstance.config = ftpInstance.loadConfig();

    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');

    await Manifest.generate(siteDir);

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ force: true, progress: false });

    t.is(ftpInstance.stats.uploaded, 2); // index.html + manifest.json
    t.is(ftpInstance.stats.errors, 0);
});

test('FTP.deploy() - handles dry-run option', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    fs.writeFileSync(configPath, `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`);

    const ftpInstance = new FTP(configPath, t.context.testDir);
    ftpInstance.config = ftpInstance.loadConfig();

    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(siteDir, 'style.css'), 'body{}');

    await Manifest.generate(siteDir);

    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ dryRun: true, progress: false });

    t.is(ftpInstance.stats.uploaded, 2);
    t.is(ftpInstance.stats.errors, 0);
});

test('FTP.deploy() - uploads changed files', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    fs.writeFileSync(configPath, `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`);

    const ftpInstance = new FTP(configPath, t.context.testDir);
    ftpInstance.config = ftpInstance.loadConfig();

    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'file1.txt'), 'content1');
    fs.writeFileSync(path.join(siteDir, 'file2.txt'), 'content2');

    const localManifest = await Manifest.generate(siteDir);

    // Server has file1 with same entry, file2 with different hash
    const serverManifest = {
        'file1.txt': localManifest['file1.txt'],
        'file2.txt': { size: 8, hash: 'different_hash' },
    };
    t.context.mockClient.files.set(Manifest.getFileName(), {
        content: Buffer.from(JSON.stringify(serverManifest)),
    });

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    // file2.txt + manifest.json
    t.is(ftpInstance.stats.uploaded, 2);
    t.true(t.context.mockClient.files.has('file2.txt'));
});
