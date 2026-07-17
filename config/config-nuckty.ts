/**
 * nuckty consumer config for VoyahChat (~/site).
 *
 * One target builds the whole site from `config/` into `site/`. Plugins wire
 * the migrated xjst blocks (one .ts per legacy .njk template) and the
 * site-specific markdown plugins (gallery/grid/partner-link/video). ESM
 * requires explicit file paths, so each plugin entry points at its .ts file.
 *
 * The legacy `config/` (site.json, sitemap.yml, levels.json, external.json)
 * stays untouched — it is the public contract the engine reads.
 */
import { defineNucktyConfig } from 'nuckty';

export default defineNucktyConfig({
    targets: {
        default: { configDir: 'config/', outDir: 'site/', lang: 'ru' },
    },
    plugins: [
        // Page-shell layouts (one per legacy .njk page template).
        './blocks/page/page.ts',
        './blocks/page-index/page-index.ts',
        // Shared block templates included by the page shells.
        './blocks/header/header.ts',
        './blocks/footer/footer.ts',
        './blocks/menu/menu.ts',
        './blocks/aside/aside.ts',
        './blocks/logo/logo.ts',
        './blocks/metrika/metrika.ts',
        // Site-specific markdown transforms (gallery/grid/partner-link/video).
        './blocks/markdown-plugins/markdown-plugins.ts',
    ],
});
