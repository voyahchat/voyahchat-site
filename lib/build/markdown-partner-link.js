/**
 * Markdown-it partner link plugin
 *
 * Syntax:
 *   ::: partner-link
 *   https://example.com/partner
 *   Link text shown on the button
 *   :::
 *
 * Generates a prominent centered call-to-action link.
 * The first non-empty line is the URL, the second is the link text.
 *
 * @module build/markdown-partner-link
 */

const PARTNER_LINK_OPEN = /^::: partner-link\s*$/;
const CLOSE = /^:::\s*$/;

function escapeHtml(text) {
    return text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>');
}

function renderPartnerLink(innerLines) {
    const nonEmpty = innerLines
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const href = nonEmpty[0] || '#';
    const text = nonEmpty[1] || href;

    return `<a class="markdown-partner-link" href="${href}">${escapeHtml(text)}</a>`;
}

function partnerLinkPlugin(md) {
    md.core.ruler.before('block', 'markdown-partner-link', function(state) {
        const lines = state.src.split('\n');
        const result = [];
        let i = 0;

        while (i < lines.length) {
            if (PARTNER_LINK_OPEN.test(lines[i].trim())) {
                i++;
                const inner = [];

                while (i < lines.length && !CLOSE.test(lines[i].trim())) {
                    inner.push(lines[i]);
                    i++;
                }

                i++; // skip closing :::

                if (inner.length > 0) {
                    result.push(renderPartnerLink(inner));
                }
            } else {
                result.push(lines[i]);
                i++;
            }
        }

        state.src = result.join('\n');
    });
}

module.exports = partnerLinkPlugin;
