const fs = require('fs').promises;
const path = require('path');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const { TelegramConfig } = require('./config');
const { TelegramParser } = require('./parser');
const { executeWithTimeoutAndRetry, calculateTimeout } = require('./retry');
const { DownloadStatistics } = require('./statistics');
const { MEDIA_EXTENSIONS, BYTES_PER_MB, OUTPUT_DIRS, OUTPUT_FILES } = require('./constants');

/**
 * Telegram message downloader with resume capability and integrity checking
 *
 * @module telegram/download
 */
class TelegramDownloader {
    /**
     * Create a new Telegram downloader
     * @param {Object} [options={}] - Configuration options
     * @param {string} [options.outputDir='telegram'] - Output directory
     * @param {Object} [options.dir] - Directory utility instance (for testing)
     */
    constructor(options = {}) {
        this.client = null;
        this.outputDir = options.outputDir || 'telegram';
        this.downloadedMessages = new Set(); // Track downloaded messages to avoid duplicates

        // Create config instance
        this.config = new TelegramConfig();
        this.downloadConfig = null; // Will be loaded lazily

        // Initialize statistics tracker
        this.stats = new DownloadStatistics();
    }

    /**
     * Get download configuration, loading it lazily if needed
     * @returns {Promise<Object>} Download configuration
     * @throws {Error} If config cannot be loaded
     */
    async getDownloadConfig() {
        if (!this.downloadConfig) {
            this.downloadConfig = await this.config.getDownloadConfig();
        }
        return this.downloadConfig;
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
     * Log warning if not in test environment
     * @param {...any} args - Arguments to pass to console.warn
     */
    warn(...args) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn(...args);
        }
    }

    /**
     * Log error if not in test environment
     * @param {...any} args - Arguments to pass to console.error
     */
    error(...args) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(...args);
        }
    }

    /**
     * Initialize Telegram client and authenticate
     * Prompts for verification code and 2FA password if needed
     * Saves session to config file after successful authentication
     * @returns {Promise<void>}
     * @throws {Error} If authentication fails
     */
    async init() {
        const authConfig = await this.config.loadAuthConfig();

        // Load session from config
        let session;
        if (authConfig.session) {
            session = new StringSession(authConfig.session);
        } else {
            session = new StringSession('');
        }

        const downloadConfig = await this.getDownloadConfig();
        this.client = new TelegramClient(session, authConfig.api_id, authConfig.api_hash, {
            connectionRetries: downloadConfig.connectionRetries,
            retryDelay: downloadConfig.retryDelayBaseMs,
            timeout: downloadConfig.connectionTimeoutMs,
        });

        this.log('Starting Telegram client...');
        await this.client.start({
            phoneNumber: async () => {
                this.log(`Using phone number: ${authConfig.phone}`);
                return authConfig.phone;
            },
            password: async () => {
                this.log('\nTwo-factor authentication is enabled!');
                this.log('Please enter your 2FA password (from Apple Passwords):');
                const password = await this.promptInput();
                if (!password) {
                    throw new Error('Password is required for 2FA');
                }
                return password;
            },
            phoneCode: async () => {
                this.log('\nEnter the code you received (via SMS or Telegram app):');
                const code = await this.promptInput();
                if (!code) {
                    throw new Error('Verification code is required');
                }
                return code;
            },
            onError: (err) => {
                this.error('Telegram client error:', err);
            },
        });
        this.log('Client started successfully!');

        // Save session to config
        const sessionString = this.client.session.save();
        authConfig.session = sessionString;
        await this.config.saveAuthConfig(authConfig);
        this.log('Session saved to config file');
    }

    /**
     * Prompt for input from console
     * @returns {Promise<string>} User input trimmed
     */
    promptInput() {
        return new Promise((resolve) => {
            // Resume stdin if paused
            if (process.stdin.isPaused()) {
                process.stdin.resume();
            }
            process.stdin.setEncoding('utf8');

            // Clear any pending data
            process.stdin.removeAllListeners('data');

            process.stdin.once('data', (data) => {
                const input = data.toString().trim();
                process.stdin.pause();
                resolve(input);
            });
        });
    }

    /**
     * Get chat entity by username from config
     * @returns {Promise<Object>} Telegram chat entity
     */
    async getChat() {
        const chatName = await this.config.getChatName();
        const result = await this.client.invoke(
            new Api.contacts.ResolveUsername({
                username: chatName,
            }),
        );
        return result.chats[0];
    }

    /**
     * Download media from message with timeout and retry
     * @param {Object} message - Telegram message object
     * @param {string} sectionDir - Section directory path
     * @returns {Promise<Array>} Array of media file information
     */
    async downloadMedia(message, sectionDir) {
        if (!message.media) return [];

        const mediaDir = path.join(sectionDir, OUTPUT_DIRS.media);
        try {
            await fs.access(mediaDir);
        } catch {
            await fs.mkdir(mediaDir, { recursive: true });
        }

        const mediaFiles = [];

        // Check if media already exists
        let extension = MEDIA_EXTENSIONS.DEFAULT;
        if (message.photo) {
            extension = MEDIA_EXTENSIONS.PHOTO;
        } else if (message.video) {
            extension = MEDIA_EXTENSIONS.VIDEO;
        } else if (message.document) {
            const fileName = message.document.fileName || 'document';
            const parts = fileName.split('.');
            extension = parts.length > 1 ? parts[parts.length - 1] : MEDIA_EXTENSIONS.DEFAULT;
        } else if (message.audio) {
            extension = MEDIA_EXTENSIONS.AUDIO;
        }

        const fileName = `${message.id}.${extension}`;
        const filePath = path.join(mediaDir, fileName);

        try {
            await fs.access(filePath);
            // Media already exists, skip download
            const stats = await fs.stat(filePath);
            this.log(`  Media already exists: ${fileName} (${Math.round(stats.size / BYTES_PER_MB)}MB)`);
            this.stats.incrementMedia('skipped', stats.size);

            mediaFiles.push({
                type: message.media.className.replace('MessageMedia', '').toLowerCase(),
                fileId: message.id,
                fileName,
                localPath: path.relative(sectionDir, filePath),
            });
            return mediaFiles;
        } catch {
            // File doesn't exist, continue with download
        }

        // Download with timeout and retry using new retry utility
        let buffer = null;
        let fileSizeBytes = 0;

        // Try to get file size for timeout calculation
        if (message.document && message.document.size) {
            fileSizeBytes = message.document.size;
        } else if (message.video && message.video.size) {
            fileSizeBytes = message.video.size;
        } else if (message.photo && message.photo.sizes && message.photo.sizes.length > 0) {
            // Use largest photo size
            const largestSize = message.photo.sizes.reduce((prev, current) =>
                (prev.size > current.size) ? prev : current);
            fileSizeBytes = largestSize.size || 0;
        }

        // Calculate timeout based on file size
        const downloadConfig = await this.getDownloadConfig();
        const timeoutMs = calculateTimeout(
            fileSizeBytes,
            downloadConfig.timeoutBaseMs,
            downloadConfig.timeoutPerMbMs,
            downloadConfig.timeoutMaxMs,
        );

        try {
            this.log(`  Downloading media ${fileName}...`);

            buffer = await executeWithTimeoutAndRetry(
                () => this.client.downloadMedia(message, { workers: 1 }),
                timeoutMs,
                {
                    maxRetries: downloadConfig.maxRetries,
                    baseDelayMs: downloadConfig.retryDelayBaseMs,
                    maxDelayMs: downloadConfig.retryDelayMaxMs,
                    jitterMs: downloadConfig.retryJitterMs,
                    onRetry: (error, attempt, delay, _errorType) => {
                        this.log(`  Download attempt failed: ${error.message}`);
                        this.log(
                            `  Retrying... (${downloadConfig.maxRetries - attempt} attempts left, ` +
                            `delay: ${Math.round(delay / 1000)}s)`,
                        );
                    },
                },
            );
        } catch (err) {
            this.log(
                `  Failed to download media ${fileName} after ${downloadConfig.maxRetries} ` +
                `attempts: ${err.message}`,
            );
            this.stats.incrementMedia('failed');
            this.stats.addError(err, 'media-download', { fileName, messageId: message.id });
            return [];
        }

        // Save the downloaded buffer
        await fs.writeFile(filePath, buffer);
        this.log(`  Media saved: ${fileName} (${Math.round(buffer.length / BYTES_PER_MB)}MB)`);
        this.stats.incrementMedia('downloaded', buffer.length);

        mediaFiles.push({
            type: message.media.className.replace('MessageMedia', '').toLowerCase(),
            fileId: message.id,
            fileName,
            localPath: path.relative(sectionDir, filePath),
        });

        return mediaFiles;
    }

    /**
     * Convert Telegram message to JSON format with media download
     * @param {Object} message - Telegram message object
     * @param {string} sectionDir - Section directory for media storage
     * @returns {Promise<Object>} Message in JSON format with media info
     */
    async messageToJson(message, sectionDir) {
        const json = {
            id: message.id,
            date: message.date ? (
                message.date instanceof Date ?
                    message.date.toISOString() :
                    new Date(message.date).toISOString()
            ) : new Date().toISOString(),
            text: message.message || '',
            entities: message.entities || [],
            media: [],
            referencedMessages: [],
        };

        // Download media if present
        if (message.media) {
            json.media = await this.downloadMedia(message, sectionDir);
        }

        // Extract referenced messages from text
        if (message.message) {
            json.referencedMessages = TelegramParser.extractReferencedMessages(message.message);
        }

        // Convert to HTML for easier processing later
        if (message.message && message.entities) {
            // Simple entity to HTML conversion
            let html = message.message;
            const entities = [...message.entities].sort((a, b) => a.offset - b.offset);

            for (let i = entities.length - 1; i >= 0; i--) {
                const entity = entities[i];
                const before = html.substring(0, entity.offset);
                let text = html.substring(entity.offset, entity.offset + entity.length);
                const after = html.substring(entity.offset + entity.length);

                let tag = '';
                switch (entity.className) {
                case 'MessageEntityBold':
                    tag = 'strong';
                    break;
                case 'MessageEntityItalic':
                    tag = 'em';
                    break;
                case 'MessageEntityCode':
                    tag = 'code';
                    break;
                case 'MessageEntityPre':
                    tag = 'pre';
                    break;
                case 'MessageEntityUrl':
                case 'MessageEntityTextUrl':
                    tag = 'a';
                    text = `<a href="${entity.url || text}">${text}</a>`;
                    break;
                default:
                    tag = '';
                }

                if (tag && !text.includes('<')) {
                    html = before + `<${tag}>${text}</${tag}>` + after;
                }
            }

            json.rawHtml = html;
        } else {
            json.rawHtml = json.text;
        }

        return json;
    }

    /**
     * Download a specific message with caching
     * @param {Object} chat - Telegram chat entity
     * @param {number} messageId - Message ID to download
     * @param {string} sectionDir - Section directory path
     * @param {boolean} [isReferenced=false] - Whether this is a referenced message
     * @returns {Promise<Object|null>} Message JSON or null if failed
     */
    async downloadMessage(chat, messageId, sectionDir, isReferenced = false) {
        // Check if already downloaded in this session
        if (this.downloadedMessages.has(messageId)) {
            return null;
        }

        // Check if message file already exists
        const subDir = isReferenced ? OUTPUT_DIRS.referenced : '';
        const messageDir = subDir ? path.join(sectionDir, subDir) : sectionDir;
        const filePath = path.join(messageDir, `${messageId}.json`);

        try {
            await fs.access(filePath);
            // Message already exists, load it
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const messageData = JSON.parse(content);
                this.downloadedMessages.add(messageId);
                this.log(`  Using cached message ${messageId}${isReferenced ? ' (referenced)' : ''}`);
                this.stats.incrementMessages('skipped');
                return messageData;
            } catch (err) {
                this.log(`  Corrupted cache for message ${messageId}, re-downloading`);
            }
        } catch {
            // File doesn't exist, continue to download
        }

        try {
            const messages = await this.client.getMessages(chat, {
                ids: [messageId],
            });

            if (messages.length === 0) {
                this.warn(`Message ${messageId} not found`);
                return null;
            }

            const message = messages[0];
            if (!message) {
                this.warn(`Message ${messageId} is null or undefined`);
                return null;
            }

            const messageJson = await this.messageToJson(message, sectionDir);

            // Save message - ensure directory exists
            if (subDir) {
                await fs.mkdir(messageDir, { recursive: true });
            }

            await fs.writeFile(filePath, JSON.stringify(messageJson, null, 2));

            this.downloadedMessages.add(messageId);

            this.log(`Downloaded message ${messageId}${isReferenced ? ' (referenced)' : ''}`);
            this.stats.incrementMessages('downloaded');
            if (isReferenced) {
                this.stats.incrementMessages('referenced');
            }
            return messageJson;
        } catch (err) {
            this.error(`Failed to download message ${messageId}:`, err.message);
            this.stats.incrementMessages('failed');
            this.stats.addError(err, 'message-download', { messageId });
            return null;
        }
    }

    /**
     * Download all referenced messages recursively
     * Follows message links and downloads the entire chain
     * @param {Object} chat - Telegram chat entity
     * @param {number[]} messageIds - Array of message IDs to download
     * @param {string} sectionDir - Section directory path
     * @returns {Promise<Object[]>} Array of downloaded message objects
     */
    async downloadReferencedMessages(chat, messageIds, sectionDir) {
        const toDownload = [...messageIds];
        const downloaded = [];

        while (toDownload.length > 0) {
            const messageId = toDownload.shift();

            const message = await this.downloadMessage(chat, messageId, sectionDir, true);
            if (message) {
                downloaded.push(message);

                // Add new referenced messages to queue
                for (const refId of message.referencedMessages) {
                    if (!this.downloadedMessages.has(refId) && !toDownload.includes(refId)) {
                        toDownload.push(refId);
                    }
                }
            }
        }

        return downloaded;
    }

    /**
     * Download a section with resume capability and integrity checking
     * @param {Object} section - Section configuration object
     * @returns {Promise<Object|null>} Section metadata or null if failed
     */
    async downloadSection(section) {
        this.log(`\nDownloading section: ${section.name}`);

        const sectionDir = path.join(this.outputDir, OUTPUT_DIRS.sections, section.slug);
        await fs.mkdir(sectionDir, { recursive: true });

        // If no pinnedMessageId, download entire topic
        if (!section.pinnedMessageId) {
            return await this.downloadEntireTopic(section, sectionDir);
        }

        // Check if section is already complete and validate integrity
        const metadataPath = path.join(sectionDir, OUTPUT_FILES.metadata);
        try {
            await fs.access(metadataPath);
            try {
                const metadataContent = await fs.readFile(metadataPath, 'utf8');
                const metadata = JSON.parse(metadataContent);
                const pinnedPath = path.join(sectionDir, `${section.pinnedMessageId}.json`);

                try {
                    await fs.access(pinnedPath);
                    // Validate pinned message
                    try {
                        const pinnedContent = await fs.readFile(pinnedPath, 'utf8');
                        const pinnedData = JSON.parse(pinnedContent);
                        if (!pinnedData.id || !pinnedData.text) {
                            throw new Error('Invalid pinned message format');
                        }

                        // Check if all referenced messages exist
                        const missingRefs = [];
                        if (pinnedData.referencedMessages && pinnedData.referencedMessages.length > 0) {
                            const referencedDir = path.join(sectionDir, OUTPUT_DIRS.referenced);
                            try {
                                await fs.access(referencedDir);
                                for (const refId of pinnedData.referencedMessages) {
                                    const refPath = path.join(referencedDir, `${refId}.json`);
                                    try {
                                        await fs.access(refPath);
                                        // Validate referenced message format
                                        try {
                                            const refContent = await fs.readFile(refPath, 'utf8');
                                            const refData = JSON.parse(refContent);
                                            if (!refData.id || !refData.text) {
                                                missingRefs.push(refId);
                                            }
                                        } catch {
                                            missingRefs.push(refId);
                                        }
                                    } catch {
                                        missingRefs.push(refId);
                                    }
                                }
                            } catch {
                                missingRefs.push(...pinnedData.referencedMessages);
                            }
                        }

                        if (missingRefs.length > 0) {
                            this.log(`  Section incomplete: missing ${missingRefs.length} referenced messages`);
                            this.log(`  Missing IDs: ${missingRefs.join(', ')}`);
                            // Continue to download missing messages
                        } else {
                            this.log(
                                '  Section already downloaded and validated ' +
                                `(${metadata.messageCount} messages)`,
                            );
                            this.log(`  Last downloaded: ${metadata.downloadedAt}`);

                            // Load existing messages into memory to avoid re-downloading
                            this.downloadedMessages.add(pinnedData.id);

                            const referencedDir = path.join(sectionDir, OUTPUT_DIRS.referenced);
                            try {
                                const refFiles = await fs.readdir(referencedDir);
                                refFiles.forEach(file => {
                                    if (file.endsWith('.json')) {
                                        const msgId = parseInt(file.split('.')[0]);
                                        this.downloadedMessages.add(msgId);
                                    }
                                });
                            } catch {
                                // Referenced directory doesn't exist, that's ok
                            }

                            return metadata;
                        }
                    } catch (err) {
                        this.log(`  Section validation failed: ${err.message}`);
                        this.log('  Re-downloading section...');
                    }
                } catch {
                    // Pinned file doesn't exist, continue to download
                }
            } catch (err) {
                this.log('  Metadata corrupted, re-downloading section');
            }
        } catch {
            // Metadata doesn't exist, continue to download
        }

        const chat = await this.getChat();

        // Download pinned message
        const pinnedMessage = await this.downloadMessage(
            chat,
            section.pinnedMessageId,
            sectionDir,
        );

        if (!pinnedMessage) {
            this.error(`Failed to download pinned message for section ${section.name}`);
            return null;
        }

        // Download referenced messages
        if (pinnedMessage.referencedMessages.length > 0) {
            this.log(`Downloading ${pinnedMessage.referencedMessages.length} referenced messages...`);
            await this.downloadReferencedMessages(
                chat,
                pinnedMessage.referencedMessages,
                sectionDir,
            );
        }

        // Save section metadata
        const metadata = {
            slug: section.slug,
            name: section.name,
            topicId: section.topicId,
            pinnedMessageId: section.pinnedMessageId,
            downloadedAt: new Date().toISOString(),
            messageCount: this.downloadedMessages.size,
        };

        await fs.writeFile(
            path.join(sectionDir, OUTPUT_FILES.metadata),
            JSON.stringify(metadata, null, 2),
        );

        // Create a copy for pinned.json for compatibility
        const pinnedPath = path.join(sectionDir, `${section.pinnedMessageId}.json`);
        const pinnedLinkPath = path.join(sectionDir, OUTPUT_FILES.pinned);
        try {
            await fs.access(pinnedPath);
            try {
                await fs.access(pinnedLinkPath);
            } catch {
                await fs.copyFile(pinnedPath, pinnedLinkPath);
            }
        } catch {
            // Pinned file doesn't exist
        }

        this.stats.addSection(section.slug, {
            name: section.name,
            messageCount: metadata.messageCount,
            pinnedMessageId: section.pinnedMessageId,
        });

        return metadata;
    }

    /**
     * Download entire topic (all messages in a topic)
     * @param {Object} section - Section configuration
     * @param {string} sectionDir - Section directory path
     * @returns {Promise<Object>} Section metadata
     */
    async downloadEntireTopic(section, sectionDir) {
        const chat = await this.getChat();
        const downloadConfig = await this.getDownloadConfig();
        const allMessages = [];
        let offsetId = 0;
        const limit = downloadConfig.messagesPerRequest;
        let hasMore = true;

        this.log(`Downloading all messages from topic ${section.topicId}...`);

        while (hasMore) {
            try {
                this.log(`Fetching messages (offset: ${offsetId})...`);

                const messages = await this.client.getMessages(chat, {
                    limit: limit,
                    offsetId: offsetId,
                    replyTo: section.topicId,
                });

                if (messages.length === 0) {
                    hasMore = false;
                    break;
                }

                this.log(`Downloaded ${messages.length} messages`);

                for (const message of messages) {
                    if (this.downloadedMessages.has(message.id)) {
                        continue;
                    }

                    const messageJson = await this.messageToJson(message, sectionDir);
                    allMessages.push(messageJson);

                    // Save message
                    const filePath = path.join(sectionDir, `${message.id}.json`);
                    await fs.writeFile(filePath, JSON.stringify(messageJson, null, 2));
                    this.downloadedMessages.add(message.id);
                }

                offsetId = messages[messages.length - 1].id;

                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, downloadConfig.rateLimitDelayMs));

            } catch (err) {
                this.error(`Error fetching messages: ${err.message}`);
                hasMore = false;
            }
        }

        // Download reply if specified
        if (section.replyToId) {
            this.log(`Downloading reply message ${section.replyToId}...`);
            await this.downloadMessage(chat, section.replyToId, sectionDir, true);
        }

        // Save section metadata
        const metadata = {
            slug: section.slug,
            name: section.name,
            topicId: section.topicId,
            replyToId: section.replyToId,
            downloadedAt: new Date().toISOString(),
            messageCount: allMessages.length,
            downloadType: 'entire-topic',
        };

        await fs.writeFile(
            path.join(sectionDir, OUTPUT_FILES.metadata),
            JSON.stringify(metadata, null, 2),
        );

        this.log(`Downloaded ${allMessages.length} messages from topic ${section.topicId}`);
        return metadata;
    }

    /**
     * Download all sections with progress tracking
     */
    async downloadAll() {
        this.stats.start();
        const sections = await this.config.getSections();
        const results = [];

        // Create output directory
        try {
            await fs.access(this.outputDir);
        } catch {
            await fs.mkdir(this.outputDir, { recursive: true });
        }

        // Load existing index to track progress
        let existingIndex = null;
        const indexPath = path.join(this.outputDir, OUTPUT_FILES.index);
        try {
            await fs.access(indexPath);
            try {
                const indexContent = await fs.readFile(indexPath, 'utf8');
                existingIndex = JSON.parse(indexContent);
                this.log('\nResuming previous download...');
                this.log(`Previously downloaded sections: ${existingIndex.sections?.length || 0}`);
            } catch (err) {
                this.log('Could not load previous index, starting fresh');
            }
        } catch {
            // Index file doesn't exist, that's ok
        }

        for (const section of sections) {
            // Check if section exists in index but validate integrity
            if (existingIndex?.sections?.some(s => s.slug === section.slug)) {
                this.log(`\nChecking ${section.name} for integrity...`);
                // downloadSection will validate and re-download if needed
            }

            const result = await this.downloadSection(section);
            if (result) {
                results.push(result);

                // Save progress after each section
                const partialIndex = {
                    chat: await this.config.getChatName(),
                    downloadedAt: new Date().toISOString(),
                    sections: results,
                    totalMessages: this.downloadedMessages.size,
                    downloadMethod: 'telegram-api',
                };

                await fs.writeFile(indexPath, JSON.stringify(partialIndex, null, 2));
                this.log(`  Progress saved (${results.length}/${sections.length} sections)`);
            }
        }

        // Save final index
        const index = {
            chat: await this.config.getChatName(),
            downloadedAt: new Date().toISOString(),
            sections: results,
            totalMessages: this.downloadedMessages.size,
        };

        await fs.writeFile(
            path.join(this.outputDir, OUTPUT_FILES.index),
            JSON.stringify(index, null, 2),
        );

        this.log('\nDownload complete!');
        this.log(`Total sections: ${results.length}`);
        this.log(`Total messages: ${this.downloadedMessages.size}`);
        this.log(`Output directory: ${this.outputDir}`);

        this.stats.stop();
        this.stats.printSummary();

        return index;
    }

    /**
     * Download additional messages
     */
    async downloadAdditionalMessages() {
        const messages = await this.config.getAdditionalMessages();
        if (messages.length === 0) {
            this.log('\nNo additional messages to download');
            return [];
        }

        this.log(`\nDownloading ${messages.length} additional messages...`);
        const results = [];
        const chat = await this.getChat();

        for (const msgConfig of messages) {
            this.log(`\nDownloading: ${msgConfig.name}`);

            // Create directory for this message
            const msgDir = path.join(this.outputDir, OUTPUT_DIRS.additional, msgConfig.slug);
            try {
                await fs.access(msgDir);
            } catch {
                await fs.mkdir(msgDir, { recursive: true });
            }

            // Download the main message
            const message = await this.downloadMessage(chat, msgConfig.messageId, msgDir);
            if (message) {
                results.push({
                    ...msgConfig,
                    message: message,
                });

                // Download referenced messages
                if (message.referencedMessages.length > 0) {
                    this.log(`Downloading ${message.referencedMessages.length} referenced messages...`);
                    await this.downloadReferencedMessages(chat, message.referencedMessages, msgDir);
                }

                // Download replies if specified
                if (msgConfig.downloadReplies && msgConfig.replyToId) {
                    this.log(`Downloading reply message ${msgConfig.replyToId}...`);
                    await this.downloadMessage(chat, msgConfig.replyToId, msgDir, true);
                }
            }
        }

        // Save metadata
        const metadataPath = path.join(this.outputDir, OUTPUT_DIRS.additional, OUTPUT_FILES.metadata);
        await fs.writeFile(metadataPath, JSON.stringify({
            downloadedAt: new Date().toISOString(),
            messages: results.map(r => ({
                name: r.name,
                slug: r.slug,
                messageId: r.messageId,
                hasReplies: r.downloadReplies,
            })),
        }, null, 2));

        this.log(`\nDownloaded ${results.length} additional messages`);
        return results;
    }

    /**
     * Download specific section by slug
     * @param {string} slug - Section slug from config
     * @returns {Promise<Object>} Section metadata
     * @throws {Error} If section not found in config
     */
    async downloadSectionBySlug(slug) {
        const section = await this.config.getSection(slug);
        if (!section) {
            throw new Error(`Section "${slug}" not found`);
        }

        return await this.downloadSection(section);
    }

    /**
     * Close client connection gracefully
     * Handles timeout errors during disconnect
     * @returns {Promise<void>}
     */
    async close() {
        if (this.client) {
            this.log('\nDisconnecting from Telegram...');
            try {
                // Force disconnect without waiting for updates
                await this.client.disconnect();
            } catch (err) {
                // Ignore timeout errors during disconnect
                if (!err.message.includes('TIMEOUT')) {
                    this.error('Disconnect error:', err.message);
                }
            }
        }
    }
}

module.exports = TelegramDownloader;
