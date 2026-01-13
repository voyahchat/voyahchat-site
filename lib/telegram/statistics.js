/**
 * Statistics tracker for Telegram downloads
 * Provides detailed metrics about download progress and performance
 *
 * @module telegram/statistics
 */

/**
 * Download statistics tracker
 */
class DownloadStatistics {
    /**
     * Create a new statistics tracker
     */
    constructor() {
        this.reset();
    }

    /**
     * Log message if not in test environment
     * @param {...any} args - Arguments to pass to console.log
     */
    log(...args) {
        if (process.env.NODE_ENV !== 'test') {
            console.log(...args);
        }
    }

    /**
     * Reset all statistics
     */
    reset() {
        this.startTime = null;
        this.endTime = null;
        this.sections = new Map();
        this.messages = {
            total: 0,
            downloaded: 0,
            skipped: 0,
            failed: 0,
            referenced: 0,
        };
        this.media = {
            total: 0,
            downloaded: 0,
            skipped: 0,
            failed: 0,
            totalSize: 0,
            downloadedSize: 0,
        };
        this.errors = [];
        this.retries = {
            total: 0,
            byType: new Map(),
        };
        this.timeouts = {
            total: 0,
            bySize: new Map(),
        };
    }

    /**
     * Start tracking
     */
    start() {
        this.startTime = new Date();
    }

    /**
     * Stop tracking
     */
    stop() {
        this.endTime = new Date();
    }

    /**
     * Add section statistics
     * @param {string} sectionSlug - Section identifier
     * @param {Object} stats - Section statistics
     */
    addSection(sectionSlug, stats) {
        this.sections.set(sectionSlug, {
            ...stats,
            startTime: stats.startTime || new Date(),
            endTime: stats.endTime || null,
        });
    }

    /**
     * Increment message count
     * @param {string} type - Type of increment (total, downloaded, skipped, failed, referenced)
     * @param {number} count - Number to increment (default: 1)
     */
    incrementMessages(type, count = 1) {
        if (this.messages[type] !== undefined) {
            this.messages[type] += count;
        }
    }

    /**
     * Increment media count
     * @param {string} type - Type of increment (total, downloaded, skipped, failed)
     * @param {number} size - Size in bytes
     */
    incrementMedia(type, size = 0) {
        if (this.media[type] !== undefined) {
            this.media[type] += 1;
        }

        if (type === 'total') {
            this.media.totalSize += size;
        } else if (type === 'downloaded') {
            this.media.downloadedSize += size;
        }
    }

    /**
     * Add error to statistics
     * @param {Error} error - The error that occurred
     * @param {string} context - Context where error occurred (e.g., 'download', 'parse')
     * @param {Object} metadata - Additional error metadata
     */
    addError(error, context, metadata = {}) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            message: error.message,
            context,
            type: error.constructor.name,
            metadata,
        };

        this.errors.push(errorEntry);

        // Keep only last 100 errors to prevent memory issues
        if (this.errors.length > 100) {
            this.errors.shift();
        }
    }

    /**
     * Add retry statistics
     * @param {string} type - Type of operation being retried
     * @param {number} attempts - Number of attempts made
     */
    addRetry(type, attempts) {
        this.retries.total += attempts - 1; // Subtract 1 for initial attempt

        const current = this.retries.byType.get(type) || { count: 0, totalAttempts: 0 };
        current.count += 1;
        current.totalAttempts += attempts;
        this.retries.byType.set(type, current);
    }

    /**
     * Add timeout statistics
     * @param {number} size - Size of file that timed out (in bytes)
     * @param {number} timeout - Timeout duration in milliseconds
     */
    addTimeout(size, timeout) {
        this.timeouts.total += 1;

        // Size ranges for analysis
        const sizeRange = this.getSizeRange(size);
        const current = this.timeouts.bySize.get(sizeRange) || { count: 0, totalTimeout: 0 };
        current.count += 1;
        current.totalTimeout += timeout;
        this.timeouts.bySize.set(sizeRange, current);
    }

    /**
     * Get size range category
     * @param {number} size - Size in bytes
     * @returns {string} Size range category
     */
    getSizeRange(size) {
        const mb = size / (1024 * 1024);
        if (mb < 1) return '< 1MB';
        if (mb < 10) return '1-10MB';
        if (mb < 50) return '10-50MB';
        if (mb < 100) return '50-100MB';
        return '> 100MB';
    }

    /**
     * Get duration in milliseconds
     * @returns {number} Duration in milliseconds
     */
    getDuration() {
        if (!this.startTime) return 0;
        const end = this.endTime || new Date();
        return end - this.startTime;
    }

    /**
     * Get success rate
     * @returns {number} Success rate as percentage (0-100)
     */
    getSuccessRate() {
        const total = this.messages.total;
        if (total === 0) return 0;
        return (this.messages.downloaded / total) * 100;
    }

    /**
     * Get media success rate
     * @returns {number} Media success rate as percentage (0-100)
     */
    getMediaSuccessRate() {
        const total = this.media.total;
        if (total === 0) return 0;
        return (this.media.downloaded / total) * 100;
    }

    /**
     * Get average retry count
     * @returns {number} Average number of retries per operation
     */
    getAverageRetries() {
        if (this.retries.byType.size === 0) return 0;

        let totalAttempts = 0;
        let totalOperations = 0;

        for (const stats of this.retries.byType.values()) {
            totalAttempts += stats.totalAttempts;
            totalOperations += stats.count;
        }

        return totalOperations > 0 ? (totalAttempts / totalOperations) - 1 : 0;
    }

    /**
     * Get formatted statistics object
     * @returns {Object} Formatted statistics
     */
    getStatistics() {
        const duration = this.getDuration();

        return {
            duration: {
                start: this.startTime?.toISOString(),
                end: this.endTime?.toISOString(),
                milliseconds: duration,
                seconds: Math.round(duration / 1000),
                minutes: Math.round(duration / 60000),
            },
            messages: {
                ...this.messages,
                successRate: this.getSuccessRate(),
            },
            media: {
                ...this.media,
                successRate: this.getMediaSuccessRate(),
                totalSizeMB: Math.round(this.media.totalSize / 1024 / 1024),
                downloadedSizeMB: Math.round(this.media.downloadedSize / 1024 / 1024),
            },
            sections: {
                total: this.sections.size,
                details: Object.fromEntries(this.sections),
            },
            retries: {
                total: this.retries.total,
                average: this.getAverageRetries(),
                byType: Object.fromEntries(this.retries.byType),
            },
            timeouts: {
                total: this.timeouts.total,
                bySize: Object.fromEntries(this.timeouts.bySize),
            },
            errors: {
                total: this.errors.length,
                recent: this.errors.slice(-10), // Last 10 errors
            },
        };
    }

    /**
     * Print summary to console
     */
    printSummary() {
        const stats = this.getStatistics();

        this.log('\n=== Download Statistics ===');
        this.log(`Duration: ${stats.duration.minutes} minutes`);
        this.log(`Messages: ${stats.messages.downloaded}/${stats.messages.total} ` +
                    `(${stats.messages.successRate.toFixed(1)}% success)`);
        this.log(`Media: ${stats.media.downloaded}/${stats.media.total} ` +
                    `(${stats.media.successRate.toFixed(1)}% success)`);
        this.log(`Media Size: ${stats.media.downloadedSizeMB}MB / ${stats.media.totalSizeMB}MB`);

        if (stats.retries.total > 0) {
            this.log(`Retries: ${stats.retries.total} total ` +
                        `(${stats.retries.average.toFixed(1)} average per operation)`);
        }

        if (stats.timeouts.total > 0) {
            this.log(`Timeouts: ${stats.timeouts.total} total`);
        }

        if (stats.errors.total > 0) {
            this.log(`Errors: ${stats.errors.total} total`);
            this.log('Recent errors:');
            stats.errors.recent.forEach(err => {
                this.log(`  - ${err.timestamp}: ${err.message} (${err.context})`);
            });
        }

        this.log('========================\n');
    }
}

module.exports = { DownloadStatistics };
