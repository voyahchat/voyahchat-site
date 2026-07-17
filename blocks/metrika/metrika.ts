/**
 * metrika block — port of blocks/metrika/metrika.njk.
 *
 * Emits the Yandex.Metrika inline `<script>` (verbatim) and a `<noscript>`
 * fallback with two `<img>` beacons. The script body is trusted, fixed source,
 * so it rides as a raw node; the noscript carries real BemNode children so the
 * optimizer still applies (boolean attrs, void img, etc.).
 */
import type { BemNode } from 'nuckty';

/** The metrika `<script>` body — 1:1 with metrika.njk. */
const METRIKA_SCRIPT =
    "(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','//mc.yandex.ru/metrika/tag.js','ym');ym(108333304,'init',{referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});ym(110358021,'init',{referrer:document.referrer,url:location.href});";

/** Build the metrika node tree (script + noscript). */
export function metrikaNodes(): BemNode[] {
    return [
        // Inline analytics script: emitted as raw so the JS body is not escaped
        // (the renderer escapes string content; trusted source → raw pass-through).
        { raw: `<script>${METRIKA_SCRIPT}</script>` },
        {
            tag: 'noscript',
            block: 'metrika',
            content: [
                { tag: 'img', bem: false, attrs: { src: '//mc.yandex.ru/watch/108333304', alt: '' } },
                { tag: 'img', bem: false, attrs: { src: '//mc.yandex.ru/watch/110358021', alt: '' } },
            ],
        },
    ];
}

export function register(_env: unknown): void {
    // No xjst templates: metrika is a plain node tree built by the page layout.
}
