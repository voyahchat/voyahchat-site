const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const yaml = require('js-yaml');
const { Dir } = require('./dir');
const TimestampsJson = require('./timestamps-json');

/**
 * FTP Deployment with Timestamp Preservation
 *
 * Deploys files from site/ directory to FTP server while preserving
 * Git-based timestamps using MFMT/MDTM commands.
 */
class FTP {
    constructor(configPath = 'config/ftp.yml') {
        this.configPath = configPath;
        this.config = null;
        this.client = null;
        this.stats = {
            uploaded: 0,
            skipped: 0,
            errors: 0,
            totalSize: 0,
            startTime: null,
            endTime: null,
        };
        this.timestampsFile = 'timestamps.json';
        this.timestampsServerFile = 'timestamps-server.json';
    }

    /**
     * Load FTP configuration from YAML file
     */
    loadConfig() {
        try {
            const configFile = fs.readFileSync(this.configPath, 'utf8');
            this.config = yaml.load(configFile);

            // Validate required fields
            const required = ['host', 'user', 'password', 'remote_path'];
            for (const field of required) {
                if (!this.config[field]) {
                    throw new Error(`Missing required field '${field}' in ${this.configPath}`);
                }
            }

            // Set defaults
            this.config.port = this.config.port || 21;
            this.config.secure = this.config.secure || false;
            // Always use passive mode as it's the standard and works better with firewalls/NAT
            this.config.passive = true;
            this.config.progress = this.config.progress !== false;

            return this.config;
        } catch (err) {
            throw new Error(`Failed to load FTP config: ${err.message}`);
        }
    }

    /**
     * Initialize FTP client with configuration
     */
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

        // Add secure options for FTPS
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
            // Try to reconnect once if connection fails
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

    /**
     * Get remote file timestamp using MDTM command
     */
    async getRemoteTimestamp(remotePath) {
        try {
            const result = await this.client.send(`MDTM ${remotePath}`);
            // Parse timestamp from response: "213 20231231120000"
            const match = result.message.match(/213\s+(\d{14})/);
            if (match) {
                const timestampStr = match[1];
                const year = parseInt(timestampStr.substr(0, 4));
                const month = parseInt(timestampStr.substr(4, 2)) - 1;
                const day = parseInt(timestampStr.substr(6, 2));
                const hour = parseInt(timestampStr.substr(8, 2));
                const minute = parseInt(timestampStr.substr(10, 2));
                const second = parseInt(timestampStr.substr(12, 2));
                return new Date(year, month, day, hour, minute, second);
            }
        } catch (err) {
            // File doesn't exist or MDTM not supported
            return null;
        }
        return null;
    }

    /**
     * Download server timestamps file to site directory
     */
    async downloadServerTimestamps() {
        try {
            const siteDir = Dir.getSite();
            const serverTimestampsPath = path.join(siteDir, this.timestampsServerFile);
            await this.client.downloadTo(serverTimestampsPath, this.timestampsFile);
            return JSON.parse(fs.readFileSync(serverTimestampsPath, 'utf8'));
        } catch (err) {
            // File doesn't exist or other error
            return {};
        }
    }

    /**
     * Upload local timestamps file to server
     */
    async uploadLocalTimestamps() {
        try {
            const siteDir = Dir.getSite();
            const localTimestampsPath = path.join(siteDir, this.timestampsFile);
            await this.client.uploadFrom(localTimestampsPath, this.timestampsFile);
            return true;
        } catch (err) {
            console.error('Failed to upload timestamps file:', err.message);
            return false;
        }
    }

    /**
     * Set remote file timestamp using MFMT command
     */
    async setRemoteTimestamp(remotePath, timestamp) {
        try {
            const timestampStr = timestamp.toISOString()
                .replace(/[-:]/g, '')
                .replace(/\..+/, '')
                .replace('T', '');

            const result = await this.client.send(`MFMT ${timestampStr} ${remotePath}`);
            return result.code === 213;
        } catch (err) {
            // Don't output error messages during normal operation
            return false;
        }
    }

    /**
     * Get local file timestamp from filesystem
     */
    getLocalTimestamp(localPath) {
        const stats = fs.statSync(localPath);
        return stats.mtime;
    }

    /**
     * Upload a single file with timestamp preservation
     */
    async uploadFile(localPath, remotePath, progress = true, retryCount = 0) {
        // Check if file exists before proceeding
        if (!fs.existsSync(localPath)) {
            this.stats.errors++;
            return false;
        }

        const stats = fs.statSync(localPath);
        const fileSize = stats.size;
        let progressDisplayed = false;
        let progressInterval = null;
        const maxRetries = 2;
        const startTime = Date.now();

        try {
            // Only show progress if explicitly enabled
            if (progress && this.config && this.config.progress !== false) {
                process.stdout.write(`Uploading: ${remotePath}  0s\r`);
                progressDisplayed = true;

                // Show elapsed time
                progressInterval = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    process.stdout.write(`Uploading: ${remotePath}  ${elapsed}s\r`);
                }, 1000); // Update every second
            }

            // Upload file using the standard method
            await this.client.uploadFrom(localPath, remotePath);

            // Clear the interval
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }

            if (progress && this.config && this.config.progress !== false) {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                process.stdout.write(`Uploading: ${remotePath}  ${elapsed}s (done)\r`);
                process.stdout.write('\n');
            }

            // Set timestamp to match local file
            const localTimestamp = this.getLocalTimestamp(localPath);
            const timestampSet = await this.setRemoteTimestamp(remotePath, localTimestamp);

            if (!timestampSet && progress && this.config && this.config.progress !== false) {
                console.warn(`Warning: Could not set timestamp for ${remotePath}`);
            }

            this.stats.uploaded++;
            this.stats.totalSize += fileSize;

            return true;
        } catch (err) {
            // Clear the interval if it's still running
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }

            // Retry logic for connection issues
            if (retryCount < maxRetries && (
                err.message.includes('425') ||
                err.message.includes('Connection') ||
                err.message.includes('timeout')
            )) {
                if (progress && progressDisplayed && this.config && this.config.progress !== false) {
                    // Clear the progress line
                    process.stdout.write('\r' + ' '.repeat(Math.max(100, remotePath.length + 20)) + '\r');
                }

                // Don't output warning messages during normal operation

                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Try to reconnect if needed
                try {
                    await this.client.send('NOOP');
                } catch (noopErr) {
                    // Connection is dead, try to reconnect
                    // Don't output warning messages during normal operation
                    await this.initClient();
                }

                // Retry the upload
                return await this.uploadFile(localPath, remotePath, progress, retryCount + 1);
            }

            if (progress && progressDisplayed && this.config && this.config.progress !== false) {
                // Clear the progress line
                process.stdout.write('\r' + ' '.repeat(Math.max(100, remotePath.length + 20)) + '\r');
            }
            // Don't output error messages during normal operation
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Process a single file (upload if needed based on timestamps comparison)
     */
    async processFile(localPath, remotePath, progress = true, reason = '') {
        if (progress && this.config && this.config.progress !== false) {
            if (reason === 'new') {
                console.log(`Uploading: ${remotePath} (new file)`);
            } else if (reason === 'updated') {
                console.log(`Uploading: ${remotePath} (updated)`);
            } else {
                console.log(`Uploading: ${remotePath}`);
            }
        }
        return await this.uploadFile(localPath, remotePath, progress);
    }

    /**
     * Process a single file in dry-run mode (compare timestamps without uploading)
     */
    async processFileDryRun(localPath, remotePath, _force = false, progress = true) {

        if (progress && this.config && this.config.progress !== false) {
            console.log(`[DRY RUN] Would upload: ${remotePath}`);
        }

        this.stats.uploaded++;
        const stats = fs.statSync(localPath);
        this.stats.totalSize += stats.size;
        return true;
    }

    /**
     * Get all files from directory recursively
     */
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
                    remote: relativePath.replace(/\\/g, '/'), // Convert to Unix path
                });
            }
        }

        return files;
    }

    /**
     * Deploy files to FTP server
     */
    async deploy(options = {}) {
        // Load config if not already loaded
        if (!this.config) {
            this.loadConfig();
        }

        // Merge options with config, command line takes precedence
        const { force = false, dryRun = false } = options;
        const progress = options.progress !== undefined ? options.progress : this.config.progress;

        this.stats.startTime = new Date();

        try {
            if (!dryRun) {
                // Initialize connection
                await this.initClient();
                if (progress) {
                    console.log(`Connected to FTP server: ${this.config.host}`);
                }
            } else {
                if (progress) {
                    console.log('DRY RUN: Not connecting to server');
                    // Load config to show server info
                    if (!this.config) {
                        this.loadConfig();
                    }
                    console.log(`Would connect to: ${this.config.host}:${this.config.port}`);
                    console.log(`Remote directory: ${this.config.remote_path}`);
                }
            }

            // Get all files from site directory
            const siteDir = Dir.getSite();
            const files = this.getAllFiles(siteDir);

            if (progress) {
                console.log(`Found ${files.length} files to process`);
            }

            // Generate or load local timestamps
            let localTimestamps;
            if (!fs.existsSync(path.join(siteDir, this.timestampsFile))) {
                if (progress) {
                    console.log('Generating local timestamps file...');
                }
                localTimestamps = TimestampsJson.generate();
            } else {
                localTimestamps = TimestampsJson.load();
            }

            // Get files to upload based on timestamps comparison
            let filesToUpload = [];
            if (!dryRun && !force) {
                if (progress) {
                    console.log('Downloading server timestamps file...');
                }
                const serverTimestamps = await this.downloadServerTimestamps();

                if (Object.keys(serverTimestamps).length === 0) {
                    if (progress) {
                        console.log('No server timestamps file found, uploading all files...');
                    }
                    filesToUpload = files.map(file => ({
                        ...file,
                        reason: 'new',
                    }));
                } else {
                    if (progress) {
                        console.log('Comparing timestamps...');
                    }
                    const filesToUploadInfo = TimestampsJson.compareTimestamps(localTimestamps, serverTimestamps);

                    // Convert to file objects with reason
                    filesToUpload = filesToUploadInfo.map(info => {
                        const file = files.find(f => f.remote === info.path);
                        return {
                            ...file,
                            reason: info.reason,
                        };
                    });

                    if (progress) {
                        console.log(`${filesToUpload.length} files need to be uploaded`);
                    }
                }
            } else {
                // Force mode or dry run - upload all files
                filesToUpload = files.map(file => ({
                    ...file,
                    reason: 'force',
                }));
            }

            // Process files sequentially
            if (progress) {
                console.log('\nProcessing files...');
            }

            for (const file of filesToUpload) {
                if (dryRun) {
                    await this.processFileDryRun(file.local, file.remote, force, progress);
                } else {
                    await this.processFile(file.local, file.remote, progress, file.reason);
                }
            }

            // Upload updated timestamps file
            if (!dryRun && this.stats.uploaded > 0) {
                if (progress) {
                    console.log('Uploading updated timestamps file...');
                }
                await this.uploadLocalTimestamps();
            }

            // Clear the progress line at the end
            if (progress) {
                process.stdout.write('\r' + ' '.repeat(100) + '\r');
            }

            this.stats.endTime = new Date();
            if (progress) {
                this.printSummary(dryRun);
            }

        } catch (err) {
            // Don't output error messages during normal operation
            this.stats.errors++;
            throw err;
        } finally {
            if (this.client && !dryRun) {
                this.client.close();
            }
        }
    }

    /**
     * Print deployment summary
     */
    printSummary(dryRun = false) {
        const duration = this.stats.endTime - this.stats.startTime;
        const sizeMB = (this.stats.totalSize / 1024 / 1024).toFixed(2);

        console.log('\nDeployment Summary');
        console.log('==================');
        console.log(`Uploaded: ${this.stats.uploaded} files`);
        console.log(`Skipped: ${this.stats.skipped} files`);
        console.log(`Errors: ${this.stats.errors} files`);
        console.log(`Total size: ${sizeMB} MB`);
        console.log(`Duration: ${(duration / 1000).toFixed(2)} seconds`);

        if (dryRun) {
            console.log('\nDRY RUN - No files were actually uploaded');
        } else if (this.stats.errors === 0) {
            console.log('\nDeployment completed successfully!');
        } else {
            console.log('\nDeployment completed with errors');
        }
    }
}

module.exports = FTP;
