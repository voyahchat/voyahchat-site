/**
 * Configuration loader for Telegram downloader
 * Handles loading and saving of telegram and auth configurations
 *
 * @module telegram/config
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { DEFAULT_DOWNLOAD_CONFIG } = require('./constants');

/**
 * Configuration loader for Telegram downloader
 */
class TelegramConfig {
    constructor(baseDir = null) {
        this.telegramConfig = null;
        this.authConfig = null;
        this.baseDir = baseDir || process.cwd();
    }

    /**
     * Load telegram configuration
     * @returns {Promise<Object>} Telegram configuration object
     * @throws {Error} If config file is missing or invalid
     */
    async loadTelegramConfig() {
        if (this.telegramConfig) {
            return this.telegramConfig;
        }

        try {
            const configPath = path.join(this.baseDir, 'config', 'telegram.yml');
            const configFile = await fs.readFile(configPath, 'utf8');
            this.telegramConfig = yaml.load(configFile);

            // Validate required fields
            if (!this.telegramConfig.chat) {
                throw new Error('Missing required field "chat" in config/telegram.yml');
            }
            if (!this.telegramConfig.sections || !Array.isArray(this.telegramConfig.sections)) {
                throw new Error('Missing required field "sections" in config/telegram.yml');
            }

            return this.telegramConfig;
        } catch (err) {
            throw new Error(`Failed to load telegram config: ${err.message}`);
        }
    }

    /**
     * Load authentication configuration
     * @returns {Promise<Object>} Authentication configuration object
     * @throws {Error} If config file is missing or required fields are missing
     */
    async loadAuthConfig() {
        if (this.authConfig) {
            return this.authConfig;
        }

        try {
            const configPath = path.join(this.baseDir, 'config', 'auth-telegram.yml');
            const configFile = await fs.readFile(configPath, 'utf8');
            this.authConfig = yaml.load(configFile);

            // Validate required fields
            const required = ['api_id', 'api_hash', 'phone'];
            for (const field of required) {
                if (!this.authConfig[field]) {
                    throw new Error(`Missing required field "${field}" in config/auth-telegram.yml`);
                }
            }

            return this.authConfig;
        } catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(
                    'Authentication config not found. Please copy ' +
                    'config/auth-telegram.yml.example to config/auth-telegram.yml ' +
                    'and fill in your credentials.',
                );
            }
            throw new Error(`Failed to load auth config: ${err.message}`);
        }
    }

    /**
     * Save authentication configuration to file
     * @param {Object} config - Authentication configuration object to save
     * @returns {Promise<void>}
     * @throws {Error} If config file cannot be written
     */
    async saveAuthConfig(config) {
        try {
            const configPath = path.join(this.baseDir, 'config', 'auth-telegram.yml');
            const yamlString = yaml.dump(config, {
                indent: 2,
                lineWidth: 120,
                noRefs: true,
            });
            await fs.writeFile(configPath, yamlString, 'utf8');
            this.authConfig = config; // Update cache
        } catch (err) {
            throw new Error(`Failed to save auth config: ${err.message}`);
        }
    }

    /**
     * Get all sections from telegram config
     * @returns {Promise<Array>} Array of section configuration objects
     * @throws {Error} If telegram config cannot be loaded
     */
    async getSections() {
        const config = await this.loadTelegramConfig();
        return config.sections;
    }

    /**
     * Get section by slug
     * @param {string} slug - Section slug to find
     * @returns {Promise<Object|undefined>} Section configuration object or undefined if not found
     * @throws {Error} If telegram config cannot be loaded
     */
    async getSection(slug) {
        const sections = await this.getSections();
        return sections.find(s => s.slug === slug);
    }

    /**
     * Get chat name from telegram config
     * @returns {Promise<string>} Chat username
     * @throws {Error} If telegram config cannot be loaded
     */
    async getChatName() {
        const config = await this.loadTelegramConfig();
        return config.chat;
    }

    /**
     * Get additional messages
     * @returns {Array} Array of additional message configurations
     */
    async getAdditionalMessages() {
        const config = await this.loadTelegramConfig();
        return config.additionalMessages || [];
    }

    /**
     * Get download configuration with defaults
     * @returns {Object} Download configuration object
     */
    async getDownloadConfig() {
        const config = await this.loadTelegramConfig();
        return { ...DEFAULT_DOWNLOAD_CONFIG, ...config.download };
    }
}

// Export the class only
module.exports = { TelegramConfig };
