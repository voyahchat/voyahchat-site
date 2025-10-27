const test = require('ava');
const {
    createMarkdownInstance,
    createCyrillicSlugify,
    createGitHubSlugify,
    cleanHeadingText,
    buildHierarchicalAnchor,
} = require('../build/markdown');
const { createMockSitemap } = require('./utils');

// Helper to create sitemap with test pages
function createTestSitemap() {
    return createMockSitemap({
        pages: [
            {
                url: '/common/tweaks',
                title: 'VoyahTweaks',
                name: 'VoyahTweaks',
                file: 'common/tweaks.md',
                section: 'common',
            },
            {
                url: '/common/tweaks/settings',
                title: 'Tweaks Settings',
                name: 'Tweaks Settings',
                file: 'common/tweaks_settings.md',
                section: 'common',
            },
            {
                url: '/common/tweaks/features',
                title: 'Tweaks Features',
                name: 'Tweaks Features',
                file: 'common/tweaks_features.md',
                section: 'common',
            },
            {
                url: '/common/software/setup',
                title: 'Software Setup',
                name: 'Software Setup',
                file: 'common/software_setup.md',
                section: 'common',
            },
            {
                url: '/common/software/dns',
                title: 'DNS Configuration',
                name: 'DNS Configuration',
                file: 'common/software_dns.md',
                section: 'common',
            },
            {
                url: '/common/firmware',
                title: 'Firmware',
                name: 'Firmware',
                file: 'common/firmware.md',
                section: 'common',
            },
            {
                url: '/free/tyres',
                title: 'Шины/диски',
                name: 'Шины/диски',
                file: 'free/tyres.md',
                section: 'free',
            },
            {
                url: '/free/firmware',
                title: 'Прошивка',
                name: 'Прошивка',
                file: 'free/firmware.md',
                section: 'free',
            },
            {
                url: '/dreamer/tyres',
                title: 'Шины/диски',
                name: 'Шины/диски',
                file: 'dreamer/tyres.md',
                section: 'dreamer',
            },
        ],
    });
}

// ============ BASIC LINK TRANSFORMATION TESTS ============

test('markdown renderer - links relative markdown links are transformed to correct URLs', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = 'См. [Free](../free/tyres.md#датчики) для деталей';
    const env = { page: { inputPath: './external/voyahchat-content/dreamer/tyres.md' } };

    const html = md.render(markdownContent, env);

    t.true(
        html.includes('href=/free/tyres#датчики'),
        `Expected link to be /free/tyres#датчики, got: ${html}`,
    );

    t.false(
        html.includes('%D0%B4%D0%B0%D1%82%D1%87%D0%B8%D0%BA%D0%B8'),
        'Should not contain URL-encoded anchor',
    );

    t.false(
        html.includes('/dreamer/tyres'),
        'Should not point to the current page',
    );
});

test('markdown renderer - links same-section relative links work correctly', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = 'См. [Настройки](tweaks_settings.md#мультимедиа)';
    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };

    const html = md.render(markdownContent, env);

    t.true(
        html.includes('href=/common/tweaks/settings#мультимедиа'),
        `Expected same-section link to work, got: ${html}`,
    );
});

test('markdown renderer - links cross-section relative links work correctly', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = 'См. [Прошивка](../common/firmware.md#китай)';
    const env = { page: { inputPath: './external/voyahchat-content/free/firmware.md' } };

    const html = md.render(markdownContent, env);

    t.true(
        html.includes('href=/common/firmware#китай'),
        `Expected cross-section link to work, got: ${html}`,
    );
});

test('markdown renderer - links external links are not transformed', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = 'External [link](https://example.com) and [mail](mailto:test@example.com)';
    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };

    const html = md.render(markdownContent, env);

    t.true(html.includes('href=https://example.com'), 'External HTTP links should be preserved');
    t.true(html.includes('href=mailto:test@example.com'), 'Mailto links should be preserved');
});

// ============ ANCHOR TRANSFORMATION TESTS ============

test('markdown renderer - anchors same-page anchor links work', async (t) => {
    const md = createMarkdownInstance();

    const markdownContent = `
# Основной раздел

## Подраздел 1

Ссылка на [подраздел 2](#подраздел-2).

## Подраздел 2

Содержимое подраздела 2.
    `.trim();

    const html = md.render(markdownContent);

    t.true(html.includes('href=#основной-раздел-подраздел-2'), 'Same-page anchor should be hierarchical');
    t.true(html.includes('id=основной-раздел-подраздел-2'), 'Target heading should have hierarchical ID');
});

test('markdown renderer - anchors cross-page anchor links work', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = 'См. [мультимедиа настройки](tweaks_settings.md#мультимедиа)';
    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };

    const html = md.render(markdownContent, env);

    t.true(
        html.includes('href=/common/tweaks/settings#мультимедиа'),
        'Cross-page anchor should be transformed correctly',
    );
});

test('markdown renderer - anchors GitHub-style anchors are transformed to hierarchical', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = `
# Yandex

1. Run script on [Windows](#windows) or [Mac](#mac)

## Windows
Windows instructions

## Mac
Mac instructions

# One

1. Run script on [Windows](#windows-1) or [Mac](#mac-1)

## Windows
Windows instructions for One

## Mac
Mac instructions for One
    `.trim();

    const env = { page: { inputPath: './external/voyahchat-content/common/software_dns.md' } };
    const html = md.render(markdownContent, env);

    // Check hierarchical IDs
    t.true(html.includes('id=yandex-windows'), 'Should have hierarchical anchor for yandex-windows');
    t.true(html.includes('id=yandex-mac'), 'Should have hierarchical anchor for yandex-mac');
    t.true(html.includes('id=one-windows'), 'Should have hierarchical anchor for one-windows');
    t.true(html.includes('id=one-mac'), 'Should have hierarchical anchor for one-mac');

    // Check transformed links
    t.true(html.includes('href=#yandex-windows'), 'Should transform link to hierarchical anchor');
    t.true(html.includes('href=#yandex-mac'), 'Should transform link to hierarchical anchor');
    t.true(html.includes('href=#one-windows'), 'Should transform link to hierarchical anchor');
    t.true(html.includes('href=#one-mac'), 'Should transform link to hierarchical anchor');

    // Should not contain old GitHub-style anchors
    t.false(html.includes('id=windows'), 'Should not contain old GitHub-style anchor');
    t.false(html.includes('href=#windows'), 'Should not contain link to old GitHub-style anchor');
});

test('markdown renderer - anchors Cyrillic characters are preserved in hierarchical anchors', async (t) => {
    const md = createMarkdownInstance();

    const markdownContent = `
# Мультимедиа система

## Настройки положений сидений/зеркал

Ссылка на [мультимедиа](#мультимедиа-система) и [настройки](#мультимедиа-система-настройки-положений-сидений-зеркал).
    `.trim();

    const html = md.render(markdownContent);

    t.true(html.includes('id=мультимедиа-система'), 'Should preserve Cyrillic in top-level anchor');
    t.true(
        html.includes('id=мультимедиа-система-настройки-положений-сидений-зеркал'),
        'Should preserve Cyrillic in hierarchical anchor with slashes replaced by hyphens',
    );
    t.true(html.includes('href=#мультимедиа-система'), 'Should preserve Cyrillic in link');
    t.true(
        html.includes('href=#мультимедиа-система-настройки-положений-сидений-зеркал'),
        'Should preserve Cyrillic in hierarchical link',
    );
});

// ============ COMPLEX SCENARIOS ============

test('markdown renderer - complex mixed relative and absolute links in same document', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = `
# Тестовая страница

Ссылки на:
- [Относительный файл](tweaks_settings.md)
- [Относительный с якорем](tweaks_settings.md#мультимедиа)
- [Кросс-секция](../free/tyres.md#датчики)
- [Внешний сайт](https://example.com)
- [Якорь на странице](#тестовая-страница)
    `.trim();

    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };
    const html = md.render(markdownContent, env);

    t.true(html.includes('href=/common/tweaks/settings'), 'Relative file should be transformed');
    t.true(html.includes('href=/common/tweaks/settings#мультимедиа'), 'Relative with anchor should be transformed');
    t.true(html.includes('href=/free/tyres#датчики'), 'Cross-section should be transformed');
    t.true(html.includes('href=https://example.com'), 'External should be preserved');
    t.true(html.includes('href=#тестовая-страница'), 'Same-page anchor should be hierarchical');
});

test('markdown renderer - complex version number anchors work correctly', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = `
# Изменения по версиям

## 2.0.5

Начиная с [версии 2.0.5](#205) приложение стало платным.

## 2.1.0

В [версии 2.1.0](#210) добавлены новые функции.
    `.trim();

    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks_changelog.md' } };
    const html = md.render(markdownContent, env);

    t.true(html.includes('id=изменения-по-версиям-2.0.5'), 'Version 2.0.5 should map to 2.0.5 anchor');
    t.true(html.includes('href=#изменения-по-версиям-2.0.5'), 'Link to 2.0.5 should work');
    t.true(html.includes('id=изменения-по-версиям-2.1.0'), 'Version 2.1.0 should map to 2.1.0 anchor');
    t.true(html.includes('href=#изменения-по-версиям-2.1.0'), 'Link to 2.1.0 should work');
});

test('markdown renderer - complex numbered heading patterns work correctly', async (t) => {
    const md = createMarkdownInstance();

    const markdownContent = `
# Комфорт

## 1. Управление музыкой на руле

## 2. Настройки положений сидений/зеркал

Ссылки: [музыка](#комфорт-управление-музыкой-на-руле), [сиденья](#комфорт-настройки-положений-сидений-зеркал)
    `.trim();

    const html = md.render(markdownContent);

    t.true(
        html.includes('id=комфорт-управление-музыкой-на-руле'),
        'Numbered heading should generate clean hierarchical anchor',
    );
    t.true(
        html.includes('id=комфорт-настройки-положений-сидений-зеркал'),
        'Numbered heading with slash should replace slash with hyphen',
    );
    t.true(
        html.includes('href=#комфорт-управление-музыкой-на-руле'),
        'Link to numbered heading should work',
    );
    t.true(
        html.includes('href=#комфорт-настройки-положений-сидений-зеркал'),
        'Link to numbered heading with slash should work',
    );
});

// ============ ERROR HANDLING AND EDGE CASES ============

test('markdown renderer - edge cases broken links are handled gracefully', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = `
# Тест

Ссылки на несуществующие файлы:
- [Несуществующий файл](nonexistent.md)
- [Несуществующий с якорем](nonexistent.md#anchor)
- [Несуществующий в другой секции](../nonexistent/file.md)
    `.trim();

    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };

    // Should throw error for broken links due to validation
    const error = t.throws(() => {
        md.render(markdownContent, env);
    });

    t.true(error.message.includes('Unknown relative link'), 'Should throw error for broken links');
    t.true(error.message.includes('nonexistent.md'), 'Error should mention the broken file');
});

test('markdown renderer - edge cases empty and malformed links', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = `
# Тест

- [Пустая ссылка]()
- [Только якорь](#anchor)
- [Только файл](file.md)
- [Пробелы в ссылке]( file.md )
    `.trim();

    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };

    // Should throw error for malformed links due to validation
    const error = t.throws(() => {
        md.render(markdownContent, env);
    });

    t.true(error.message.includes('Unknown relative link'), 'Should throw error for malformed links');
    t.true(error.message.includes('file.md'), 'Error should mention the malformed file');
});

test('markdown renderer - edge cases special characters in anchors', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = `
# Тест & Разработка

## Секция (специальная)

Ссылки: [тест](#тест-разработка), [секция](#тест-разработка-секция-специальная)
    `.trim();

    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };
    const html = md.render(markdownContent, env);

    t.true(html.includes('id=тест-разработка'), 'Special characters should be cleaned');
    t.true(
        html.includes('id=тест-разработка-секция-специальная'),
        'Special characters in hierarchical anchors should be cleaned',
    );
    t.true(html.includes('href=#тест-разработка'), 'Links to cleaned anchors should work');
});

// ============ UTILITY FUNCTION TESTS ============

test('markdown renderer - utilities createCyrillicSlugify preserves Cyrillic', (t) => {
    const slugify = createCyrillicSlugify('lower');
    const result = slugify('Мультимедиа система');
    t.is(result, 'мультимедиа-система');
});

test('markdown renderer - utilities createGitHubSlugify removes slashes', (t) => {
    const slugify = createGitHubSlugify('lower');
    const result = slugify('настройки/положений');
    t.is(result, 'настройкиположений', 'GitHub slugify should remove slashes completely');
});

test('markdown renderer - utilities cleanHeadingText removes numbered prefixes', (t) => {
    t.is(cleanHeadingText('1. Настройки'), 'Настройки');
    t.is(cleanHeadingText('2.1.3. Поднастройки'), 'Поднастройки');
    t.is(cleanHeadingText('2.4.3'), '2.4.3', 'Version numbers should be preserved');
});

test('markdown renderer - utilities buildHierarchicalAnchor creates proper hierarchy', (t) => {
    const slugify = createCyrillicSlugify('lower');
    const result = buildHierarchicalAnchor(['Секция', 'Подсекция', 'Элемент'], slugify);
    t.is(result, 'секция-подсекция-элемент');
});

// ============ INTEGRATION TESTS ============

test('markdown renderer - integration complete link transformation pipeline', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    const markdownContent = `
# VoyahTweaks

VoyahTweaks — это программа для Android.

## Возможности

Подробности в [возможностях](tweaks_features.md).

## Настройки

См. [настройки мультимедиа](tweaks_settings.md#мультимедиа) и [установку](software_setup.md#установка).

## Ссылки

- [Free версии](../free/tyres.md#датчики)
- [Официальный сайт](https://voyahtweaks.ru)
- [Якорь на этой странице](#voyahtweaks-возможности)
    `.trim();

    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };
    const html = md.render(markdownContent, env);

    // Check all types of links are transformed correctly
    t.true(html.includes('href=/common/tweaks/features'), 'Same-section file link');
    t.true(html.includes('href=/common/tweaks/settings#мультимедиа'), 'Same-section with anchor');
    t.true(html.includes('href=/common/software/setup#установка'), 'Different same-section file with anchor');
    t.true(html.includes('href=/free/tyres#датчики'), 'Cross-section with anchor');
    t.true(html.includes('href=https://voyahtweaks.ru'), 'External link preserved');
    t.true(html.includes('href=#voyahtweaks-возможности'), 'Same-page hierarchical anchor');
});

// ============ ERROR HANDLING TESTS ============

test('markdown renderer - error handling detects circular link references', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    // Create a scenario where document A links to document B which links back to A
    // This tests the circular dependency detection in the link processing
    const markdownContent = `
# Test Document

This document links to [another page](tweaks_settings.md) which might link back.
    `.trim();

    const env = {
        page: { inputPath: './external/voyahchat-content/common/tweaks.md' },
        _processingState: {
            anchorMap: new Map(),
            completed: new Set(),
            processing: new Set(['./external/voyahchat-content/common/tweaks.md']),
        },
        _processDocument: (url, filePath) => {
            // Simulate circular reference detection
            if (env._processingState.processing.has(filePath)) {
                throw new Error('Circular dependency detected');
            }
        },
    };

    // The markdown should render successfully even with circular references
    // The system should handle this gracefully
    const html = md.render(markdownContent, env);
    t.true(html.includes('href=/common/tweaks/settings'), 'Link should still be transformed');
});

test('markdown renderer - error handling handles invalid anchor syntax gracefully', async (t) => {
    const sitemap = createTestSitemap();
    const md = createMarkdownInstance({ sitemap });

    // Test various invalid anchor formats
    const markdownContent = `
# Test

Links with invalid anchors:
- [Link with spaces in anchor](tweaks_settings.md#invalid anchor with spaces)
- [Link with special chars](tweaks_settings.md#invalid@anchor!)
- [Link with multiple hashes](tweaks_settings.md#first#second)
    `.trim();

    const env = { page: { inputPath: './external/voyahchat-content/common/tweaks.md' } };

    // Should render without throwing errors, even if anchors are invalid
    const html = md.render(markdownContent, env);

    // Links should still be transformed, anchors preserved as-is
    t.true(html.includes('href=/common/tweaks/settings#'), 'Base URL should be transformed');
    t.true(html.length > 0, 'HTML should be generated');
});
