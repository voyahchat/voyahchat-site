const fs = require('fs').promises;
const path = require('path');

/**
 * Directory utilities class
 * Provides unified interface for directory and path operations
 */
class Dir {
    /**
     * Get project root directory by searching for package.json
     * @returns {string} Path to project root directory
     */
    static getRoot() {
        let currentDir = __dirname;

        // Search upward for package.json
        while (currentDir !== path.dirname(currentDir)) {
            const packageJsonPath = path.join(currentDir, 'package.json');

            try {
                // Synchronous check for package.json
                require('fs').accessSync(packageJsonPath);

                return currentDir;
            } catch (error) {
                // Move up one directory
                currentDir = path.dirname(currentDir);
            }
        }

        // If not found, return original directory
        return __dirname;
    }

    /**
     * Get build directory path
     * @returns {string} Path to build directory
     */
    static getBuild() {
        return path.join(Dir.getRoot(), '.build');
    }

    /**
     * Get site directory path
     * @returns {string} Path to site directory
     */
    static getSite() {
        return path.join(Dir.getRoot(), 'site');
    }

    /**
     * Get content directory path
     * @returns {string} Path to content directory
     */
    static getContent() {
        const levels = require('../../config/levels.json');

        return path.join(Dir.getRoot(), levels[0]);
    }

    /**
     * Ensure directory exists, create if it doesn't
     * @param {string} dirPath - Directory path to ensure exists
     * @returns {Promise<void>}
     */
    static async ensure(dirPath) {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }

    /**
     * Recursively scan directory for files with specific extensions
     * @param {string} dirPath - Directory to scan
     * @param {string[]} extensions - Array of file extensions to include (e.g., ['.js', '.css'])
     * @param {string[]} excludeDirs - Array of directory names to exclude
     * @returns {Promise<string[]>} Array of file paths
     */
    static async scan(dirPath, extensions = [], excludeDirs = []) {
        const files = [];

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Skip excluded directories
                    if (excludeDirs.includes(entry.name) || entry.name.startsWith('.')) {
                        return;
                    }

                    // Recursively scan subdirectories
                    const subFiles = await Dir.scan(fullPath, extensions, excludeDirs);

                    files.push(...subFiles);

                    return;
                }

                if (!entry.isFile()) {
                    return;
                }

                // Check if file has matching extension
                const ext = path.extname(entry.name).toLowerCase();

                if (extensions.length === 0 || extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }));
        } catch (error) {
            // Handle directory access errors gracefully
            // console.warn(`Warning: Could not access directory ${dirPath}:`, error.message);
        }

        return files;
    }
}

module.exports = {Dir};

