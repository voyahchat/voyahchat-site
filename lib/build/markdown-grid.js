/**
 * Markdown-it grid plugin
 *
 * Syntax:
 *   ::: grid
 *   Title 1
 *   Description text for the first card.
 *
 *   Title 2
 *   Description text for the second card.
 *   :::
 *
 * Generates a responsive 2-column grid of bordered cards.
 * Each blank-line-separated block becomes one card:
 * the first line is the card title, the remaining lines are the body text.
 *
 * @module build/markdown-grid
 */

const GRID_OPEN = /^::: grid\s*$/;
const GRID_CLOSE = /^:::\s*$/;

function escapeHtml(text) {
    return text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>');
}

function renderGrid(innerSrc) {
    const cells = innerSrc
        .split(/\n[ \t]*\n/)
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);

    let html = '<div class="markdown-grid">';

    for (const cell of cells) {
        const lineBreak = cell.indexOf('\n');
        const title = lineBreak === -1
            ? cell.trim()
            : cell.slice(0, lineBreak).trim();
        const description = lineBreak === -1
            ? ''
            : cell.slice(lineBreak + 1).trim();

        html += '<div class="markdown-grid__item">';
        if (title) {
            html += `<div class="markdown-grid__title">${escapeHtml(title)}</div>`;
        }
        if (description) {
            const text = description.replace(/\n/g, ' ');
            html += `<p class="markdown-grid__text">${escapeHtml(text)}</p>`;
        }
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function gridPlugin(md) {
    md.core.ruler.before('block', 'markdown-grid', function(state) {
        const lines = state.src.split('\n');
        const result = [];
        let i = 0;

        while (i < lines.length) {
            if (GRID_OPEN.test(lines[i].trim())) {
                i++;
                const inner = [];

                while (i < lines.length && !GRID_CLOSE.test(lines[i].trim())) {
                    inner.push(lines[i]);
                    i++;
                }

                i++; // skip closing :::

                if (inner.length > 0) {
                    result.push(renderGrid(inner.join('\n')));
                }
            } else {
                result.push(lines[i]);
                i++;
            }
        }

        state.src = result.join('\n');
    });
}

module.exports = gridPlugin;
