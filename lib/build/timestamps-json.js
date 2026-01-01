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
     */
    static compareTimestamps(localTimestamps, remoteTimestamps) {
        const filesToUpload = [];
        const timeDiffTolerance = 5000; // 5 seconds tolerance for timezone issues

        for (const [filePath, localTimestamp] of Object.entries(localTimestamps)) {
            const remoteTimestamp = remoteTimestamps[filePath];

            // If file doesn't exist remotely or is older, mark for upload
            if (!remoteTimestamp) {
                filesToUpload.push({
                    path: filePath,
                    reason: 'new',
                });
            } else {
                const timeDiff = Math.abs(localTimestamp - remoteTimestamp);
                if (localTimestamp > remoteTimestamp && timeDiff > timeDiffTolerance) {
                    filesToUpload.push({
                        path: filePath,
                        reason: 'updated',
                    });
                }
            }
        }

        return filesToUpload;
    }
}

module.exports = TimestampsJson;
