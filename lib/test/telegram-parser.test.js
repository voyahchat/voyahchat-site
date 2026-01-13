const test = require('ava');
const { TelegramParser } = require('../telegram/parser');

test('TelegramParser.extractReferencedMessages() - should extract message IDs from text', (t) => {
    // Test with various formats
    const text1 = 'See message https://t.me/testchat/123 for details';
    const refs1 = TelegramParser.extractReferencedMessages(text1);
    t.deepEqual(refs1, [123]);

    const text2 = 'Check https://t.me/testchat/456 and https://t.me/testchat/789';
    const refs2 = TelegramParser.extractReferencedMessages(text2);
    t.deepEqual(refs2, [456, 789]);

    const text3 = 'No references here';
    const refs3 = TelegramParser.extractReferencedMessages(text3);
    t.deepEqual(refs3, []);

    const text4 = 'Mixed text with https://t.me/testchat/999 and more text';
    const refs4 = TelegramParser.extractReferencedMessages(text4);
    t.deepEqual(refs4, [999]);
});

test('TelegramParser.extractReferencedMessages() - should handle edge cases', (t) => {
    // Test with duplicate references
    const text1 = 'See https://t.me/testchat/123 and https://t.me/testchat/123 again';
    const refs1 = TelegramParser.extractReferencedMessages(text1);
    t.deepEqual(refs1, [123]); // Duplicates are removed

    // Test with invalid URLs
    const text2 = 'Invalid https://t.me/ and https://t.me/testchat/abc';
    const refs2 = TelegramParser.extractReferencedMessages(text2);
    t.deepEqual(refs2, []);

    // Test with different chat names
    const text3 = 'From https://t.me/otherchat/456 and https://t.me/testchat/789';
    const refs3 = TelegramParser.extractReferencedMessages(text3);
    t.deepEqual(refs3, [456, 789]);

    // Test with trailing punctuation
    const text4 = 'See https://t.me/testchat/123. And more!';
    const refs4 = TelegramParser.extractReferencedMessages(text4);
    t.deepEqual(refs4, [123]);
});

test('TelegramParser.parseMessage() - should parse basic message', (t) => {
    const message = {
        id: 123,
        message: 'Hello world',
        date: new Date('2024-01-01T12:00:00Z'),
    };

    const parsed = TelegramParser.parseMessage(message);
    t.is(parsed.id, 123);
    t.is(parsed.text, 'Hello world');
    t.is(parsed.date, '2024-01-01T12:00:00.000Z');
    t.deepEqual(parsed.entities, []);
    t.deepEqual(parsed.media, []);
    t.deepEqual(parsed.referencedMessages, []);
});

test('TelegramParser.parseMessage() - should parse message with entities', (t) => {
    const message = {
        id: 456,
        message: 'Bold and italic text',
        date: '2024-01-01T12:00:00Z',
        entities: [
            { className: 'MessageEntityBold', offset: 0, length: 4 },
            { className: 'MessageEntityItalic', offset: 9, length: 6 },
        ],
    };

    const parsed = TelegramParser.parseMessage(message);
    t.is(parsed.text, 'Bold and italic text');
    t.is(parsed.entities.length, 2);
    t.is(parsed.entities[0].className, 'MessageEntityBold');
    t.is(parsed.entities[1].className, 'MessageEntityItalic');
});

test('TelegramParser.parseMessage() - should extract references from text', (t) => {
    const message = {
        id: 789,
        message: 'See https://t.me/testchat/123 for details',
        date: new Date(),
    };

    const parsed = TelegramParser.parseMessage(message);
    t.deepEqual(parsed.referencedMessages, [123]);
});

test('TelegramParser.parseMessage() - should handle message without text', (t) => {
    const message = {
        id: 999,
        date: new Date(),
        media: { className: 'MessageMediaPhoto' },
    };

    const parsed = TelegramParser.parseMessage(message);
    t.is(parsed.text, '');
    t.deepEqual(parsed.referencedMessages, []);
});

test('TelegramParser.parseMessage() - should convert date to ISO string', (t) => {
    const date = new Date('2024-01-15T10:30:45.123Z');
    const message = {
        id: 111,
        message: 'Test',
        date: date,
    };

    const parsed = TelegramParser.parseMessage(message);
    t.is(parsed.date, '2024-01-15T10:30:45.123Z');
});

test('TelegramParser.parseMessage() - should handle string date', (t) => {
    const message = {
        id: 222,
        message: 'Test',
        date: '2024-01-20T15:45:30Z',
    };

    const parsed = TelegramParser.parseMessage(message);
    t.is(parsed.date, '2024-01-20T15:45:30.000Z');
});

test('TelegramParser.parseMessage() - should handle missing date', (t) => {
    const message = {
        id: 333,
        message: 'Test',
    };

    const parsed = TelegramParser.parseMessage(message);
    t.is(typeof parsed.date, 'string');
    // Should be a valid ISO date string
    t.regex(parsed.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Should be current date (within same day)
    const now = new Date().toISOString();
    t.is(parsed.date.substring(0, 10), now.substring(0, 10));
});

test('TelegramParser.parseUrl() - should parse valid t.me URLs', (t) => {
    // URL with topic and message
    const result1 = TelegramParser.parseUrl('https://t.me/testchat/123/456');
    t.deepEqual(result1, { topicId: 123, messageId: 456 });

    // URL with only message (no topic)
    const result2 = TelegramParser.parseUrl('https://t.me/testchat/789');
    t.deepEqual(result2, { topicId: null, messageId: 789 });

    // HTTP URL
    const result3 = TelegramParser.parseUrl('http://t.me/chat/111');
    t.deepEqual(result3, { topicId: null, messageId: 111 });
});

test('TelegramParser.parseUrl() - should return null for invalid URLs', (t) => {
    t.is(TelegramParser.parseUrl('https://example.com'), null);
    t.is(TelegramParser.parseUrl('https://t.me/'), null);
    t.is(TelegramParser.parseUrl('not a url'), null);
    t.is(TelegramParser.parseUrl(''), null);
});

test('TelegramParser.hasLinks() - should detect t.me links', (t) => {
    t.true(TelegramParser.hasLinks('Check https://t.me/testchat/123'));
    t.true(TelegramParser.hasLinks('See http://t.me/chat'));
    t.true(TelegramParser.hasLinks('Multiple https://t.me/a and https://t.me/b'));
});

test('TelegramParser.hasLinks() - should return false when no links', (t) => {
    t.false(TelegramParser.hasLinks('No links here'));
    t.false(TelegramParser.hasLinks('https://example.com is not telegram'));
    t.false(TelegramParser.hasLinks(''));
    t.false(TelegramParser.hasLinks(null));
    t.false(TelegramParser.hasLinks(undefined));
});
