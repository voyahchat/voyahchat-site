const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

/**
 * TestDir - Test directory helper
 * Provides Dir-like interface but all paths are in isolated test directory
 * All directories are created automatically on first access
 *
 * This class enables parallel test execution by providing isolated
 * directory instances instead of relying on global Dir mocking.
 *
 * Usage:
 *   const dir = new TestDir();
 *   const buildDir = dir.getBuild(); // Directory created automatically!
 */
class TestDir {
    /**
     * Create unique test directory
     * No parameters needed - creates clean isolated environment
     */
    constructor() {
        // Create unique test directory in .build
        const testBuildDir = path.join(__dirname, '..', '..', '.build');
        const randomDirName = 'test-' + crypto.randomBytes(8).toString('hex');
        this.testDir = path.join(testBuildDir, randomDirName);
        fs.mkdirSync(this.testDir, { recursive: true });

        // Track created directories to avoid redundant mkdir calls
        this._created = new Set([this.testDir]);
    }

    /**
     * Ensure directory exists (create if needed)
     * @private
     */
    _ensureDir(dirPath) {
        if (!this._created.has(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            this._created.add(dirPath);
        }
        return dirPath;
    }

    /**
     * Get root test directory
     * @returns {string} Path to test root directory
     */
    getRoot() {
        return this.testDir;
    }

    /**
     * Get build directory (.build)
     * Directory is created automatically
     * @returns {string} Path to build directory
     */
    getBuild() {
        return this._ensureDir(path.join(this.testDir, '.build'));
    }

    /**
     * Get site directory
     * Directory is created automatically
     * @returns {string} Path to site directory
     */
    getSite() {
        return this._ensureDir(path.join(this.testDir, 'site'));
    }

    /**
     * Get config directory
     * Directory is created automatically
     * @returns {string} Path to config directory
     */
    getConfig() {
        return this._ensureDir(path.join(this.testDir, 'config'));
    }

    /**
     * Get content directory
     * Directory is created automatically
     * @returns {string} Path to content directory
     */
    getContent() {
        return this._ensureDir(path.join(this.testDir, 'external/voyahchat-content'));
    }

    /**
     * Get docs directory
     * Directory is created automatically
     * @returns {string} Path to docs directory
     */
    getDocs() {
        return this._ensureDir(path.join(this.testDir, 'external/voyahchat-docs'));
    }

    /**
     * Get install directory
     * Directory is created automatically
     * @returns {string} Path to install directory
     */
    getInstall() {
        return this._ensureDir(path.join(this.testDir, 'external/voyahchat-install'));
    }

    /**
     * Get build file path by name
     * @param {string} filename - Build file name (e.g., 'build-html.json')
     * @returns {string} Path to build file in test directory
     */
    getBuildFile(filename) {
        return path.join(this.getBuild(), filename);
    }

    /**
     * Get adaptive-layout directory
     * Directory is created automatically
     * @returns {string} Path to adaptive-layout directory
     */
    getAdaptive() {
        return this._ensureDir(path.join(this.testDir, 'external/adaptive-layout'));
    }

    /**
     * Get blocks directory
     * Directory is created automatically
     * @returns {string} Path to blocks directory
     */
    getBlocks() {
        return this._ensureDir(path.join(this.testDir, 'blocks'));
    }

    /**
     * Ensure directory exists, create if it doesn't
     * @param {string} dirPath - Directory path to ensure exists
     * @returns {Promise<void>}
     */
    async ensure(dirPath) {
        await fs.promises.mkdir(dirPath, { recursive: true });
    }

    /**
     * Recursively scan directory for files with specific extensions
     * @param {string} dirPath - Directory to scan
     * @param {string[]} extensions - Array of file extensions to include
     * @param {string[]} excludeDirs - Array of directory names to exclude
     * @returns {Promise<string[]>} Array of file paths
     */
    async scan(dirPath, extensions = [], excludeDirs = []) {
        const files = [];

        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

            await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    if (excludeDirs.includes(entry.name) || entry.name.startsWith('.')) {
                        return;
                    }
                    const subFiles = await this.scan(fullPath, extensions, excludeDirs);
                    files.push(...subFiles);
                    return;
                }

                if (!entry.isFile()) {
                    return;
                }

                const ext = path.extname(entry.name).toLowerCase();
                if (extensions.length === 0 || extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }));
        } catch (error) {
            // Handle directory access errors gracefully
        }

        return files;
    }

    /**
     * Static method: Ensure directory exists
     * @param {string} dirPath - Directory path to ensure exists
     * @returns {Promise<void>}
     */
    static async ensure(dirPath) {
        await fs.promises.mkdir(dirPath, { recursive: true });
    }

    /**
     * Static method: Scan directory for files
     * @param {string} dirPath - Directory to scan
     * @param {string[]} extensions - Array of file extensions to include
     * @param {string[]} excludeDirs - Array of directory names to exclude
     * @returns {Promise<string[]>} Array of file paths
     */
    static async scan(dirPath, extensions = [], excludeDirs = []) {
        const instance = new TestDir();
        return instance.scan(dirPath, extensions, excludeDirs);
    }
}

module.exports = { TestDir };
