const fs = require('fs');
const path = require('path');
const { Dir } = require('../utils/dir');
const TimestampsJson = require('../utils/timestamps-json');

/**
 * Generate timestamps.json file for deployment optimization
 */
class TimestampsBuilder {
    constructor(dir = Dir) {
        this.dir = dir;
    }

    /**
     * Generate timestamps.json with all file timestamps from site directory
     * All files in site/ already have correct timestamps set during build process
     */
    generate() {
        const siteDir = this.dir.getSite();
        const timestamps = {};

        // Add build time as Unix timestamp (seconds since epoch)
        timestamps.buildTime = Math.floor(Date.now() / 1000);

        // Recursively get all files and their timestamps
        const getAllFiles = (dirPath, basePath = '') => {
            const items = fs.readdirSync(dirPath);

            for (const item of items) {
                const fullPath = path.join(dirPath, item);
                const relativePath = path.join(basePath, item);
                const stats = fs.statSync(fullPath);

                if (stats.isDirectory()) {
                    getAllFiles(fullPath, relativePath);
                } else {
                    // Store timestamp as milliseconds since epoch
                    // Files in site/ already have correct timestamps from Git
                    timestamps[relativePath.replace(/\\/g, '/')] = stats.mtime.getTime();
                }
            }
        };

        getAllFiles(siteDir);

        // Write using common function (keeps buildTime, sorts keys)
        const outputPath = path.join(siteDir, 'timestamps.json');
        return TimestampsJson.writeTimestamps(timestamps, outputPath, false);
    }
}

// Export for use in other modules
module.exports = { TimestampsBuilder };

// Run if called directly
if (require.main === module) {
    const builder = new TimestampsBuilder();
    builder.generate();
}
