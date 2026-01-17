/**
 * Logger utility for Telegram downloader with verbose mode support
 *
 * @module telegram/logger
 */

/**
 * Status symbols for topic progress display
 */
const STATUS_SYMBOLS = {
    pending: '[ ]',
    progress: '[-]',
    complete: '[V]',
    failed: '[X]',
};

/**
 * Animated progress symbols for spinning indicator
 */
const PROGRESS_SYMBOLS = ['[-]', '[\\]', '[|]', '[/]'];

/**
 * Logger with verbose mode support
 */
class TelegramLogger {
    /**
     * Create a new logger
     * @param {Object} options - Logger options
     * @param {boolean} options.verbose - Enable verbose output
     */
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.topics = new Map();
        this.isTest = process.env.NODE_ENV === 'test';
        this.activeAnimations = new Map();
        this.animationIntervals = new Map();
        this.topicErrors = new Map(); // Store error reasons for failed topics
        this.topicLines = new Map(); // Track which line each topic is on
    }

    /**
     * Log debug message (only in verbose mode)
     * @param {...any} args - Arguments to log
     */
    debug(...args) {
        if (this.isTest) return;
        if (this.verbose) {
            console.log(...args);
        }
    }

    /**
     * Log info message (always shown)
     * @param {...any} args - Arguments to log
     */
    info(...args) {
        if (this.isTest) return;
        console.log(...args);
    }

    /**
     * Log warning message (always shown)
     * @param {...any} args - Arguments to log
     */
    warn(...args) {
        if (this.isTest) return;
        console.warn(...args);
    }

    /**
     * Log error message (always shown)
     * @param {...any} args - Arguments to log
     */
    error(...args) {
        if (this.isTest) return;
        console.error(...args);
    }

    /**
     * Set topic status to pending
     * @param {string} name - Topic name
     */
    topicPending(name) {
        this.topics.set(name, 'pending');
        this._printTopicStatus(name, 'pending');
    }

    /**
     * Set topic status to in progress
     * @param {string} name - Topic name
     */
    topicProgress(name) {
        this.topics.set(name, 'progress');
        this._printTopicStatus(name, 'progress');
    }

    /**
     * Set topic status to complete
     * @param {string} name - Topic name
     */
    topicComplete(name) {
        this.topics.set(name, 'complete');
        this._printTopicStatus(name, 'complete');
    }

    /**
     * Set topic status to failed
     * @param {string} name - Topic name
     * @param {string} [reason] - Reason for failure
     */
    topicFailed(name, reason) {
        this.topics.set(name, 'failed');
        if (reason) {
            this.topicErrors.set(name, reason);
        }
        this._printTopicStatus(name, 'failed');
    }

    /**
     * Print topic status line
     * @param {string} name - Topic name
     * @param {string} status - Topic status
     * @private
     */
    _printTopicStatus(name, status) {
        if (this.isTest) return;
        if (this.verbose) return;

        const symbol = STATUS_SYMBOLS[status] || '[ ]';
        let output = `${symbol} ${name}`;

        // Add error reason for failed topics
        if (status === 'failed' && this.topicErrors.has(name)) {
            const reason = this.topicErrors.get(name);
            output += ` - ${reason}`;
        }

        if (status === 'progress') {
            // Start new line for progress, allow in-place updates
            process.stdout.write(`${output}`);
        } else if (status === 'complete' || status === 'failed') {
            // Overwrite progress line and add newline to move to next line
            process.stdout.write(`\r${output}\n`);
        } else {
            console.log(output);
        }
    }

    /**
     * Output section summary with statistics
     * @param {string} name - Section name
     * @param {string} statsString - Formatted statistics string
     */
    sectionSummary(name, statsString) {
        if (this.isTest) return;

        // Update internal state to mark as complete
        this.topics.set(name, 'complete');

        const output = statsString ? `[V] ${name} — ${statsString}` : `[V] ${name}`;

        if (this.verbose) {
            console.log(output);
        } else {
            // Overwrite progress line with summary
            process.stdout.write(`\r${output}\n`);
        }
    }

    /**
     * Print final summary
     * @param {number} total - Total topics count
     * @param {number} failed - Failed topics count
     */
    printSummary(total, failed) {
        if (this.isTest) return;
        if (this.verbose) return;

        console.log('');
        if (failed === 0) {
            console.log(`Download complete: ${total} topics`);
        } else {
            console.log(`Download complete: ${total} topics, ${failed} failed`);
        }
    }
}

module.exports = { TelegramLogger, STATUS_SYMBOLS, PROGRESS_SYMBOLS };
