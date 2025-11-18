const fs = require('fs').promises;
const path = require('path');
const { Dir } = require('./dir');

/**
 * Statistics Collector Class
 * Provides unified interface for collecting and saving build statistics
 */
class Stats {
    constructor(filename, buildDir = null) {
        this.filename = filename;
        this.buildDir = buildDir;
        this.stats = {};
    }

    /**
     * Add an entry to the statistics
     * @param {string} key - The key for this entry (usually filename)
     * @param {string} sourcePath - Source file path
     * @param {number} size - File size
     * @param {Object} metadata - Additional metadata
     */
    add(key, sourcePath, size, metadata = {}) {
        this.stats[key] = {
            source: sourcePath,
            size,
            metadata,
        };
    }

    /**
     * Add multiple entries from an array of file data
     * @param {Array} entries - Array of {key, sourcePath, size, metadata} objects
     */
    addEntries(entries) {
        entries.forEach(({key, sourcePath, size, metadata}) => {
            this.add(key, sourcePath, size, metadata);
        });
    }

    /**
     * Get the current statistics object
     * @returns {Object} Current statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Save statistics to the predefined file
     */
    async save() {
        await Stats.saveToFile(this.filename, this.stats, this.buildDir);
    }

    /**
     * Clear all statistics
     */
    clear() {
        Object.keys(this.stats).forEach((key) => delete this.stats[key]);
    }

    /**
     * Create statistics entry for a processed file with metadata
     * @param {string} filePath - Path to the processed file
     * @param {string} sourcePath - Original source path
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Statistics entry
     */
    static async createFileStatsEntry(filePath, sourcePath, metadata = {}) {
        const fileStats = await fs.stat(filePath);
        const projectRoot = Dir.getRoot();

        return {
            source: path.relative(projectRoot, sourcePath),
            size: fileStats.size,
            metadata,
        };
    }

    /**
     * Save build statistics to a JSON file
     * @param {string} filename - Name of the JSON file (e.g., 'build-html.json')
     * @param {Object} stats - Statistics object where keys are source identifiers
     * @returns {Promise<void>}
     */
    static async saveToFile(filename, stats, buildDir = null) {
        const targetDir = buildDir || Dir.getBuild();
        const filePath = path.join(targetDir, filename);

        await Dir.ensure(targetDir);

        // CRITICAL: Write file and explicitly flush to disk to prevent race conditions
        // Open file for writing
        const fileHandle = await fs.open(filePath, 'w');
        try {
            // Write the content
            await fileHandle.writeFile(JSON.stringify(stats, null, 4) + '\n');
            // CRITICAL: Force flush to disk before closing
            // This ensures the file is fully written before tests can read it
            await fileHandle.sync();
        } finally {
            // Always close the file handle
            await fileHandle.close();
        }
    }

    /**
     * Load build statistics from a JSON file
     * @param {string} filename - Name of the JSON file (e.g., 'build-html.json')
     * @returns {Promise<Object>} Statistics object
     */
    static async loadFromFile(filename) {
        const buildDir = Dir.getBuild();
        const filePath = path.join(buildDir, filename);

        const content = await fs.readFile(filePath, 'utf8');

        return JSON.parse(content);
    }
}

module.exports = {Stats};
