const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');

// We need to mock the telegram client, so we test only the non-client methods
// For now, we test the constructor and configuration

test.beforeEach(async (t) => {
    const dir = new TestDir();
    t.context.dir = dir;

    // Create minimal config files for TelegramConfig
    const configDir = dir.getConfig();
    const yaml = require('js-yaml');

    const telegramYaml = yaml.dump({
        chat: 'testchat',
        sections: [
            { name: 'Test Section', slug: 'test', topicId: 123, pinnedMessageId: 456 },
        ],
        download: {
            maxRetries: 3,
            timeoutBaseMs: 10000,
        },
    });

    const authYaml = yaml.dump({
        api_id: 123456,
        api_hash: 'test_hash',
        phone: '+1234567890',
    });

    await fs.writeFile(path.join(configDir, 'telegram.yml'), telegramYaml);
    await fs.writeFile(path.join(configDir, 'auth-telegram.yml'), authYaml);
});

test('TelegramDownloader() - should initialize with default options', async (t) => {
    // Import here to avoid issues with config loading
    const { TelegramConfig } = require('../telegram/config');

    // Create config with test directory
    const config = new TelegramConfig(t.context.dir.getRoot());

    t.is(await config.getChatName(), 'testchat');
    t.is((await config.getSections()).length, 1);
});

test('TelegramDownloader() - should load download config with custom values', async (t) => {
    const { TelegramConfig } = require('../telegram/config');
    const config = new TelegramConfig(t.context.dir.getRoot());

    const downloadConfig = await config.getDownloadConfig();

    t.is(downloadConfig.maxRetries, 3);
    t.is(downloadConfig.timeoutBaseMs, 10000);
    // Default values should still be present
    t.is(downloadConfig.retryDelayBaseMs, 2000);
});

test('TelegramParser.extractReferencedMessages() - integration with download', (t) => {
    const { TelegramParser } = require('../telegram/parser');

    const text = 'Check https://t.me/testchat/123 and https://t.me/testchat/456';
    const refs = TelegramParser.extractReferencedMessages(text);

    t.deepEqual(refs, [123, 456]);
});

test('TelegramParser.parseMessage() - should parse message for download', (t) => {
    const { TelegramParser } = require('../telegram/parser');

    const message = {
        id: 789,
        message: 'Test message with https://t.me/chat/123',
        date: new Date('2024-01-01T12:00:00Z'),
        entities: [
            { className: 'MessageEntityBold', offset: 0, length: 4 },
        ],
    };

    const parsed = TelegramParser.parseMessage(message);

    t.is(parsed.id, 789);
    t.is(parsed.text, 'Test message with https://t.me/chat/123');
    t.deepEqual(parsed.referencedMessages, [123]);
    t.is(parsed.entities.length, 1);
});

test('Constants - should export all required constants', (t) => {
    const constants = require('../telegram/constants');

    t.is(typeof constants.BYTES_PER_MB, 'number');
    t.is(typeof constants.DEFAULT_DOWNLOAD_CONFIG, 'object');
    t.is(typeof constants.MEDIA_EXTENSIONS, 'object');
    t.is(typeof constants.OUTPUT_DIRS, 'object');
    t.is(typeof constants.OUTPUT_FILES, 'object');

    t.is(constants.BYTES_PER_MB, 1024 * 1024);
    t.is(constants.MEDIA_EXTENSIONS.PHOTO, 'jpg');
    t.is(constants.OUTPUT_DIRS.sections, 'sections');
    t.is(constants.OUTPUT_FILES.index, 'index.json');
});

test('Retry utility - should work with download module', async (t) => {
    const { executeWithRetry } = require('../telegram/retry');

    let attempts = 0;
    const operation = async () => {
        attempts++;
        if (attempts < 2) {
            throw new Error('Temporary failure');
        }
        return 'success';
    };

    const result = await executeWithRetry(operation, {
        maxRetries: 3,
        baseDelayMs: 10,
        jitterMs: 0,
    });

    t.is(result, 'success');
    t.is(attempts, 2);
});

test('Retry utility - calculateTimeout should work correctly', (t) => {
    const { calculateTimeout } = require('../telegram/retry');
    const { BYTES_PER_MB } = require('../telegram/constants');

    const timeout1Mb = calculateTimeout(BYTES_PER_MB, 60000, 30000, 600000);
    t.is(timeout1Mb, 90000); // 60000 + 30000

    const timeout5Mb = calculateTimeout(5 * BYTES_PER_MB, 60000, 30000, 600000);
    t.is(timeout5Mb, 210000); // 60000 + 5*30000
});
