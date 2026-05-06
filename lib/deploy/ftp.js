const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const yaml = require('js-yaml');
const { Dir } = require('../utils/dir');
const Manifest = require('../utils/manifest');

class FTP {
    constructor(configPath = 'config/auth-ftp.yml', dirInstance = null) {
        this.configPath = configPath;
        this.config = null;
        this.client = null;
        this.dir = dirInstance || Dir;
        this.stats = {
            uploaded: 0,
            deleted: 0,
            errors: 0,
            zipUploaded: 0,
            totalSize: 0,
            startTime: null,
            endTime: null,
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

            const required = ['host', 'user', 'password', 'remote_path'];
            for (const field of required) {
                if (!this.config[field]) {
                    throw new Error(`Missing required field '${field}' in ${this.configPath}`);
                }
            }

            this.config.port = this.config.port || 21;
            this.config.secure = this.config.secure || false;
            this.config.passive = true;
            this.config.progress = this.config.progress !== false;

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
                progress: true,
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

        try {
            await this.client.access(clientConfig);
            await this.client.cd(this.config.remote_path);
        } catch (err) {
            console.warn(`Connection issue: ${err.message}. Retrying...`);
            try {
                this.client.close();
                this.client = new ftp.Client();
                this.client.ftp.verbose = false;
                await this.client.access(clientConfig);
                await this.client.cd(this.config.remote_path);
            } catch (retryErr) {
                throw new Error(`Failed to connect to FTP server: ${retryErr.message}`);
            }
        }
    }

    async uploadFile(localPath, remotePath, progress = true, retryCount = 0) {
        if (!fs.existsSync(localPath)) {
            this.stats.errors++;
            return false;
        }

        const stats = fs.statSync(localPath);
        const fileSize = stats.size;
        const maxRetries = 2;
        const startTime = Date.now();
        let progressInterval = null;

        try {
            if (progress && this.config && this.config.progress !== false) {
                process.stdout.write(`Uploading: ${remotePath}  0s\r`);
                progressInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    process.stdout.write(`Uploading: ${remotePath}  ${elapsed}s\r`);
                }, 1000);
            }

            await this.client.uploadFrom(localPath, remotePath);

            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }

            if (progress && this.config && this.config.progress !== false) {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                process.stdout.write(`Uploading: ${remotePath}  ${elapsed}s (done)\r`);
                process.stdout.write('\n');
            }

            this.stats.uploaded++;
            this.stats.totalSize += fileSize;
            if (remotePath.endsWith('.zip')) {
                this.stats.zipUploaded++;
            }

            return true;
        } catch (err) {
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }

            if (retryCount < maxRetries && (
                err.message.includes('425') ||
                err.message.includes('Connection') ||
                err.message.includes('timeout')
            )) {
                if (progress && this.config && this.config.progress !== false) {
                    process.stdout.write('\r' + ' '.repeat(Math.max(100, remotePath.length + 20)) + '\r');
                }

                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    await this.client.send('NOOP');
                } catch (noopErr) {
                    await this.initClient();
                }

                return await this.uploadFile(localPath, remotePath, progress, retryCount + 1);
            }

            if (progress && this.config && this.config.progress !== false) {
                process.stdout.write('\r' + ' '.repeat(Math.max(100, remotePath.length + 20)) + '\r');
            }

            this.stats.errors++;
            return false;
        }
    }

    getAllFiles(dirPath, basePath = '') {
        const files = [];
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const relativePath = path.join(basePath, item);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                files.push(...this.getAllFiles(fullPath, relativePath));
            } else {
                files.push({
                    local: fullPath,
                    remote: relativePath.replace(/\\/g, '/'),
                });
            }
        }

        return files;
    }

    async deploy(options = {}) {
        if (!this.config) {
            this.loadConfig();
        }

        const { force = false, dryRun = false } = options;
        const progress = options.progress !== undefined ? options.progress : this.config.progress;
        this.stats.startTime = new Date();

        try {
            if (!dryRun) {
                await this.initClient();
                if (progress) {
                    console.log(`Connected to FTP server: ${this.config.host}`);
                }
            } else {
                if (progress) {
                    console.log('DRY RUN: Not connecting to server');
                    if (!this.config) {
                        this.loadConfig();
                    }
                    console.log(`Would connect to: ${this.config.host}:${this.config.port}`);
                    console.log(`Remote directory: ${this.config.remote_path}`);
                }
            }

            const siteDir = this.dir.getSite();
            const localManifest = Manifest.load(siteDir);
            const localFileCount = Object.keys(localManifest).length;

            if (localFileCount === 0) {
                throw new Error('manifest.json is empty or missing. Run build first.');
            }

            // Load server manifest
            let serverManifest = {};
            let isFirstDeploy = false;
            if (!dryRun && !force) {
                try {
                    const serverManifestPath = path.join(siteDir, '_server-manifest.json');
                    await this.client.downloadTo(serverManifestPath, Manifest.getFileName());
                    serverManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf8'));
                    if (progress) {
                        const serverCount = Object.keys(serverManifest).length;
                        console.log(`Server manifest: ${serverCount} files, local: ${localFileCount} files`);
                    }
                } catch (err) {
                    // First deploy with new system: files already on server, just upload manifest
                    isFirstDeploy = true;
                    if (progress) {
                        console.log('No server manifest found. Uploading manifest only (files already on server).');
                    }
                }
            }

            // First deploy: just upload manifest, skip file comparison
            if (isFirstDeploy && !dryRun) {
                const localManifestPath = path.join(siteDir, Manifest.getFileName());
                await this.uploadFile(localManifestPath, Manifest.getFileName(), false);
                this.stats.endTime = new Date();
                if (progress) {
                    console.log('Manifest uploaded. Server is now synced.');
                    this.printSummary(dryRun);
                }
                return;
            }

            // Compare manifests
            let comparison;
            if (force || dryRun) {
                comparison = {
                    toUpload: Object.keys(localManifest).map(p => ({ path: p, reason: 'force' })),
                    toDelete: [],
                    totalToUpload: Object.keys(localManifest).length,
                    totalToDelete: 0,
                    totalUnchanged: 0,
                };
            } else {
                comparison = Manifest.compare(localManifest, serverManifest);
            }

            if (progress) {
                if (comparison.totalToUpload > 0) {
                    console.log(`Files to upload: ${comparison.totalToUpload}`);
                } else {
                    console.log('All files up to date');
                }
                if (comparison.totalToDelete > 0) {
                    console.log(`Files to delete: ${comparison.totalToDelete}`);
                }
            }

            // Build file lookup
            const allFiles = this.getAllFiles(siteDir);
            const fileMap = new Map(allFiles.map(f => [f.remote, f.local]));

            // Upload changed/new files
            for (const item of comparison.toUpload) {
                const localPath = fileMap.get(item.path);
                if (!localPath) {
                    if (progress) {
                        console.error(`Error: File not found: ${item.path}`);
                    }
                    this.stats.errors++;
                    continue;
                }

                const isZip = item.path.endsWith('.zip');
                if (progress && this.config && this.config.progress !== false) {
                    const sizeKB = (fs.statSync(localPath).size / 1024).toFixed(1);
                    if (isZip) {
                        const sizeMB = (fs.statSync(localPath).size / 1024 / 1024).toFixed(1);
                        console.log(`[${item.reason.toUpperCase()}] ${item.path} ${sizeMB}MB`);
                    } else {
                        console.log(`[${item.reason.toUpperCase()}] ${item.path} ${sizeKB}KB`);
                    }
                }

                if (dryRun) {
                    this.stats.uploaded++;
                    this.stats.totalSize += fs.statSync(localPath).size;
                } else {
                    await this.uploadFile(localPath, item.path, progress);
                }
            }

            // Delete orphaned files
            if (!dryRun && comparison.totalToDelete > 0) {
                if (progress) {
                    console.log(`\nDeleting ${comparison.totalToDelete} orphaned files...`);
                    comparison.toDelete.slice(0, 10).forEach(f => console.log(`  ${f}`));
                    if (comparison.toDelete.length > 10) {
                        console.log(`  ... and ${comparison.toDelete.length - 10} more`);
                    }
                }

                for (const filePath of comparison.toDelete) {
                    try {
                        await this.client.remove(filePath);
                        this.stats.deleted++;
                        if (progress) {
                            process.stdout.write(`Deleted: ${filePath}\r`);
                        }
                    } catch (err) {
                        this.stats.errors++;
                        if (progress) {
                            console.error(`  Failed to delete ${filePath}: ${err.message}`);
                        }
                    }
                }

                if (progress) {
                    process.stdout.write('\r' + ' '.repeat(80) + '\r');
                }
            }

            // Upload manifest
            if (!dryRun) {
                const localManifestPath = path.join(siteDir, Manifest.getFileName());
                await this.uploadFile(localManifestPath, Manifest.getFileName(), false);
                if (progress && this.stats.uploaded > 0) {
                    console.log('Manifest uploaded');
                }
            }

            if (progress) {
                process.stdout.write('\r' + ' '.repeat(100) + '\r');
            }

            this.stats.endTime = new Date();
            if (progress) {
                this.printSummary(dryRun);
            }

        } catch (err) {
            this.stats.errors++;
            throw err;
        } finally {
            if (this.client && !dryRun) {
                this.client.close();
            }
        }
    }

    printSummary(dryRun = false) {
        const duration = this.stats.endTime - this.stats.startTime;
        const sizeMB = (this.stats.totalSize / 1024 / 1024).toFixed(2);
        const speed = duration > 0 ? (this.stats.totalSize / 1024 / duration).toFixed(2) : 0;

        console.log('\nDeployment Summary');
        console.log('==================');
        console.log(`Uploaded: ${this.stats.uploaded} files`);
        if (this.stats.deleted > 0) {
            console.log(`Deleted: ${this.stats.deleted} files`);
        }
        if (this.stats.zipUploaded > 0) {
            console.log(`  (ZIP files: ${this.stats.zipUploaded})`);
        }
        if (this.stats.errors > 0) {
            console.log(`Errors: ${this.stats.errors} files`);
        }
        console.log(`Total size: ${sizeMB} MB`);
        console.log(`Duration: ${(duration / 1000).toFixed(2)} seconds`);
        if (this.stats.uploaded > 0) {
            console.log(`Speed: ${speed} KB/s`);
        }

        if (dryRun) {
            console.log('\nDRY RUN - No files were actually uploaded');
        }
    }
}

module.exports = FTP;
