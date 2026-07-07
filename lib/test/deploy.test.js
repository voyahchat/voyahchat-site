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

    async list(dirPath) {
        const results = [];
        const prefix = dirPath === '.' ? '' : dirPath + '/';
        for (const [remotePath, file] of this.files) {
            if (remotePath === prefix) continue;
            if (!remotePath.startsWith(prefix)) continue;
            const rest = remotePath.slice(prefix.length);
            if (rest.includes('/')) {
                const dir = rest.split('/')[0];
                if (!results.some(r => r.name === dir && r.isDirectory)) {
                    results.push({ name: dir, isDirectory: true });
                }
            } else {
                results.push({ name: rest, size: file.content.length, isDirectory: false });
            }
        }
        return results;
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

test('Manifest.preserveFiles() - copies entries from server to local manifest', t => {
    const local = { 'file1.txt': { size: 10, hash: 'hash1' } };
    const server = {
        'file1.txt': { size: 10, hash: 'hash1' },
        'app.zip': { size: 1000, hash: 'ziphash' },
        'manual.pdf': { size: 5000, hash: 'pdfhash' },
    };

    const preserved = Manifest.preserveFiles(local, server, ['app.zip', 'manual.pdf']);

    t.is(preserved, 2);
    t.deepEqual(local['app.zip'], { size: 1000, hash: 'ziphash' });
    t.deepEqual(local['manual.pdf'], { size: 5000, hash: 'pdfhash' });
});

test('Manifest.preserveFiles() - skips files already in local manifest', t => {
    const local = {
        'file1.txt': { size: 10, hash: 'hash1' },
        'app.zip': { size: 999, hash: 'newhash' },
    };
    const server = {
        'file1.txt': { size: 10, hash: 'hash1' },
        'app.zip': { size: 1000, hash: 'oldhash' },
    };

    const preserved = Manifest.preserveFiles(local, server, ['app.zip']);

    t.is(preserved, 0);
    t.is(local['app.zip'].size, 999, 'Should keep local version');
});

test('Manifest.preserveFiles() - skips files not on server', t => {
    const local = { 'file1.txt': { size: 10, hash: 'hash1' } };
    const server = { 'file1.txt': { size: 10, hash: 'hash1' } };

    const preserved = Manifest.preserveFiles(local, server, ['missing.zip']);

    t.is(preserved, 0);
    t.false('missing.zip' in local);
});

test('Manifest.compareWithServer() - detects new files (not on server)', t => {
    const local = { 'file.txt': { size: 10, hash: 'h1' } };
    const serverManifest = {};
    const serverSizes = {};
    const result = Manifest.compareWithServer(local, serverManifest, serverSizes);
    t.is(result.totalToUpload, 1);
    t.is(result.toUpload[0].reason, 'new');
    t.is(result.totalToDelete, 0);
});

test('Manifest.compareWithServer() - detects size mismatch via actual LIST sizes', t => {
    const local = { 'app.zip': { size: 191535834, hash: 'h1' } };
    const serverManifest = { 'app.zip': { size: 191535834, hash: 'h1' } };
    // Server manifest says 191MB but actual file is 163MB (stale manifest)
    const serverSizes = { 'app.zip': 163577856 };
    const result = Manifest.compareWithServer(local, serverManifest, serverSizes);
    t.is(result.totalToUpload, 1);
    t.is(result.toUpload[0].reason, 'changed');
    t.is(result.totalUnchanged, 0);
});

test('Manifest.compareWithServer() - unchanged when actual sizes match and hashes match', t => {
    const local = { 'file.txt': { size: 100, hash: 'h1' } };
    const serverManifest = { 'file.txt': { size: 100, hash: 'h1' } };
    const serverSizes = { 'file.txt': 100 };
    const result = Manifest.compareWithServer(local, serverManifest, serverSizes);
    t.is(result.totalToUpload, 0);
    t.is(result.totalUnchanged, 1);
});

test('Manifest.compareWithServer() - detects hash mismatch when actual sizes match', t => {
    const local = { 'file.txt': { size: 100, hash: 'new' } };
    const serverManifest = { 'file.txt': { size: 100, hash: 'old' } };
    const serverSizes = { 'file.txt': 100 };
    const result = Manifest.compareWithServer(local, serverManifest, serverSizes);
    t.is(result.totalToUpload, 1);
    t.is(result.toUpload[0].reason, 'changed');
});

test('Manifest.compareWithServer() - treats as unchanged when no server manifest entry', t => {
    const local = { 'file.txt': { size: 100, hash: 'h1' } };
    const serverManifest = {};
    const serverSizes = { 'file.txt': 100 };
    const result = Manifest.compareWithServer(local, serverManifest, serverSizes);
    t.is(result.totalToUpload, 0);
    t.is(result.totalUnchanged, 1);
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

test('FTP.deploy() - no server manifest uploads all files', async t => {
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

    // All files + manifest uploaded
    t.is(ftpInstance.stats.uploaded, 3);
    t.true(t.context.mockClient.files.has('index.html'));
    t.true(t.context.mockClient.files.has('style.css'));
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

    // Simulate server having the same manifest AND files present
    t.context.mockClient.files.set(Manifest.getFileName(), {
        content: Buffer.from(JSON.stringify(localManifest)),
    });
    t.context.mockClient.files.set('file1.txt', { content: Buffer.from('content1') });
    t.context.mockClient.files.set('file2.txt', { content: Buffer.from('content2') });

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    // Only manifest.json uploaded (files unchanged and verified)
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
    fs.writeFileSync(path.join(siteDir, 'file2.txt'), 'content2');
    fs.writeFileSync(path.join(siteDir, 'file3.txt'), 'content3');
    fs.writeFileSync(path.join(siteDir, 'file4.txt'), 'content4');
    const localManifest = await Manifest.generate(siteDir);

    // Server has extra file (1 of 5 = 20%, under 30% safety limit)
    const serverManifest = { ...localManifest, 'old.txt': { size: 3, hash: 'orphanhash' } };
    t.context.mockClient.files.set(Manifest.getFileName(), {
        content: Buffer.from(JSON.stringify(serverManifest)),
    });
    t.context.mockClient.files.set('old.txt', { content: Buffer.from('old') });
    t.context.mockClient.files.set('file1.txt', { content: Buffer.from('content1') });
    t.context.mockClient.files.set('file2.txt', { content: Buffer.from('content2') });
    t.context.mockClient.files.set('file3.txt', { content: Buffer.from('content3') });
    t.context.mockClient.files.set('file4.txt', { content: Buffer.from('content4') });

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    t.is(ftpInstance.stats.deleted, 1);
    t.false(t.context.mockClient.files.has('old.txt'));
});

test('FTP.deploy() - safety abort when too many files to delete', async t => {
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

    // Server has 10 files, local has 1 -> 9 would be deleted (90%).
    // Files must exist in the server LIST (mockClient.files) too, since orphan
    // detection and the safety limit are both based on the real listing now.
    const serverManifest = { ...localManifest };
    for (let i = 2; i <= 10; i++) {
        serverManifest[`file${i}.txt`] = { size: 10, hash: `hash${i}` };
        t.context.mockClient.files.set(`file${i}.txt`, { content: Buffer.from(`content${i}`) });
    }
    t.context.mockClient.files.set(Manifest.getFileName(), {
        content: Buffer.from(JSON.stringify(serverManifest)),
    });

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await t.throwsAsync(
        () => ftpInstance.deploy({ progress: false }),
        { message: /Safety abort/ },
    );
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
    t.context.mockClient.files.set('file1.txt', { content: Buffer.from('content1') });

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    // file2.txt + manifest.json
    t.is(ftpInstance.stats.uploaded, 2);
    t.true(t.context.mockClient.files.has('file2.txt'));
});

test('FTP.listServerFiles() - returns file sizes from mock', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    fs.writeFileSync(configPath, `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`);

    const ftpInstance = new FTP(configPath, t.context.testDir);
    ftpInstance.config = ftpInstance.loadConfig();
    ftpInstance.client = t.context.mockClient;

    t.context.mockClient.files.set('a.txt', { content: Buffer.from('aaa') });
    t.context.mockClient.files.set('b.txt', { content: Buffer.from('bbbbb') });

    const result = await ftpInstance.listServerFiles(false);
    t.is(result['a.txt'], 3);
    t.is(result['b.txt'], 5);
    t.is(Object.keys(result).length, 2);
});

test('FTP.deploy() - uploads file missing from server (detected via LIST)', async t => {
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

    // Server has manifest but file2.txt is missing from server files
    t.context.mockClient.files.set(Manifest.getFileName(), {
        content: Buffer.from(JSON.stringify(localManifest)),
    });
    t.context.mockClient.files.set('file1.txt', { content: Buffer.from('content1') });
    // file2.txt intentionally NOT on server

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    // file2.txt should have been uploaded because LIST showed it missing
    t.true(t.context.mockClient.files.has('file2.txt'));
    t.is(ftpInstance.stats.uploaded, 2); // file2.txt + manifest.json
});

test('FTP.deploy() - preserves files from missing source repos', async t => {
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
    const buildDir = t.context.testDir.getBuild();

    // Local manifest has only site content (no ZIP/PDF from missing repos)
    fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(siteDir, 'style.css'), 'body{}');
    const localManifest = await Manifest.generate(siteDir);

    // Build meta: voyahchat-install is missing
    fs.writeFileSync(path.join(buildDir, 'build-assets-meta.json'), JSON.stringify({
        availableRepos: ['voyahchat-content', 'voyahchat-docs'],
        missingRepos: ['voyahchat-install'],
    }));

    // Build stats: file from missing repo
    fs.writeFileSync(path.join(buildDir, 'build-assets.json'), JSON.stringify({
        'app.zip': {
            source: 'external/voyahchat-install/app.zip',
            size: 1000,
            metadata: { url: '/app.zip', type: 'zip' },
        },
    }));

    // Server manifest has the ZIP file from missing repo
    const serverManifest = { ...localManifest, 'app.zip': { size: 1000, hash: 'ziphash' } };
    t.context.mockClient.files.set(Manifest.getFileName(), {
        content: Buffer.from(JSON.stringify(serverManifest)),
    });
    t.context.mockClient.files.set('app.zip', { content: Buffer.from('x'.repeat(1000)) });
    t.context.mockClient.files.set('index.html', { content: Buffer.from('<html></html>') });
    t.context.mockClient.files.set('style.css', { content: Buffer.from('body{}') });

    ftpInstance.client = t.context.mockClient;
    ftpInstance.initClient = async () => {};

    await ftpInstance.deploy({ progress: false });

    t.is(ftpInstance.stats.deleted, 0, 'Should not delete files from missing repos');
    t.true(t.context.mockClient.files.has('app.zip'), 'ZIP file should be preserved on server');
});
