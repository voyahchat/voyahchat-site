const test = require('ava');
const { DownloadStatistics } = require('../telegram/statistics');

test('DownloadStatistics() - should initialize with empty stats', (t) => {
    const stats = new DownloadStatistics();

    t.is(stats.startTime, null);
    t.is(stats.endTime, null);
    t.is(stats.messages.total, 0);
    t.is(stats.messages.downloaded, 0);
    t.is(stats.media.total, 0);
    t.is(stats.errors.length, 0);
});

test('DownloadStatistics.start() - should set start time', (t) => {
    const stats = new DownloadStatistics();
    const before = new Date();

    stats.start();

    const after = new Date();
    t.not(stats.startTime, null);
    t.true(stats.startTime >= before);
    t.true(stats.startTime <= after);
});

test('DownloadStatistics.stop() - should set end time', (t) => {
    const stats = new DownloadStatistics();
    stats.start();
    const before = new Date();

    stats.stop();

    const after = new Date();
    t.not(stats.endTime, null);
    t.true(stats.endTime >= before);
    t.true(stats.endTime <= after);
});

test('DownloadStatistics.incrementMessages() - should increment message count', (t) => {
    const stats = new DownloadStatistics();

    stats.incrementMessages('total', 5);
    stats.incrementMessages('downloaded', 3);
    stats.incrementMessages('skipped', 1);
    stats.incrementMessages('failed', 1);

    t.is(stats.messages.total, 5);
    t.is(stats.messages.downloaded, 3);
    t.is(stats.messages.skipped, 1);
    t.is(stats.messages.failed, 1);
});

test('DownloadStatistics.incrementMessages() - should default to increment by 1', (t) => {
    const stats = new DownloadStatistics();

    stats.incrementMessages('total');
    stats.incrementMessages('total');

    t.is(stats.messages.total, 2);
});

test('DownloadStatistics.incrementMessages() - should ignore invalid types', (t) => {
    const stats = new DownloadStatistics();

    stats.incrementMessages('invalid', 5);

    t.is(stats.messages.total, 0);
});

test('DownloadStatistics.incrementMedia() - should increment media count and size', (t) => {
    const stats = new DownloadStatistics();

    stats.incrementMedia('total', 1024 * 1024);
    stats.incrementMedia('downloaded', 512 * 1024);

    t.is(stats.media.total, 1);
    t.is(stats.media.downloaded, 1);
    t.is(stats.media.totalSize, 1024 * 1024);
    t.is(stats.media.downloadedSize, 512 * 1024);
});

test('DownloadStatistics.addError() - should add error to list', (t) => {
    const stats = new DownloadStatistics();
    const error = new Error('Test error');

    stats.addError(error, 'download', { messageId: 123 });

    t.is(stats.errors.length, 1);
    t.is(stats.errors[0].message, 'Test error');
    t.is(stats.errors[0].context, 'download');
    t.is(stats.errors[0].metadata.messageId, 123);
});

test('DownloadStatistics.addError() - should limit errors to 100', (t) => {
    const stats = new DownloadStatistics();

    for (let i = 0; i < 150; i++) {
        stats.addError(new Error(`Error ${i}`), 'test');
    }

    t.is(stats.errors.length, 100);
    t.is(stats.errors[0].message, 'Error 50');
    t.is(stats.errors[99].message, 'Error 149');
});

test('DownloadStatistics.addRetry() - should track retry statistics', (t) => {
    const stats = new DownloadStatistics();

    stats.addRetry('download', 3);
    stats.addRetry('download', 2);
    stats.addRetry('media', 4);

    t.is(stats.retries.total, 6); // (3-1) + (2-1) + (4-1)
    t.is(stats.retries.byType.get('download').count, 2);
    t.is(stats.retries.byType.get('download').totalAttempts, 5);
    t.is(stats.retries.byType.get('media').count, 1);
    t.is(stats.retries.byType.get('media').totalAttempts, 4);
});

test('DownloadStatistics.addTimeout() - should track timeout statistics', (t) => {
    const stats = new DownloadStatistics();

    stats.addTimeout(500 * 1024, 30000); // < 1MB
    stats.addTimeout(5 * 1024 * 1024, 60000); // 1-10MB
    stats.addTimeout(50 * 1024 * 1024, 120000); // 50MB -> 50-100MB

    t.is(stats.timeouts.total, 3);
    t.is(stats.timeouts.bySize.get('< 1MB').count, 1);
    t.is(stats.timeouts.bySize.get('1-10MB').count, 1);
    t.is(stats.timeouts.bySize.get('50-100MB').count, 1);
});

test('DownloadStatistics.getSizeRange() - should categorize sizes correctly', (t) => {
    const stats = new DownloadStatistics();

    t.is(stats.getSizeRange(500 * 1024), '< 1MB');
    t.is(stats.getSizeRange(5 * 1024 * 1024), '1-10MB');
    t.is(stats.getSizeRange(30 * 1024 * 1024), '10-50MB');
    t.is(stats.getSizeRange(75 * 1024 * 1024), '50-100MB');
    t.is(stats.getSizeRange(150 * 1024 * 1024), '> 100MB');
});

test('DownloadStatistics.getDuration() - should calculate duration', (t) => {
    const stats = new DownloadStatistics();

    t.is(stats.getDuration(), 0);

    stats.start();
    // Simulate some time passing
    stats.startTime = new Date(Date.now() - 5000);
    stats.stop();

    const duration = stats.getDuration();
    t.true(duration >= 4900 && duration <= 5100);
});

test('DownloadStatistics.getSuccessRate() - should calculate success rate', (t) => {
    const stats = new DownloadStatistics();

    t.is(stats.getSuccessRate(), 0);

    stats.incrementMessages('total', 10);
    stats.incrementMessages('downloaded', 8);

    t.is(stats.getSuccessRate(), 80);
});

test('DownloadStatistics.getMediaSuccessRate() - should calculate media success rate', (t) => {
    const stats = new DownloadStatistics();

    t.is(stats.getMediaSuccessRate(), 0);

    stats.incrementMedia('total', 1024);
    stats.incrementMedia('total', 1024);
    stats.incrementMedia('total', 1024);
    stats.incrementMedia('total', 1024);
    stats.incrementMedia('downloaded', 512);
    stats.incrementMedia('downloaded', 512);
    stats.incrementMedia('downloaded', 512);

    t.is(stats.getMediaSuccessRate(), 75);
});

test('DownloadStatistics.getAverageRetries() - should calculate average retries', (t) => {
    const stats = new DownloadStatistics();

    t.is(stats.getAverageRetries(), 0);

    stats.addRetry('download', 3); // 2 retries
    stats.addRetry('download', 5); // 4 retries
    // Total: 6 retries, 2 operations, average = 3

    const avg = stats.getAverageRetries();
    t.is(avg, 3);
});

test('DownloadStatistics.getStatistics() - should return formatted stats', (t) => {
    const stats = new DownloadStatistics();
    stats.start();
    stats.incrementMessages('total', 10);
    stats.incrementMessages('downloaded', 8);
    stats.incrementMedia('total', 1024 * 1024);
    stats.incrementMedia('downloaded', 512 * 1024);
    stats.stop();

    const result = stats.getStatistics();

    t.is(typeof result.duration, 'object');
    t.is(result.duration.start, stats.startTime.toISOString());
    t.is(result.messages.total, 10);
    t.is(result.messages.downloaded, 8);
    t.is(result.messages.successRate, 80);
    t.is(result.media.total, 1);
    t.is(result.sections.total, 0);
});

test('DownloadStatistics.reset() - should clear all statistics', (t) => {
    const stats = new DownloadStatistics();
    stats.start();
    stats.incrementMessages('total', 10);
    stats.addError(new Error('test'), 'test');

    stats.reset();

    t.is(stats.startTime, null);
    t.is(stats.messages.total, 0);
    t.is(stats.errors.length, 0);
});

test('DownloadStatistics.addSection() - should add section statistics', (t) => {
    const stats = new DownloadStatistics();

    stats.addSection('test-section', {
        messageCount: 10,
        mediaCount: 5,
    });

    t.is(stats.sections.size, 1);
    t.is(stats.sections.get('test-section').messageCount, 10);
});
