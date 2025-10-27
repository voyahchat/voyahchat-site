/**
 * Build System Constants
 *
 * Centralized constants used across build scripts.
 * AGENTS.md: Do not hardcode paths, use configuration.
 *
 * @module build/constants
 */

/**
 * CSS bundles to process
 * @constant {string[]}
 */
const BUNDLES = ['page', 'page-index'];

/**
 * Indentation size for YAML parsing (spaces per level)
 * @constant {number}
 */
const INDENT_SIZE = 2;

/**
 * Supported image formats
 * @constant {string[]}
 */
const SUPPORTED_IMAGE_FORMATS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

/**
 * File extensions that should be compressed
 * @constant {string[]}
 */
const COMPRESSIBLE_EXTENSIONS = ['.html', '.css', '.js', '.svg', '.xml'];

/**
 * Maximum heading level for markdown
 * @constant {number}
 */
const MAX_HEADING_LEVEL = 6;

/**
 * Base URL for sitemap.xml
 * @constant {string}
 */
const BASE_URL = 'https://voyahchat.ru';

module.exports = {
    BUNDLES,
    INDENT_SIZE,
    SUPPORTED_IMAGE_FORMATS,
    COMPRESSIBLE_EXTENSIONS,
    MAX_HEADING_LEVEL,
    BASE_URL,
};
