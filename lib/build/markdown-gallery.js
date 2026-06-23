/**
 * Markdown-it gallery plugin
 *
 * Syntax:
 *   ::: gallery
 *   ![Alt 1](image1.jpg)
 *   ![Alt 2](image2.jpg)
 *   :::
 *
 * Generates horizontal scrollable gallery with Tobii lightbox.
 * Image paths transformed via transformImagePath + imageMapping.
 *
 * @module build/markdown-gallery
 */

const { transformImagePath } = require('./markdown');

const GALLERY_OPEN = /^::: gallery\s*$/;
const GALLERY_CLOSE = /^:::\s*$/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

function galleryPlugin(md, pluginOptions) {
    md.core.ruler.before('block', 'markdown-gallery', function(state) {
        const lines = state.src.split('\n');
        const result = [];
        let i = 0;

        while (i < lines.length) {
            if (GALLERY_OPEN.test(lines[i].trim())) {
                i++;
                const images = [];

                while (i < lines.length && !GALLERY_CLOSE.test(lines[i].trim())) {
                    const match = lines[i].trim().match(IMAGE_RE);
                    if (match) {
                        const alt = match[1];
                        const originalSrc = match[2];

                        const transformOptions = {
                            imageMapping: pluginOptions.imageMapping,
                            env: state.env,
                        };
                        const src = transformImagePath(originalSrc, transformOptions);

                        images.push({ alt, src });
                    }
                    i++;
                }

                if (images.length > 0) {
                    result.push(renderGallery(images));
                }
                i++; // skip closing :::
            } else {
                result.push(lines[i]);
                i++;
            }
        }

        state.src = result.join('\n');
    });
}

function renderGallery(images) {
    const groupId = 'g-' + Math.random().toString(36).slice(2, 8);

    let html = '<div class="markdown-gallery">';

    for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        const loading = idx === 0 ? '' : ' loading="lazy"';

        html += `<a class="markdown-gallery__item" href="${img.src}" data-group="${groupId}">`
            + `<img class="markdown-gallery__img" src="${img.src}" alt="${img.alt}"${loading}>`
            + '</a>';
    }

    html += '</div>';
    return html;
}

module.exports = galleryPlugin;
