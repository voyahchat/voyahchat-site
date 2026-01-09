#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const yaml = require('js-yaml');
const { Dir } = require('./dir');

/**
 * Fix timestamps on FTP server after manual upload
 *
 * This script reads the local timestamps.json file and updates
 * the timestamps of all files on the FTP server to match the
 * original Git-based timestamps.
 */
class TimestampFixer {
    constructor(configPath = 'config/ftp.yml') {
        this.configPath = configPath;
        this.config = null;
        this.client = null;
        this.stats = {
            fixed: 0,
            failed: 0,
            skipped: 0,
            total: 0,
        };
    }

    /**
     * Load FTP configuration from YAML file or environment variables
     */
    loadConfig() {
        // First try to load from environment variables (for CI)
        const envConfig = this.loadFromEnv();
        if (envConfig) {
            this.config = envConfig;
            return this.config;
        }

        // Fallback to file-based configuration
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
            this.config.passive = true;

            return this.config;
        } catch (err) {
            throw new Error(`Failed to load FTP config: ${err.message}`);
        }
    }

    /**
     * Load FTP configuration from environment variables
     */
    loadFromEnv() {
        const host = process.env.FTP_HOST;
        const user = process.env.FTP_USER;
        const password = process.env.FTP_PASS;
        const remotePath = process.env.FTP_PATH;
        const port = process.env.FTP_PORT;

        // If all required environment variables are present, use them
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
            throw new Error(`Failed to connect to FTP server: ${err.message}`);
        }
    }

    /**
     * Load local timestamps from timestamps.json file
     */
    loadLocalTimestamps() {
        const siteDir = Dir.getSite();
        const timestampsPath = path.join(siteDir, 'timestamps.json');

        if (!fs.existsSync(timestampsPath)) {
            throw new Error(`timestamps.json not found in ${siteDir}. Please run 'npm run build:timestamps' first.`);
        }

        const timestamps = JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));

        // Remove buildTime entry as it's not a file
        const fileTimestamps = { ...timestamps };
        delete fileTimestamps.buildTime;

        return fileTimestamps;
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
                // Create Date object using UTC to avoid timezone conversion issues
                return new Date(Date.UTC(year, month, day, hour, minute, second));
            }
        } catch (err) {
            // File doesn't exist or MDTM not supported
            return null;
        }
        return null;
    }

    /**
     * Set remote file timestamp using MFMT command
     */
    async setRemoteTimestamp(remotePath, timestamp) {
        try {
            // Ensure timestamp is a Date object and convert to UTC format for MFMT
            const date = new Date(timestamp);
            const timestampStr = date.toISOString()
                .replace(/[-:]/g, '')
                .replace(/\..+/, '')
                .replace('T', '');

            const result = await this.client.send(`MFMT ${timestampStr} ${remotePath}`);
            return result.code === 213;
        } catch (err) {
            return false;
        }
    }

    /**
     * Fix timestamp for a single file
     */
    async fixFileTimestamp(remotePath, expectedTimestamp) {
        try {
            // Check if file exists on server
            const currentTimestamp = await this.getRemoteTimestamp(remotePath);

            if (!currentTimestamp) {
                console.warn(`File not found on server: ${remotePath}`);
                this.stats.skipped++;
                return false;
            }

            // Compare timestamps (with 5 second tolerance)
            const timeDiff = Math.abs(currentTimestamp.getTime() - expectedTimestamp);

            if (timeDiff <= 5000) {
                // Timestamp is already correct
                this.stats.skipped++;
                return true;
            }

            // Fix the timestamp
            const success = await this.setRemoteTimestamp(remotePath, expectedTimestamp);

            if (success) {
                console.log(`Fixed: ${remotePath}`);
                console.log(`  From: ${currentTimestamp.toISOString()}`);
                console.log(`  To:   ${new Date(expectedTimestamp).toISOString()}`);
                this.stats.fixed++;
                return true;
            } else {
                console.error(`Failed to set timestamp for: ${remotePath}`);
                this.stats.failed++;
                return false;
            }
        } catch (err) {
            console.error(`Error processing ${remotePath}:`, err.message);
            this.stats.failed++;
            return false;
        }
    }

    /**
     * Fix timestamps for all files
     */
    async fixAllTimestamps() {
        console.log('Loading local timestamps...');
        const localTimestamps = this.loadLocalTimestamps();
        const fileCount = Object.keys(localTimestamps).length;

        console.log(`Found ${fileCount} files to process`);
        console.log('');

        this.stats.total = fileCount;

        // Process files in batches to avoid overwhelming the server
        const entries = Object.entries(localTimestamps);
        let processed = 0;

        for (const [remotePath, timestamp] of entries) {
            processed++;

            // Show progress
            process.stdout.write(`Progress: ${processed}/${fileCount} (${Math.round(processed/fileCount*100)}%)\r`);

            await this.fixFileTimestamp(remotePath, timestamp);

            // Add small delay to avoid overwhelming the server
            if (processed % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Clear progress line
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }

    /**
     * Print summary
     */
    printSummary() {
        console.log('\nTimestamp Fix Summary');
        console.log('====================');
        console.log(`Total files: ${this.stats.total}`);
        console.log(`Fixed: ${this.stats.fixed}`);
        console.log(`Failed: ${this.stats.failed}`);
        console.log(`Skipped (already correct): ${this.stats.skipped}`);

        if (this.stats.failed === 0) {
            console.log('\nAll timestamps fixed successfully!');
        } else {
            console.log(`\nCompleted with ${this.stats.failed} errors`);
        }
    }

    /**
     * Run the timestamp fixing process
     */
    async run() {
        try {
            console.log('Initializing FTP connection...');
            await this.initClient();
            console.log(`Connected to FTP server: ${this.config.host}`);
            console.log(`Remote directory: ${this.config.remote_path}`);
            console.log('');

            await this.fixAllTimestamps();
            this.printSummary();

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

// Run if called directly
if (require.main === module) {
    const fixer = new TimestampFixer();
    fixer.run();
}

module.exports = TimestampFixer;
