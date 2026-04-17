const fs = require('fs');
const path = require('path');
const { Dir } = require('./dir');
const { TimestampsBuilder } = require('./build-timestamps');

/**
 * Timestamps JSON utilities for deployment optimization
 */
class TimestampsJson {
    /**
     * Generate timestamps.json file with all file timestamps from site directory
     */
    static generate() {
        const builder = new TimestampsBuilder();
        return builder.generate();
    }

    /**
     * Load timestamps.json from site directory
     */
    static load() {
        const siteDir = Dir.getSite();
        const timestampsPath = path.join(siteDir, 'timestamps.json');

        if (fs.existsSync(timestampsPath)) {
            return JSON.parse(fs.readFileSync(timestampsPath, 'utf8'));
        }

        return {};
    }

    /**
     * Compare local and remote timestamps to determine which files need upload
     *
     * Returns an array with file info objects by default (for backwards compatibility).
     * If options.detailed is true, returns an object with {filesToUpload, skipped, totalToUpload, totalSkipped}.
     */
    static compareTimestamps(localTimestamps, remoteTimestamps, options = {}) {
        const filesToUpload = [];
        const skipped = [];
        const timeDiffTolerance = 5000; // 5 seconds tolerance for timezone issues
        const { verbose = false, detailed = false } = options;

        for (const [filePath, localTimestamp] of Object.entries(localTimestamps)) {
            // Skip metadata fields (not actual files)
            if (filePath === 'buildTime') {
                continue;
            }

            const remoteTimestamp = remoteTimestamps[filePath];

            // If file doesn't exist remotely or is older, mark for upload
            if (!remoteTimestamp) {
                filesToUpload.push({
                    path: filePath,
                    reason: 'new',
                    localTimestamp,
                });
            } else {
                const timeDiff = Math.abs(localTimestamp - remoteTimestamp);
                if (localTimestamp > remoteTimestamp && timeDiff > timeDiffTolerance) {
                    filesToUpload.push({
                        path: filePath,
                        reason: 'updated',
                        localTimestamp,
                    });
                    if (verbose) {
                        const localDate = new Date(localTimestamp).toISOString();
                        const serverDate = new Date(remoteTimestamp).toISOString();
                        console.log(`  [UPDATED] ${filePath}: local ${localDate} vs server ${serverDate}`);
                    }
                } else {
                    skipped.push(filePath);
                    if (verbose && filePath.endsWith('.zip')) {
                        console.log(`  [SKIPPED] ${filePath}: timestamps match (diff: ${timeDiff}ms)`);
                    }
                }
            }
        }

        // Return detailed object if requested, otherwise just the array (backwards compatibility)
        if (detailed) {
            return { filesToUpload, skipped, totalToUpload: filesToUpload.length, totalSkipped: skipped.length };
        }
        return filesToUpload;
    }
}

module.exports = TimestampsJson;
