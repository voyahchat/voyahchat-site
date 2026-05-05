#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const yaml = require('js-yaml');
const { Dir } = require('../build/dir');

/**
 * Clean old files from FTP server
 */
class ServerCleaner {
    constructor(configPath = 'config/auth-ftp.yml') {
        this.configPath = configPath;
        this.config = null;
        this.client = null;
        this.stats = {
            deleted: 0,
            failed: 0,
            total: 0,
        };
    }

    loadConfig() {
        const envConfig = this.loadFromEnv();
        if (envConfig) {
            this.config = envConfig;
            return this.config;
        }

        try {
            const configFile = fs.readFileSync(this.configPath, 'utf8');
            this.config = yaml.load(configFile);
            this.config.port = this.config.port || 21;
            this.config.secure = this.config.secure || false;
            this.config.passive = true;
            return this.config;
        } catch (err) {
            throw new Error(`Failed to load FTP config: ${err.message}`);
        }
    }

    loadFromEnv() {
        const host = process.env.FTP_HOST;
        const user = process.env.FTP_USER;
        const password = process.env.FTP_PASS;
        const remotePath = process.env.FTP_PATH;
        const port = process.env.FTP_PORT;

        if (host && user && password && remotePath) {
            return {
                host,
                user,
                password,
                remote_path: remotePath,
                port: port ? parseInt(port) : 21,
                secure: false,
                passive: true,
            };
        }
        return null;
    }

    async initClient() {
        if (!this.config) {
            this.loadConfig();
        }

        this.client = new ftp.Client();
        this.client.ftp.verbose = false;

        const clientConfig = {
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            password: this.config.password,
            secure: this.config.secure,
            passive: this.config.passive,
        };

        if (this.config.secure) {
            clientConfig.secureOptions = {
                rejectUnauthorized: false,
                checkServerIdentity: () => undefined,
            };
        }

        await this.client.access(clientConfig);
        await this.client.cd(this.config.remote_path);
    }

    async deleteFile(remotePath) {
        try {
            await this.client.remove(remotePath);
            this.stats.deleted++;
            return true;
        } catch (err) {
            console.error(`  Failed to delete ${remotePath}: ${err.message}`);
            this.stats.failed++;
            return false;
        }
    }

    async deleteDirectory(remoteDir) {
        try {
            await this.client.removeDir(remoteDir);
            this.stats.deleted++;
            return true;
        } catch (err) {
            // Directory might not be empty or doesn't exist
            return false;
        }
    }

    async getFilesToDelete() {
        const siteDir = Dir.getSite();
        const serverTimestampsPath = path.join(siteDir, 'timestamps-server.json');
        const localTimestampsPath = path.join(siteDir, 'timestamps.json');

        if (!fs.existsSync(serverTimestampsPath)) {
            throw new Error('timestamps-server.json not found. Run deploy first to scan the server.');
        }

        if (!fs.existsSync(localTimestampsPath)) {
            throw new Error('timestamps.json not found. Run build first.');
        }

        const serverTimestamps = JSON.parse(fs.readFileSync(serverTimestampsPath, 'utf8'));
        const localTimestamps = JSON.parse(fs.readFileSync(localTimestampsPath, 'utf8'));

        const serverFiles = new Set(Object.keys(serverTimestamps));
        const localFiles = new Set(Object.keys(localTimestamps).filter(k => k !== 'buildTime'));

        return [...serverFiles].filter(f => !localFiles.has(f)).sort();
    }

    async clean() {
        console.log('Loading files to delete...');
        const filesToDelete = await this.getFilesToDelete();

        if (filesToDelete.length === 0) {
            console.log('No old files to delete.');
            return;
        }

        this.stats.total = filesToDelete.length;
        console.log(`Found ${filesToDelete.length} files to delete:\n`);

        // Show preview
        filesToDelete.slice(0, 20).forEach(f => console.log(`  ${f}`));
        if (filesToDelete.length > 20) {
            console.log(`  ... and ${filesToDelete.length - 20} more`);
        }

        console.log('\nDeleting files...');
        let processed = 0;

        for (const file of filesToDelete) {
            processed++;
            const percent = Math.round(processed / filesToDelete.length * 100);
            process.stdout.write(`Progress: ${processed}/${filesToDelete.length} (${percent}%)\r`);
            await this.deleteFile(file);
        }

        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        this.printSummary();
    }

    printSummary() {
        console.log('\nCleanup Summary');
        console.log('===============');
        console.log(`Total: ${this.stats.total}`);
        console.log(`Deleted: ${this.stats.deleted}`);
        console.log(`Failed: ${this.stats.failed}`);

        if (this.stats.failed === 0) {
            console.log('\nAll files deleted successfully!');
        } else {
            console.log(`\nCompleted with ${this.stats.failed} errors`);
        }
    }

    async run() {
        try {
            console.log('Connecting to FTP server...');
            await this.initClient();
            console.log(`Connected to: ${this.config.host}:${this.config.port}`);
            console.log(`Remote directory: ${this.config.remote_path}\n`);

            await this.clean();

        } catch (err) {
            console.error('Error:', err.message);
            process.exit(1);
        } finally {
            if (this.client) {
                this.client.close();
            }
        }
    }
}

if (require.main === module) {
    const cleaner = new ServerCleaner();
    cleaner.run();
}

module.exports = ServerCleaner;
