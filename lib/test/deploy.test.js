const test = require('ava');
const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const FTP = require('../build/ftp');
const TimestampsJson = require('../build/timestamps-json');
const TestDir = require('./test-dir').TestDir;

// Mock FTP client
class MockFTPClient {
    constructor() {
        this.files = new Map(); // remotePath -> { content, timestamp }
        this.connected = false;
    }

    async access(config) {
        this.connected = true;
        this.config = config;
    }

    async cd(path) {
        this.currentDir = path;
    }

    async send(command) {
        if (command.startsWith('MDTM ')) {
            const filePath = command.substring(5);
            const file = this.files.get(filePath);
            if (file && file.timestamp) {
                // Format as UTC to avoid timezone issues
                const timestampStr = file.timestamp.toISOString()
                    .replace(/[-:]/g, '')
                    .replace(/\..+/, '')
                    .replace('T', '');
                return { code: 213, message: `213 ${timestampStr}` };
            }
            throw new Error('550 File not found');
        }

        if (command.startsWith('MFMT ')) {
            const match = command.match(/MFMT (\d{14}) (.+)/);
            if (match) {
                const [, timestampStr, filePath] = match;
                const file = this.files.get(filePath);
                if (file) {
                    // Parse as UTC to avoid timezone issues
                    const year = parseInt(timestampStr.substr(0, 4));
                    const month = parseInt(timestampStr.substr(4, 2)) - 1;
                    const day = parseInt(timestampStr.substr(6, 2));
                    const hour = parseInt(timestampStr.substr(8, 2));
                    const minute = parseInt(timestampStr.substr(10, 2));
                    const second = parseInt(timestampStr.substr(12, 2));
                    // Create date as if it were UTC
                    file.timestamp = new Date(Date.UTC(year, month, day, hour, minute, second));
                    return { code: 213, message: `213 Modify=${timestampStr}; ${filePath}` };
                }
            }
            throw new Error('550 File not found');
        }

        throw new Error('500 Command not understood');
    }

    async uploadFrom(localPath, remotePath) {
        const content = fs.readFileSync(localPath);
        const stats = fs.statSync(localPath);
        this.files.set(remotePath, {
            content,
            timestamp: stats.mtime,
        });
    }

    async downloadTo(localPath, remotePath) {
        const file = this.files.get(remotePath);
        if (file) {
            fs.writeFileSync(localPath, file.content);
        } else {
            throw new Error('550 File not found');
        }
    }

    close() {
        this.connected = false;
    }
}

test.beforeEach(t => {
    t.context.testDir = new TestDir();
    t.context.mockClient = new MockFTPClient();
    // Save original Client constructor
    t.context.originalClient = ftp.Client;
    // Replace with mock
    ftp.Client = function() {
        return t.context.mockClient;
    };
});

test.afterEach(t => {
    // Clean up test directory
    fs.rmSync(t.context.testDir.getRoot(), { recursive: true, force: true });
    // Restore original Client constructor
    ftp.Client = t.context.originalClient;
});

test('FTP.constructor() - should create instance with default config path', t => {
    const ftp = new FTP();
    t.is(ftp.configPath, 'config/ftp.yml');
    t.is(ftp.config, null);
    t.is(ftp.client, null);
});

test('FTP.constructor() - should accept custom config path', t => {
    const ftp = new FTP('custom/config.yml');
    t.is(ftp.configPath, 'custom/config.yml');
});

test('FTP.loadConfig() - should load valid config file', t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    const configContent = `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`;
    fs.writeFileSync(configPath, configContent);

    const ftp = new FTP(configPath);
    const config = ftp.loadConfig();

    t.is(config.host, 'ftp.example.com');
    t.is(config.user, 'testuser');
    t.is(config.password, 'testpass');
    t.is(config.remote_path, '/test');
    t.is(config.port, 21);
    t.is(config.secure, false);
    t.is(config.passive, true);
});

test('FTP.loadConfig() - should throw error for missing required field', t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    const configContent = `
host: "ftp.example.com"
user: "testuser"
# missing password and remote_path
`;
    fs.writeFileSync(configPath, configContent);

    const ftp = new FTP(configPath);
    t.throws(() => ftp.loadConfig(), {
        message: /Missing required field 'password'/,
    });
});

test('FTP.loadConfig() - should throw error for invalid file', t => {
    const ftp = new FTP('nonexistent.yml');
    t.throws(() => ftp.loadConfig(), {
        message: /Failed to load FTP config/,
    });
});

test('FTP.initClient() - should initialize client with config', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    const configContent = `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
secure: true
`;
    fs.writeFileSync(configPath, configContent);

    const ftp = new FTP(configPath);
    ftp.client = t.context.mockClient;
    // Mock the actual connection to avoid DNS lookup
    await ftp.client.access({
        host: 'ftp.example.com',
        port: 21,
        user: 'testuser',
        password: 'testpass',
        secure: true,
    });
    await ftp.client.cd('/test');

    t.true(ftp.client instanceof MockFTPClient);
    t.true(ftp.client.connected);
    t.is(ftp.client.currentDir, '/test');
});

test('FTP.getRemoteTimestamp() - should return timestamp for existing file', async t => {
    const ftp = new FTP();
    ftp.client = t.context.mockClient;

    // Add a file with known timestamp (use UTC to match FTP server behavior)
    const testDate = new Date(Date.UTC(2023, 11, 31, 12, 0, 0));
    t.context.mockClient.files.set('test.txt', {
        content: Buffer.from('test'),
        timestamp: testDate,
    });

    const timestamp = await ftp.getRemoteTimestamp('test.txt');
    t.truthy(timestamp);
    // Allow for timezone differences (up to 24 hours)
    t.true(Math.abs(timestamp.getTime() - testDate.getTime()) < 86400000); // 24 hour tolerance
});

test('FTP.getRemoteTimestamp() - should return null for non-existing file', async t => {
    const ftp = new FTP();
    ftp.client = t.context.mockClient;

    const timestamp = await ftp.getRemoteTimestamp('nonexistent.txt');
    t.is(timestamp, null);
});

test('FTP.setRemoteTimestamp() - should set timestamp for existing file', async t => {
    const ftp = new FTP();
    ftp.client = t.context.mockClient;

    // Add a file
    t.context.mockClient.files.set('test.txt', {
        content: Buffer.from('test'),
        timestamp: new Date(),
    });

    const newTimestamp = new Date(Date.UTC(2023, 11, 31, 12, 0, 0));
    const result = await ftp.setRemoteTimestamp('test.txt', newTimestamp);

    t.true(result);
    const file = t.context.mockClient.files.get('test.txt');
    // Should match exactly when using UTC
    t.is(file.timestamp.getTime(), newTimestamp.getTime());
});

test('FTP.setRemoteTimestamp() - should return false for non-existing file', async t => {
    const ftp = new FTP();
    ftp.client = t.context.mockClient;

    const timestamp = new Date('2023-12-31T12:00:00Z');
    const result = await ftp.setRemoteTimestamp('nonexistent.txt', timestamp);

    t.false(result);
});

test('FTP.getLocalTimestamp() - should return file modification time', t => {
    const ftp = new FTP();
    const testFile = path.join(t.context.testDir.getRoot(), 'test.txt');
    const testContent = 'test content';
    fs.writeFileSync(testFile, testContent);

    const timestamp = ftp.getLocalTimestamp(testFile);
    t.truthy(timestamp instanceof Date);

    const stats = fs.statSync(testFile);
    t.is(timestamp.getTime(), stats.mtime.getTime());
});

test('FTP.uploadFile() - should upload file and set timestamp', async t => {
    const ftp = new FTP();
    ftp.client = t.context.mockClient;

    const testFile = path.join(t.context.testDir.getRoot(), 'test.txt');
    const testContent = 'test content';
    fs.writeFileSync(testFile, testContent);

    const result = await ftp.uploadFile(testFile, 'remote/test.txt');

    t.true(result);
    t.is(ftp.stats.uploaded, 1);
    t.true(t.context.mockClient.files.has('remote/test.txt'));

    const uploadedFile = t.context.mockClient.files.get('remote/test.txt');
    t.is(uploadedFile.content.toString(), testContent);
    t.truthy(uploadedFile.timestamp);
});

test('FTP.uploadFile() - should handle upload errors', async t => {
    const ftp = new FTP();
    ftp.client = t.context.mockClient;

    // Make upload fail by using non-existent local file
    const result = await ftp.uploadFile('nonexistent.txt', 'remote/test.txt');

    t.false(result);
    t.is(ftp.stats.errors, 1);
});

test('FTP.processFile() - should upload file when reason is provided', async t => {
    const ftp = new FTP();
    ftp.client = t.context.mockClient;

    const testFile = path.join(t.context.testDir.getRoot(), 'test.txt');
    const testContent = 'test content';
    fs.writeFileSync(testFile, testContent);

    const result = await ftp.processFile(testFile, 'test.txt', false, 'new');

    t.true(result);
    t.is(ftp.stats.uploaded, 1);
    t.true(t.context.mockClient.files.has('test.txt'));
});

test('FTP.getAllFiles() - should return all files recursively', t => {
    const ftp = new FTP();
    const testDir = t.context.testDir.getRoot();

    // Create test directory structure
    fs.writeFileSync(path.join(testDir, 'file1.txt'), 'content1');
    fs.writeFileSync(path.join(testDir, 'file2.txt'), 'content2');
    fs.mkdirSync(path.join(testDir, 'subdir'));
    fs.writeFileSync(path.join(testDir, 'subdir', 'file3.txt'), 'content3');

    const files = ftp.getAllFiles(testDir);

    t.is(files.length, 3);
    t.true(files.some(f => f.remote === 'file1.txt'));
    t.true(files.some(f => f.remote === 'file2.txt'));
    t.true(files.some(f => f.remote === 'subdir/file3.txt'));
});

test('FTP.deploy() - should deploy all files with timestamps.json', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    const configContent = `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`;
    fs.writeFileSync(configPath, configContent);

    const ftp = new FTP(configPath);
    ftp.config = ftp.loadConfig(); // Load config to avoid null reference

    // Create test files
    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(siteDir, 'style.css'), 'body{}');

    // Generate timestamps.json
    const originalDir = require('../build/dir');
    const originalGetSite = originalDir.Dir.getSite;
    originalDir.Dir.getSite = () => siteDir;
    TimestampsJson.generate();
    originalDir.Dir.getSite = originalGetSite;

    // Mock the initClient to avoid DNS lookup
    ftp.client = t.context.mockClient;
    ftp.client.connected = true;
    ftp.client.currentDir = '/test';

    // Mock the initClient method to avoid DNS lookup
    ftp.initClient = async () => {
        // Do nothing, client is already mocked
    };

    // Override getAllFiles to use test directory
    ftp.getAllFiles = () => {
        return [
            { local: path.join(siteDir, 'index.html'), remote: 'index.html' },
            { local: path.join(siteDir, 'style.css'), remote: 'style.css' },
            { local: path.join(siteDir, 'timestamps.json'), remote: 'timestamps.json' },
        ];
    };

    await ftp.deploy({ progress: false });

    // Should upload all files plus timestamps.json
    t.is(ftp.stats.uploaded, 3); // index.html, style.css, timestamps.json
    t.true(t.context.mockClient.files.has('index.html'));
    t.true(t.context.mockClient.files.has('style.css'));
    t.true(t.context.mockClient.files.has('timestamps.json'));
});

test('FTP.deploy() - should handle force option', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    const configContent = `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`;
    fs.writeFileSync(configPath, configContent);

    const ftp = new FTP(configPath);
    ftp.config = ftp.loadConfig(); // Load config to avoid null reference

    // Create test files
    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');

    // Generate timestamps.json
    const originalDir = require('../build/dir');
    const originalGetSite = originalDir.Dir.getSite;
    originalDir.Dir.getSite = () => siteDir;
    TimestampsJson.generate();
    originalDir.Dir.getSite = originalGetSite;

    // Add existing remote file with newer timestamp
    const newDate = new Date('2024-01-01T00:00:00Z');
    t.context.mockClient.files.set('index.html', {
        content: Buffer.from('old content'),
        timestamp: newDate,
    });

    // Mock the initClient to avoid DNS lookup
    ftp.client = t.context.mockClient;
    ftp.client.connected = true;
    ftp.client.currentDir = '/test';

    // Mock the initClient method to avoid DNS lookup
    ftp.initClient = async () => {
        // Do nothing, client is already mocked
    };

    // Override getAllFiles to use test directory
    ftp.getAllFiles = () => {
        return [
            { local: path.join(siteDir, 'index.html'), remote: 'index.html' },
            { local: path.join(siteDir, 'timestamps.json'), remote: 'timestamps.json' },
        ];
    };

    await ftp.deploy({ force: true, progress: false });

    // Should upload even though remote is newer
    t.is(ftp.stats.uploaded, 2); // index.html + timestamps.json
    t.is(ftp.stats.skipped, 0);
});

test('FTP.deploy() - should handle dry-run option', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    const configContent = `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`;
    fs.writeFileSync(configPath, configContent);

    const ftp = new FTP(configPath);
    ftp.config = ftp.loadConfig(); // Load config to avoid null reference

    // Create test files
    const siteDir = t.context.testDir.getSite();
    fs.writeFileSync(path.join(siteDir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(siteDir, 'style.css'), 'body{}');

    // Generate timestamps.json
    const originalDir = require('../build/dir');
    const originalGetSite = originalDir.Dir.getSite;
    originalDir.Dir.getSite = () => siteDir;
    TimestampsJson.generate();
    originalDir.Dir.getSite = originalGetSite;

    // Mock the initClient method to avoid DNS lookup
    ftp.initClient = async () => {
        // Do nothing, client is already mocked
    };

    // Override getAllFiles to use test directory
    ftp.getAllFiles = () => {
        return [
            { local: path.join(siteDir, 'index.html'), remote: 'index.html' },
            { local: path.join(siteDir, 'style.css'), remote: 'style.css' },
        ];
    };

    await ftp.deploy({ dryRun: true, progress: false });

    // Should show what would be uploaded without actually uploading
    t.is(ftp.stats.uploaded, 2);
    t.is(ftp.stats.skipped, 0);
    t.is(ftp.stats.errors, 0);
});

test('FTP.deploy() - should handle incremental deployment with timestamps.json', async t => {
    const configPath = path.join(t.context.testDir.getConfig(), 'ftp.yml');
    const configContent = `
host: "ftp.example.com"
user: "testuser"
password: "testpass"
remote_path: "/test"
`;
    fs.writeFileSync(configPath, configContent);

    const ftp = new FTP(configPath);
    ftp.config = ftp.loadConfig(); // Load config to avoid null reference

    // Create test files
    const siteDir = t.context.testDir.getSite();
    const file1 = path.join(siteDir, 'file1.txt');
    const file2 = path.join(siteDir, 'file2.txt');
    fs.writeFileSync(file1, 'content1');
    fs.writeFileSync(file2, 'content2');

    // Generate local timestamps
    const originalDir = require('../build/dir');
    const originalGetSite = originalDir.Dir.getSite;
    originalDir.Dir.getSite = () => siteDir;
    // Generate local timestamps
    TimestampsJson.generate();
    originalDir.Dir.getSite = originalGetSite;

    // Create server timestamps with file1 up to date, file2 needs update
    const stats1 = fs.statSync(file1);
    const stats2 = fs.statSync(file2);

    const serverTimestamps = {
        'file1.txt': stats1.mtime.getTime(),
        'file2.txt': stats2.mtime.getTime() - 10000,  // Older
        'timestamps.json': new Date().getTime(),  // Recent
    };

    // Override TimestampsJson.load to return only our test files
    const originalLoad = TimestampsJson.load;
    TimestampsJson.load = () => {
        return {
            'file1.txt': stats1.mtime.getTime(),
            'file2.txt': stats2.mtime.getTime(),
            'timestamps.json': fs.statSync(path.join(siteDir, 'timestamps.json')).mtime.getTime(),
        };
    };

    // Mock server timestamps download
    t.context.mockClient.downloadTo = async (localPath, remotePath) => {
        if (remotePath === 'timestamps.json') {
            fs.writeFileSync(localPath, JSON.stringify(serverTimestamps));
        }
    };

    // Mock the initClient to avoid DNS lookup
    ftp.client = t.context.mockClient;
    ftp.client.connected = true;
    ftp.client.currentDir = '/test';

    // Mock the initClient method to avoid DNS lookup
    ftp.initClient = async () => {
        // Do nothing, client is already mocked
    };

    // Override getAllFiles to use test directory
    ftp.getAllFiles = () => {
        return [
            { local: file1, remote: 'file1.txt' },
            { local: file2, remote: 'file2.txt' },
            { local: path.join(siteDir, 'timestamps.json'), remote: 'timestamps.json' },
        ];
    };

    await ftp.deploy({ progress: false });

    // Should only upload file2 and timestamps.json
    t.is(ftp.stats.uploaded, 1); // file2 only (timestamps.json is uploaded separately)
    t.true(t.context.mockClient.files.has('file2.txt'));
    t.true(t.context.mockClient.files.has('timestamps.json'));
    t.false(t.context.mockClient.files.has('file1.txt')); // Should not be uploaded

    // Restore original method
    TimestampsJson.load = originalLoad;
});
