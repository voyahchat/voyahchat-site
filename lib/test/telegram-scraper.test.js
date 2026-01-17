const test = require('ava');
const path = require('path');
const fs = require('fs').promises;
const { WebScraper, CACHE_FILE } = require('../telegram/scraper');
const { TestDir } = require('./test-dir');

test('WebScraper.extractExternalUrls() - should extract URLs from text', (t) => {
    const scraper = new WebScraper();

    // Basic URL extraction
    const text1 = 'Check out https://drive2.ru/article/123 for details';
    const urls1 = scraper.extractExternalUrls(text1);
    t.deepEqual(urls1, ['https://drive2.ru/article/123']);

    // Multiple URLs
    const text2 = 'See https://example.com and https://test.org/page';
    const urls2 = scraper.extractExternalUrls(text2);
    t.deepEqual(urls2, ['https://example.com', 'https://test.org/page']);

    // Should exclude t.me links
    const text3 = 'Telegram https://t.me/channel/123 and https://drive2.ru/test';
    const urls3 = scraper.extractExternalUrls(text3);
    t.deepEqual(urls3, ['https://drive2.ru/test']);

    // Should handle trailing punctuation
    const text4 = 'Link: https://example.com/page. And more!';
    const urls4 = scraper.extractExternalUrls(text4);
    t.deepEqual(urls4, ['https://example.com/page']);

    // Should deduplicate
    const text5 = 'Same https://example.com and https://example.com again';
    const urls5 = scraper.extractExternalUrls(text5);
    t.deepEqual(urls5, ['https://example.com']);
});

test('WebScraper.extractExternalUrls() - should handle empty input', (t) => {
    const scraper = new WebScraper();

    t.deepEqual(scraper.extractExternalUrls(''), []);
    t.deepEqual(scraper.extractExternalUrls(null), []);
    t.deepEqual(scraper.extractExternalUrls(undefined), []);
    t.deepEqual(scraper.extractExternalUrls('No URLs here'), []);
});

test('WebScraper.loadCache() - should load cache from file', async (t) => {
    const testDir = new TestDir();
    const cacheDir = path.join(testDir.getRoot(), 'cache');
    await fs.mkdir(cacheDir, { recursive: true });

    // Create cache file
    const cacheData = {
        'https://example.com': {
            lastModified: 'Wed, 15 Jan 2025 12:00:00 GMT',
            etag: '"abc123"',
            scrapedAt: '2025-01-15T12:00:00Z',
        },
    };
    await fs.writeFile(
        path.join(cacheDir, CACHE_FILE),
        JSON.stringify(cacheData),
    );

    const scraper = new WebScraper();
    await scraper.loadCache(cacheDir);

    t.is(scraper.cache.size, 1);
    t.deepEqual(scraper.cache.get('https://example.com'), cacheData['https://example.com']);
});

test('WebScraper.loadCache() - should handle missing cache file', async (t) => {
    const testDir = new TestDir();
    const cacheDir = path.join(testDir.getRoot(), 'empty-cache');

    const scraper = new WebScraper();
    await scraper.loadCache(cacheDir);

    t.is(scraper.cache.size, 0);
});

test('WebScraper.saveCache() - should save cache to file', async (t) => {
    const testDir = new TestDir();
    const cacheDir = path.join(testDir.getRoot(), 'save-cache');

    const scraper = new WebScraper();
    scraper.cache.set('https://test.com', {
        lastModified: 'Thu, 16 Jan 2025 10:00:00 GMT',
        etag: '"xyz789"',
        scrapedAt: '2025-01-16T10:00:00Z',
    });

    await scraper.saveCache(cacheDir);

    const content = await fs.readFile(path.join(cacheDir, CACHE_FILE), 'utf8');
    const data = JSON.parse(content);

    t.deepEqual(data['https://test.com'], {
        lastModified: 'Thu, 16 Jan 2025 10:00:00 GMT',
        etag: '"xyz789"',
        scrapedAt: '2025-01-16T10:00:00Z',
    });
});

test('WebScraper constructor - should accept options', (t) => {
    const scraper = new WebScraper({
        outputDir: 'custom-dir',
        verbose: true,
        timeout: 60,
        retries: 5,
    });

    t.is(scraper.outputDir, 'custom-dir');
    t.is(scraper.verbose, true);
    t.is(scraper.timeout, 60);
    t.is(scraper.retries, 5);
});
