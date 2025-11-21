/**
 * Timestamp Management Module
 *
 * Responsibilities:
 * - Retrieve last Git commit timestamp for files
 * - Set file timestamps based on source files
 * - Handle multiple Git repositories (main repo + external repos)
 * - Batch operations for efficiency
 * - Cache results to avoid repeated Git calls
 *
 * Git Command: git log -1 --format=%ct -- <file_path>
 * Returns Unix timestamp of last commit that modified the file.
 *
 * @module build/timestamp
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const { Dir } = require('./dir');
const { loadExternalRepos } = require('./utils');

const execFileAsync = promisify(execFile);

/**
 * Timestamp Management Class
 * Handles both Git timestamp retrieval and file timestamp setting
 */
class Timestamp {
    constructor() {
        this.cache = new Map();
        // Load external repos from config instead of hardcoding
        this.externalRepos = loadExternalRepos();
    }

    // ========================================================================
    // Public API - File Timestamp Setting (High-level)
    // ========================================================================

    /**
     * Set file timestamp based on source file(s)
     * @param {string} outputPath - Absolute path to output file
     * @param {string|string[]} sourcePath - Absolute path(s) to source file(s)
     * @throws {Error} If timestamp cannot be determined
     */
    static async setTimestamp(outputPath, sourcePath) {
        const instance = new Timestamp();
        return instance._setTimestamp(outputPath, sourcePath);
    }

    /**
     * Get timestamp from source file(s)
     * @param {string|string[]} sourcePath - Path(s) to source file(s)
     * @returns {Promise<number>} Unix timestamp
     */
    static async getSourceTimestamp(sourcePath) {
        const instance = new Timestamp();
        return instance._getSourceTimestamp(sourcePath);
    }

    // ========================================================================
    // Public API - Git Operations (Low-level)
    // ========================================================================

    /**
     * Get timestamp for a single file from Git
     * @param {string} filePath - Path to the file
     * @param {string} repoPath - Path to Git repository (optional)
     * @returns {Promise<number|null>} Unix timestamp or null
     */
    static async getFileTimestamp(filePath, repoPath = null) {
        const instance = new Timestamp();
        return instance._getFileTimestamp(filePath, repoPath);
    }

    /**
     * Get timestamps for multiple files (batch)
     * @param {string[]} filePaths - Array of file paths
     * @param {string} repoPath - Path to Git repository (optional)
     * @returns {Promise<Map<string, number|null>>} Map of paths to timestamps
     */
    static async getFileTimestamps(filePaths, repoPath = null) {
        const instance = new Timestamp();
        return instance._getFileTimestamps(filePaths, repoPath);
    }

    /**
     * Get latest timestamp from multiple files
     * @param {string[]} filePaths - Array of file paths
     * @param {string} repoPath - Path to Git repository (optional)
     * @returns {Promise<number|null>} Latest Unix timestamp or null
     */
    static async getLatestTimestamp(filePaths, repoPath = null) {
        const instance = new Timestamp();
        return instance._getLatestTimestamp(filePaths, repoPath);
    }

    /**
     * Find which Git repo contains a file
     * @param {string} filePath - Path to the file
     * @returns {string} Path to the Git repository
     */
    static findGitRepo(filePath) {
        const instance = new Timestamp();
        return instance._findGitRepo(filePath);
    }

    // ========================================================================
    // Internal Implementation - File Operations
    // ========================================================================

    async _setTimestamp(outputPath, sourcePath) {
        try {
            const timestamp = await this._getSourceTimestamp(sourcePath);
            const date = new Date(timestamp * 1000);
            await fs.utimes(outputPath, date, date);
        } catch (error) {
            // In test mode, if we can't determine timestamp, use current time
            if (process.env.NODE_ENV === 'test') {
                const now = new Date();
                await fs.utimes(outputPath, now, now);
                return;
            }
            throw error;
        }
    }

    async _getSourceTimestamp(sourcePath) {
        // Handle array of source files (use latest)
        if (Array.isArray(sourcePath)) {
            const timestamp = await this._getLatestTimestamp(sourcePath);
            if (timestamp) {
                return timestamp;
            }

            // Fall back to filesystem for images/assets
            return await this._getLatestFilesystemTimestamp(sourcePath);
        }

        // Single source file
        const timestamp = await this._getFileTimestamp(sourcePath);
        if (timestamp) {
            return timestamp;
        }

        // Fall back to filesystem for images/assets
        return await this._getFilesystemTimestamp(sourcePath);
    }

    // ========================================================================
    // Internal Implementation - Git Operations
    // ========================================================================

    async _getFileTimestamp(filePath, repoPath = null) {
        // Check cache first
        const cacheKey = `${filePath}:${repoPath || 'auto'}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const targetRepo = repoPath || this._findGitRepo(filePath);
        const relativePath = path.relative(targetRepo, filePath);

        try {
            const { stdout } = await execFileAsync(
                'git',
                ['log', '-1', '--format=%ct', '--', relativePath],
                { cwd: targetRepo },
            );

            const timestamp = parseInt(stdout.trim(), 10);
            const result = Number.isNaN(timestamp) ? null : timestamp;

            // Cache the result
            this.cache.set(cacheKey, result);
            return result;
        } catch (error) {
            // File not in Git history or other Git error
            this.cache.set(cacheKey, null);
            return null;
        }
    }

    async _getFileTimestamps(filePaths, repoPath = null) {
        const results = new Map();
        const targetRepo = repoPath || Dir.getRoot();

        // Filter files that are in the same repo and not cached
        const uncachedFiles = [];
        const repoFiles = [];

        for (const filePath of filePaths) {
            const fileRepo = repoPath || this._findGitRepo(filePath);
            const cacheKey = `${filePath}:${fileRepo}`;

            if (this.cache.has(cacheKey)) {
                results.set(filePath, this.cache.get(cacheKey));
            } else if (fileRepo === targetRepo) {
                uncachedFiles.push(filePath);
                repoFiles.push({
                    filePath,
                    relativePath: path.relative(targetRepo, filePath),
                    cacheKey,
                });
            } else {
                // File in different repo, handle individually
                const timestamp = await this._getFileTimestamp(filePath, fileRepo);
                results.set(filePath, timestamp);
            }
        }

        // Batch process files in the same repo
        if (repoFiles.length > 0) {
            try {
                const relativePaths = repoFiles.map(f => f.relativePath);
                const { stdout } = await execFileAsync(
                    'git',
                    ['log', '--name-only', '--format=%ct', '--', ...relativePaths],
                    { cwd: targetRepo },
                );

                // Parse Git output
                const lines = stdout.trim().split('\n');
                let currentDate = null;
                const dateMap = new Map();

                for (const line of lines) {
                    if (line.match(/^\d+$/)) {
                        // This is a timestamp line
                        currentDate = parseInt(line, 10);
                    } else if (line && currentDate !== null) {
                        // This is a filename line
                        dateMap.set(line, currentDate);
                    }
                }

                // Map results back to original file paths
                for (const fileData of repoFiles) {
                    const timestamp = dateMap.get(fileData.relativePath) || null;
                    results.set(fileData.filePath, timestamp);
                    this.cache.set(fileData.cacheKey, timestamp);
                }
            } catch (error) {
                // Batch failed, set all to null
                for (const fileData of repoFiles) {
                    results.set(fileData.filePath, null);
                    this.cache.set(fileData.cacheKey, null);
                }
            }
        }

        return results;
    }

    async _getLatestTimestamp(filePaths, repoPath = null) {
        if (filePaths.length === 0) {
            return null;
        }

        const timestamps = await this._getFileTimestamps(filePaths, repoPath);
        let latestTimestamp = null;

        for (const timestamp of timestamps.values()) {
            if (timestamp !== null && (latestTimestamp === null || timestamp > latestTimestamp)) {
                latestTimestamp = timestamp;
            }
        }

        return latestTimestamp;
    }

    _findGitRepo(filePath) {
        // Check external repos first (more specific)
        for (const repo of this.externalRepos) {
            if (filePath.startsWith(repo)) {
                return repo;
            }
        }

        // Default to main repo
        return Dir.getRoot();
    }

    // ========================================================================
    // Internal Implementation - Filesystem Fallback
    // ========================================================================

    async _getFilesystemTimestamp(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return Math.floor(stats.mtimeMs / 1000);
        } catch (error) {
            // In test mode, if file doesn't exist, use current time
            if (process.env.NODE_ENV === 'test') {
                return Math.floor(Date.now() / 1000);
            }
            throw new Error(
                `Cannot determine timestamp for ${filePath}: ` +
                'not in Git and filesystem access failed',
            );
        }
    }

    async _getLatestFilesystemTimestamp(filePaths) {
        let latestTimestamp = null;

        for (const filePath of filePaths) {
            try {
                const timestamp = await this._getFilesystemTimestamp(filePath);
                if (!latestTimestamp || timestamp > latestTimestamp) {
                    latestTimestamp = timestamp;
                }
            } catch {
                // Skip files that can't be accessed
                continue;
            }
        }

        if (!latestTimestamp) {
            // In test mode, if no files can be accessed, use current time
            if (process.env.NODE_ENV === 'test') {
                return Math.floor(Date.now() / 1000);
            }
            throw new Error(
                `Cannot determine timestamp for any of ${filePaths.length} source files`,
            );
        }

        return latestTimestamp;
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Clear the internal cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            hits: this.cache.size, // Simple approximation
        };
    }
}

module.exports = { Timestamp };
