/**
 * Telegram Module Constants
 * Centralized constants used across telegram scripts
 *
 * @module telegram/constants
 */

/**
 * Bytes per megabyte for size calculations
 * @constant {number}
 */
const BYTES_PER_MB = 1024 * 1024;

/**
 * Default download configuration values
 * @constant {Object}
 */
const DEFAULT_DOWNLOAD_CONFIG = {
    maxRetries: 10,
    retryDelayBaseMs: 2000,
    retryDelayMaxMs: 60000,
    retryJitterMs: 1000,
    timeoutBaseMs: 60000,
    timeoutPerMbMs: 30000,
    timeoutMaxMs: 600000,
    connectionRetries: 5,
    connectionTimeoutMs: 30000,
    messagesPerRequest: 100,
    rateLimitDelayMs: 1000,
};

/**
 * Media file extensions by type
 * @constant {Object}
 */
const MEDIA_EXTENSIONS = {
    PHOTO: 'jpg',
    VIDEO: 'mp4',
    AUDIO: 'mp3',
    DEFAULT: 'bin',
};

/**
 * Output directory structure
 * @constant {Object}
 */
const OUTPUT_DIRS = {
    sections: 'sections',
    additional: 'additional',
    referenced: 'referenced',
    media: 'media',
};

/**
 * File names used in output
 * @constant {Object}
 */
const OUTPUT_FILES = {
    index: 'index.json',
    metadata: 'metadata.json',
    pinned: 'pinned.json',
};

module.exports = {
    BYTES_PER_MB,
    DEFAULT_DOWNLOAD_CONFIG,
    MEDIA_EXTENSIONS,
    OUTPUT_DIRS,
    OUTPUT_FILES,
};
