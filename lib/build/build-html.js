/**
 * Build Script: HTML Generation
 *
 * Responsibilities:
 * - Load sitemap with pre-rendered HTML content
 * - Render pages using Nunjucks templates
 * - Minify HTML output
 * - Generate flat file structure in site/ directory
 *
 * Dependencies: nunjucks, html-minifier-terser
 * Output: site/*.html, .build/build-html.json
 *
 * @module build/build-html
 */

const fs = require('fs').promises;
const path = require('path');
const nunjucks = require('nunjucks');
const { Dir } = require('./dir');
const { Stats } = require('./stats');
const { Timestamp } = require('./timestamp');
const { getSitemap, getImageMapping } = require('../test/utils');

/**
 * HTML Build Script
 *
 * Uses pre-rendered HTML content from sitemap to generate final HTML pages with minification
 * - Uses .build/ for processing workspace
 * - Outputs final HTML to site/ directory
 * - Never modifies source files
 */
class HTMLBuilder {
    constructor(options = {}, dir = Dir) {
        this.options = options;
        this.dir = dir;
    }

    /**
     * Convert URL to flat filename
     * @param {string} url - URL to convert
     * @returns {string} Flat filename (e.g., '/free/12v' -> 'free_12v.html')
     */
    static urlToFlatFilename(url) {
        if (url === '/') {
            return 'index.html';
        }

        // Remove leading slash and replace remaining slashes with underscores
        return `${url.slice(1).replace(/\//g, '_')}.html`;
    }

    /**
     * Clean URL by removing trailing slashes (except for root)
     * @param {string} url - URL to clean
     * @returns {string} Clean URL without trailing slash
     */
    static cleanUrl(url) {
        if (url === '/') {
            return '/';
        }

        return url.replace(/\/+$/, '');
    }

    /**
     * Load hash information for CSS and JS files
     *
     * @param {string} [buildDir] - Optional build directory path (defaults to .build)
     * @returns {Promise<Object>} Hash information with css and js properties
     */
    static async getHash(buildDir, dir = Dir) {
        const result = { css: {}, js: {} };

        const basePath = buildDir || path.join(dir.getRoot(), '.build');
        const cssHashPath = path.join(basePath, 'hash-css.json');
        try {
            const content = await fs.readFile(cssHashPath, 'utf8');
            const trimmed = content.trim();
            if (trimmed) {
                result.css = JSON.parse(trimmed);
            }
        } catch (error) {
            // If it's a JSON parse error, re-throw it
            if (error instanceof SyntaxError) {
                throw error;
            }
            // File doesn't exist, use empty object
        }

        const jsHashPath = path.join(basePath, 'hash-js.json');
        try {
            const content = await fs.readFile(jsHashPath, 'utf8');
            const trimmed = content.trim();
            if (trimmed) {
                result.js = JSON.parse(trimmed);
            }
        } catch (error) {
            // If it's a JSON parse error, re-throw it
            if (error instanceof SyntaxError) {
                throw error;
            }
            // File doesn't exist, use empty object
        }

        return result;
    }

    /**
     * Fixes doctype spacing after HTML minification
     * @param {string} html - The minified HTML
     * @returns {string} HTML with proper doctype spacing
     */
    static fixDoctypeSpacing(html) {
        return html.replace(/<!doctypehtml>/gi, '<!doctype html>');
    }

    /**
     * Fixes typography that might be broken by HTML minification
     * Ensures non-breaking spaces are correctly placed before em dashes with regular space after
     * @param {string} html - The minified HTML
     * @returns {string} HTML with correct typography
     */
    static fixTypographyAfterMinification(html) {
        // Fix Unicode character issues: ensure non-breaking space is before dash
        // with regular space after
        // Pattern: non-breaking space + dash + non-breaking space
        // -> non-breaking space + dash + regular space
        let processedHtml = html.replace(/\u00A0—\u00A0/g, '\u00A0— ');

        // Pattern: non-breaking space + dash + any whitespace + non-breaking space
        // -> non-breaking space + dash + regular space
        processedHtml = processedHtml.replace(
            /\u00A0—\s+\u00A0/g,
            '\u00A0— ',
        );

        // Pattern: dash + non-breaking space -> dash + regular space
        processedHtml = processedHtml.replace(/—\u00A0/g, '— ');

        // Pattern: regular space + dash -> non-breaking space + dash
        processedHtml = processedHtml.replace(/ —/g, '\u00A0—');

        // Convert HTML entities back to Unicode characters for cleaner output
        processedHtml = processedHtml.replace(/&nbsp;/g, '\u00A0');

        return processedHtml;
    }

    /**
     * Build site with the current options
     * @returns {Promise<Object>} Build result with statistics
     */
    async build() {
        // Allow overriding directories for testing
        const BUILD_DIR = this.options.buildDir || this.dir.getBuild();
        const SITE_DIR = this.options.siteDir || this.dir.getSite();

        // Use optimized templates from .build/templates/
        // Build will fail if templates are not optimized first
        const TEMPLATE_DIR = path.join(BUILD_DIR, 'templates');

        // Check if optimized templates exist
        try {
            await fs.access(TEMPLATE_DIR);
        } catch {
            throw new Error(
                'Optimized templates not found in .build/templates/. Run \'npm run build:templates\' first.',
            );
        }

        // 0. Ensure build directory exists
        await this.dir.ensure(BUILD_DIR);
        if (!this.options.skipWrite) {
            await this.dir.ensure(SITE_DIR);
        }

        // 1. Load data with parameter priority - load all data in parallel
        const [
            sitemap,
            hashData,
            cssHash,
            jsHash,
            imageMapping,
        ] = await Promise.all([
            // Load sitemap using centralized function
            this.options.sitemap
                ? Promise.resolve(this.options.sitemap)
                : Promise.resolve(getSitemap()),

            // Load hash data (optimized single call)
            HTMLBuilder.getHash(BUILD_DIR, this.dir),

            // Load CSS hash
            fs.readFile(path.join(BUILD_DIR, 'hash-css.json'), 'utf-8')
                .then(JSON.parse)
                .catch(() => ({})),

            // Load JS hash
            fs.readFile(path.join(BUILD_DIR, 'hash-js.json'), 'utf-8')
                .then(JSON.parse)
                .catch(() => ({})),

            // Load image mapping using centralized function
            this.options.imageMapping
                ? Promise.resolve(this.options.imageMapping)
                : Promise.resolve(getImageMapping()),
        ]);

        // 3. Initialize Nunjucks - use optimized templates only
        const nunjucksEnv = new nunjucks.Environment(
            new nunjucks.FileSystemLoader(TEMPLATE_DIR),
            { autoescape: false },
        );

        // 4. Statistics tracking using collector
        const stats = new Stats('build-html.json', BUILD_DIR);

        // 6. Cache frequently used values
        const faviconUrl = imageMapping['logo/logo.svg']
            ? `/${imageMapping['logo/logo.svg']}`
            : '';
        const defaultJsUrl = (jsHash.page && jsHash.page.url) ? jsHash.page.url : '';

        // 5. Process all pages: use pre-rendered HTML, then batch minify
        const htmlPages = [];

        // Phase 1: Process all pages using pre-rendered HTML (parallel)
        const renderPromises = Object.keys(sitemap.pages).map(async (pageUrl) => {
            const pageData = sitemap.pages[pageUrl];

            // Skip pages without pre-rendered HTML
            if (!pageData.html) {
                if (!this.options.silentWarnings) {
                    console.warn(`Warning: No pre-rendered HTML found for page ${pageUrl}`);
                }
                return null;
            }

            // Use pre-rendered HTML from sitemap
            const contentHtml = pageData.html;

            // Determine CSS and JS files based on layout
            let cssKey = 'page'; // default
            if (pageData.layout && pageData.layout.includes('page-index')) {
                cssKey = 'page-index';
            }

            // Enhance page object with CSS, JS, and favicon data (cached values)
            pageData.css = cssHash[cssKey].url;
            pageData.js = defaultJsUrl;
            pageData.favicon = faviconUrl;

            const context = {
                sitemap,
                hash: hashData,
                helpers: { cleanUrl: HTMLBuilder.cleanUrl },
                page: pageData,
                content: contentHtml,
            };

            const layout = pageData.layout || 'blocks/page/page.njk';
            const finalHtml = nunjucksEnv.render(layout, context);

            // Create flat file structure: all HTML files in site/html/
            const flatFilename = HTMLBuilder.urlToFlatFilename(pageData.url);
            const htmlDir = path.join(SITE_DIR, 'html');
            await this.dir.ensure(htmlDir);
            const outputPath = path.join(htmlDir, flatFilename);

            return {
                finalHtml,
                flatFilename,
                outputPath,
                pageData,
                pageUrl,
            };
        });

        // Wait for all processing to complete
        const renderResults = await Promise.all(renderPromises);

        // Filter out null results (skipped files)
        const validPages = renderResults.filter(page => page !== null);

        // Phase 1.5: HTML is already correctly generated with proper anchors and links
        // No post-processing needed as per AGENTS.md rule
        // However, remove all unnecessary whitespace including newlines
        const transformedPages = validPages.map(page => ({
            ...page,
            transformedHtml: page.finalHtml
                // Remove newlines and spaces between tags
                .replace(/>\s+</g, '><')
                // Remove newlines and extra spaces after opening tags
                .replace(/>\s+/g, '> ')
                // Remove newlines and extra spaces before closing tags
                .replace(/\s+</g, ' <')
                // Clean up multiple spaces
                .replace(/\s{2,}/g, ' '),
        }));

        // Phase 2: Batch minify (parallel) - only if not skipMinify
        if (this.options.skipMinify) {
            // Skip minification, use transformed HTML
            htmlPages.push(...transformedPages.map(page => ({
                ...page,
                finalProcessedHtml: HTMLBuilder.fixDoctypeSpacing(page.transformedHtml),
            })));
        } else {
            // Use transformed HTML directly - markdown-it already produces optimal HTML
            const minifyPromises = transformedPages.map(async (page) => {
                const processedHtml = HTMLBuilder.fixDoctypeSpacing(page.transformedHtml);
                const finalProcessedHtml = HTMLBuilder.fixTypographyAfterMinification(processedHtml);

                return {
                    ...page,
                    finalProcessedHtml,
                };
            });

            const minifiedPages = await Promise.all(minifyPromises);
            htmlPages.push(...minifiedPages);
        }

        // Phase 3: Write files and track statistics (parallel)
        const writePromises = htmlPages.map(async (page) => {
            // Only write files if skipWrite is not true
            if (!this.options.skipWrite) {
                await fs.writeFile(page.outputPath, page.finalProcessedHtml);

                // Set timestamp from source markdown file - CRITICAL: build must fail if timestamp cannot be set
                const mdPath = path.join(Dir.getExternalContent(), page.pageData.file);
                try {
                    await Timestamp.setTimestamp(page.outputPath, mdPath);
                } catch (timestampError) {
                    const errorMsg = 'CRITICAL: Failed to set timestamp for '
                        + `${page.flatFilename} from ${mdPath}: ${timestampError.message}`;
                    throw new Error(errorMsg);
                }
            }

            // Track statistics using collector
            stats.add(
                page.flatFilename,
                page.pageData.file,
                Buffer.byteLength(page.finalProcessedHtml, 'utf8'),
                { url: page.pageUrl },
            );
        });

        // Run all write operations in parallel
        await Promise.all(writePromises);

        // 9. Save build statistics using collector (only if not skipWrite)
        if (!this.options.skipWrite) {
            await stats.save();
        }

        // Return summary for benchmarking
        return {
            pagesProcessed: Object.keys(sitemap.pages).length,
            totalSize: 0, // Could calculate if needed
        };
    }
}

module.exports = {
    HTMLBuilder,
    fixDoctypeSpacing: HTMLBuilder.fixDoctypeSpacing,
    fixTypographyAfterMinification: HTMLBuilder.fixTypographyAfterMinification,
    getHash: HTMLBuilder.getHash,
    urlToFlatFilename: HTMLBuilder.urlToFlatFilename,
    cleanUrl: HTMLBuilder.cleanUrl,
};

// Only run if called directly (not when imported for testing)
if (require.main === module) {
    const builder = new HTMLBuilder();
    builder.build().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
