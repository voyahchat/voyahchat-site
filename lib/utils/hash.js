const crypto = require('crypto');

/**
 * Generate MD5 hash for content (16 characters)
 * @param {string|Buffer} content - Content to hash
 * @returns {string} 16-character hash
 */
function generateHash(content) {
    const hash = crypto.createHash('md5').update(content).digest('hex');

    return hash.substring(0, 16);
}

module.exports = {generateHash};
