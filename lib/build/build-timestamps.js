const fs = require('fs');
const path = require('path');
const { Dir } = require('./dir');

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

        // Write timestamps.json to site directory
        const outputPath = path.join(siteDir, 'timestamps.json');
        fs.writeFileSync(outputPath, JSON.stringify(timestamps, null, 2));

        return timestamps;
    }
}

// Export for use in other modules
module.exports = { TimestampsBuilder };

// Run if called directly
if (require.main === module) {
    const builder = new TimestampsBuilder();
    builder.generate();
}
