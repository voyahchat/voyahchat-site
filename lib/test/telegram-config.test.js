const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { TestDir } = require('./test-dir');
const { TelegramConfig } = require('../telegram/config');

test.beforeEach(async (t) => {
    // Create test directory
    const dir = new TestDir();
    t.context.dir = dir;
    t.context.configPath = path.join(dir.getConfig(), 'telegram.yml');
    t.context.authPath = path.join(dir.getConfig(), 'auth-telegram.yml');

    // Create test config files using YAML format
    const telegramYaml = yaml.dump({
        chat: 'testchat',
        sections: [
            { name: 'Test Section', slug: 'test', topicId: 123, pinnedMessageId: 456 },
        ],
        additionalMessages: [
            { name: 'Test Message', slug: 'test-msg', messageId: 789 },
        ],
        download: {
            maxRetries: 5,
            retryDelayBaseMs: 1000,
            timeoutBaseMs: 30000,
        },
    });

    const authYaml = yaml.dump({
        api_id: 123456,
        api_hash: 'test_hash',
        phone: '+1234567890',
        session: 'test_session',
    });

    await fs.writeFile(t.context.configPath, telegramYaml);
    await fs.writeFile(t.context.authPath, authYaml);

    // Create TelegramConfig instance with test directory
    t.context.config = new TelegramConfig(dir.getRoot());
});

test('TelegramConfig.getChatName() - should return chat name', async (t) => {
    const chatName = await t.context.config.getChatName();
    t.is(chatName, 'testchat');
});

test('TelegramConfig.getSections() - should return sections array', async (t) => {
    const sections = await t.context.config.getSections();
    t.is(sections.length, 1);
    t.is(sections[0].name, 'Test Section');
    t.is(sections[0].slug, 'test');
    t.is(sections[0].topicId, 123);
    t.is(sections[0].pinnedMessageId, 456);
});

test('TelegramConfig.getSection() - should return section by slug', async (t) => {
    const section = await t.context.config.getSection('test');
    t.is(typeof section, 'object');
    t.is(section.name, 'Test Section');
    t.is(section.slug, 'test');
    t.is(section.topicId, 123);
    t.is(section.pinnedMessageId, 456);

    const notFound = await t.context.config.getSection('nonexistent');
    t.is(notFound, undefined);
});

test('TelegramConfig.getAdditionalMessages() - should return additional messages', async (t) => {
    const messages = await t.context.config.getAdditionalMessages();
    t.is(messages.length, 1);
    t.is(messages[0].name, 'Test Message');
    t.is(messages[0].slug, 'test-msg');
    t.is(messages[0].messageId, 789);
});

test('TelegramConfig.getDownloadConfig() - should return download config with defaults', async (t) => {
    const config = await t.context.config.getDownloadConfig();

    // Should have custom values from config
    t.is(config.maxRetries, 5);
    t.is(config.retryDelayBaseMs, 1000);
    t.is(config.timeoutBaseMs, 30000);

    // Should have default values for missing config
    t.is(config.retryDelayMaxMs, 60000);
    t.is(config.retryJitterMs, 1000);
    t.is(config.timeoutPerMbMs, 30000);
    t.is(config.timeoutMaxMs, 600000);
    t.is(config.connectionRetries, 5);
    t.is(config.connectionTimeoutMs, 30000);
    t.is(config.messagesPerRequest, 100);
    t.is(config.rateLimitDelayMs, 1000);
});

test('TelegramConfig.loadAuthConfig() - should load auth config', async (t) => {
    const authConfig = await t.context.config.loadAuthConfig();
    t.is(authConfig.api_id, 123456);
    t.is(authConfig.api_hash, 'test_hash');
    t.is(authConfig.phone, '+1234567890');
    t.is(authConfig.session, 'test_session');
});

test('TelegramConfig.saveAuthConfig() - should save auth config', async (t) => {
    const newConfig = {
        api_id: 654321,
        api_hash: 'new_hash',
        phone: '+0987654321',
        session: 'new_session',
    };

    await t.context.config.saveAuthConfig(newConfig);

    // Verify saved config
    const savedContent = await fs.readFile(t.context.authPath, 'utf8');
    const savedConfig = yaml.load(savedContent);
    t.is(savedConfig.api_id, 654321);
    t.is(savedConfig.api_hash, 'new_hash');
    t.is(savedConfig.phone, '+0987654321');
    t.is(savedConfig.session, 'new_session');
});

test('TelegramConfig - should handle missing config file gracefully', async (t) => {
    // Remove config file
    await fs.unlink(t.context.configPath);

    // Reset cache to force reload
    t.context.config.telegramConfig = null;

    // Should throw error for missing config
    await t.throwsAsync(async () => await t.context.config.getSections(), {
        message: /Failed to load telegram config/,
    });
});

test('TelegramConfig - should handle missing download config', async (t) => {
    // Create config without download section
    const configYaml = yaml.dump({
        chat: 'testchat',
        sections: [],
    });
    await fs.writeFile(t.context.configPath, configYaml);

    // Reset cache to force reload
    t.context.config.telegramConfig = null;

    const config = await t.context.config.getDownloadConfig();

    // Should return all default values
    t.is(config.maxRetries, 10);
    t.is(config.retryDelayBaseMs, 2000);
    t.is(config.retryDelayMaxMs, 60000);
    t.is(config.retryJitterMs, 1000);
    t.is(config.timeoutBaseMs, 60000);
    t.is(config.timeoutPerMbMs, 30000);
    t.is(config.timeoutMaxMs, 600000);
    t.is(config.connectionRetries, 5);
    t.is(config.connectionTimeoutMs, 30000);
    t.is(config.messagesPerRequest, 100);
    t.is(config.rateLimitDelayMs, 1000);
});
