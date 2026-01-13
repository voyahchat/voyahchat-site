const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { TestDir } = require('./test-dir');

// Import the auth module functions
const { checkAuthStatus, auth } = require('../telegram/auth');

test.beforeEach(async (t) => {
    // Create test directory
    const dir = new TestDir();
    t.context.dir = dir;
    t.context.configPath = path.join(dir.getConfig(), 'telegram.yml');
    t.context.authPath = path.join(dir.getConfig(), 'auth-telegram.yml');
});

test('checkAuthStatus() - should be a function', (t) => {
    t.is(typeof checkAuthStatus, 'function');
});

test('auth() - should be a function', (t) => {
    t.is(typeof auth, 'function');
});

test('checkAuthStatus() - should handle missing config gracefully', async (t) => {
    // checkAuthStatus uses console.log which is suppressed in test mode
    // It should not throw when config is missing
    // The function catches errors internally and logs them
    await t.notThrowsAsync(async () => {
        // Note: This will use the real config path, not test directory
        // The function handles missing config gracefully
        await checkAuthStatus();
    });
});

test('auth module - should export both functions', (t) => {
    const authModule = require('../telegram/auth');

    t.is(typeof authModule.auth, 'function');
    t.is(typeof authModule.checkAuthStatus, 'function');
});

test('TelegramConfig - should work with test directory for auth', async (t) => {
    const { TelegramConfig } = require('../telegram/config');

    // Create test config files
    const telegramYaml = yaml.dump({
        chat: 'testchat',
        sections: [
            { name: 'Test Section', slug: 'test', topicId: 123, pinnedMessageId: 456 },
        ],
    });

    const authYaml = yaml.dump({
        api_id: 123456,
        api_hash: 'test_hash',
        phone: '+1234567890',
        session: 'test_session_string',
    });

    await fs.writeFile(t.context.configPath, telegramYaml);
    await fs.writeFile(t.context.authPath, authYaml);

    // Create config with test directory
    const config = new TelegramConfig(t.context.dir.getRoot());

    // Verify auth config can be loaded
    const authConfig = await config.loadAuthConfig();
    t.is(authConfig.api_id, 123456);
    t.is(authConfig.api_hash, 'test_hash');
    t.is(authConfig.phone, '+1234567890');
    t.is(authConfig.session, 'test_session_string');
});

test('TelegramConfig - should detect session exists', async (t) => {
    const { TelegramConfig } = require('../telegram/config');

    // Create config with session
    const authYaml = yaml.dump({
        api_id: 123456,
        api_hash: 'test_hash',
        phone: '+1234567890',
        session: 'existing_session',
    });

    const telegramYaml = yaml.dump({
        chat: 'testchat',
        sections: [],
    });

    await fs.writeFile(t.context.configPath, telegramYaml);
    await fs.writeFile(t.context.authPath, authYaml);

    const config = new TelegramConfig(t.context.dir.getRoot());
    const authConfig = await config.loadAuthConfig();

    const sessionExists = !!(authConfig && authConfig.session);
    t.true(sessionExists);
});

test('TelegramConfig - should detect session missing', async (t) => {
    const { TelegramConfig } = require('../telegram/config');

    // Create config without session
    const authYaml = yaml.dump({
        api_id: 123456,
        api_hash: 'test_hash',
        phone: '+1234567890',
        // No session field
    });

    const telegramYaml = yaml.dump({
        chat: 'testchat',
        sections: [],
    });

    await fs.writeFile(t.context.configPath, telegramYaml);
    await fs.writeFile(t.context.authPath, authYaml);

    const config = new TelegramConfig(t.context.dir.getRoot());
    const authConfig = await config.loadAuthConfig();

    const sessionExists = !!(authConfig && authConfig.session);
    t.false(sessionExists);
});

test('TelegramConfig - should throw for missing auth config', async (t) => {
    const { TelegramConfig } = require('../telegram/config');

    // Create only telegram config, not auth config
    const telegramYaml = yaml.dump({
        chat: 'testchat',
        sections: [],
    });

    await fs.writeFile(t.context.configPath, telegramYaml);
    // Do NOT create auth config file

    const config = new TelegramConfig(t.context.dir.getRoot());

    await t.throwsAsync(async () => {
        await config.loadAuthConfig();
    }, {
        message: /Authentication config not found/,
    });
});
