/**
 * AVA tests for the markdown-it container plugins
 * (markdown-gallery, markdown-grid, markdown-partner-link)
 */

const test = require('ava');
const { createMarkdownInstance } = require('../build/markdown');

function createMd() {
    return createMarkdownInstance({
        sitemap: {
            sitemap: ['/'],
            pages: {
                '/': {
                    file: 'index.md',
                    url: '/',
                    title: 'Home',
                },
            },
            md2url: { 'index.md': '/' },
            url2md: { '/': 'index.md' },
        },
        imageMapping: {},
    });
}

const ENV = {
    page: { inputPath: './external/voyahchat-content/partners/lovto.md' },
};

test('markdown-gallery plugin - should render gallery container', (t) => {
    const md = createMd();
    const src = [
        '::: gallery',
        '![Alt 1](lovto_01.jpg)',
        '![Alt 2](lovto_02.jpg)',
        ':::',
    ].join('\n');
    const html = md.render(src, ENV);

    t.true(html.includes('<div class="markdown-gallery">'));
    t.true(html.includes('markdown-gallery__item'));
    t.is((html.match(/markdown-gallery__item/g) || []).length, 2);
});

test('markdown-grid plugin - should render a 2-column grid of bordered cards', (t) => {
    const md = createMd();
    const src = [
        '::: grid',
        'Антигравийная плёнка',
        '🛡️ Защита кузова от сколов и царапин.',
        '',
        'Цветная оклейка',
        '🎨 Смена цвета без покраски.',
        ':::',
    ].join('\n');
    const html = md.render(src, ENV);

    t.true(html.includes('<div class="markdown-grid">'));
    t.true(html.includes('markdown-grid__item'));
    t.true(html.includes('markdown-grid__title">Антигравийная плёнка'));
    t.true(html.includes('markdown-grid__text'));
    t.is((html.match(/markdown-grid__item/g) || []).length, 2);
});

test('markdown-partner-link plugin - should render a centered partner link', (t) => {
    const md = createMd();
    const src = [
        '::: partner-link',
        'https://okleika.lovto.ru/?utm_source=voyahchat&utm_medium=knopka',
        'Перейти на сайт партнера',
        ':::',
    ].join('\n');
    const html = md.render(src, ENV);

    t.true(html.includes('<a class="markdown-partner-link"'));
    t.true(html.includes('href="https://okleika.lovto.ru/'));
    t.true(html.includes('Перейти на сайт партнера'));
});
