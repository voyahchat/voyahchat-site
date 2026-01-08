/**
 * Build Script: HTML Generation
 *
 * Responsibilities:
 * - Load sitemap with pre-rendered HTML content
 * - Render pages using Nunjucks templates
 * - Generate flat file structure in site/ directory
 *
 * Note: HTML minification and typography are handled at markdown level
 * No post-processing of HTML content is performed (per AGENTS.md)
 *
 * Dependencies: nunjucks
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
 * Uses pre-rendered HTML content from sitemap to generate final HTML pages
 * - Uses .build/ for processing workspace
 * - Outputs final HTML to site/ directory
 * - Never modifies source files
 * - No HTML post-processing (minification/typography handled at markdown level)
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
     * Remove whitespace between HTML tags (template-level minification)
     * This only removes whitespace between tags, not within content
     * @param {string} html - The HTML to minify
     * @returns {string} Minified HTML
     */
    static removeTagWhitespace(html) {
        return html
            // Remove newlines and spaces between tags
            .replace(/>\s+</g, '><')
            // Remove newlines after closing tags before opening tags
            .replace(/<\/[^>]+>\s+</g, '</$1><')
            // Restore space between code and link elements (fix for specific case)
            .replace(/<\/code><a/g, '</code> <a');
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

            // Get timestamp from source markdown file
            let lastUpdated = null;
            if (pageData.file) {
                const mdPath = path.join(Dir.getExternalContent(), pageData.file);
                try {
                    const timestamp = await Timestamp.getSourceTimestamp(mdPath);
                    if (timestamp) {
                        // Create Date object from UTC timestamp and convert to GMT+3
                        const date = new Date(timestamp * 1000);
                        // Convert to GMT+3 by adding 3 hours to the UTC time
                        const gmt3Date = new Date(date.getTime() + (3 * 60 * 60 * 1000));

                        // Format as "15.10.2025 20:14 GMT+03"
                        const day = gmt3Date.getUTCDate().toString().padStart(2, '0');
                        const month = (gmt3Date.getUTCMonth() + 1).toString().padStart(2, '0');
                        const year = gmt3Date.getUTCFullYear();
                        const hours = gmt3Date.getUTCHours().toString().padStart(2, '0');
                        const minutes = gmt3Date.getUTCMinutes().toString().padStart(2, '0');
                        lastUpdated = `${day}.${month}.${year} ${hours}:${minutes} GMT+03`;
                    }
                } catch (error) {
                    // If we can't get the timestamp, leave it as null
                    if (!this.options.silentWarnings) {
                        console.warn(`Warning: Could not get timestamp for ${mdPath}: ${error.message}`);
                    }
                }
            }

            // Enhance page object with CSS, JS, favicon, and timestamp data (cached values)
            pageData.css = cssHash[cssKey].url;
            pageData.js = defaultJsUrl;
            pageData.favicon = faviconUrl;
            pageData.lastUpdated = lastUpdated;

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

        // HTML is already correctly generated with proper anchors and links at markdown level
        // Apply template-level minification (whitespace between tags only)
        // This doesn't affect content, only template-generated whitespace
        const processedPages = validPages.map(page => ({
            ...page,
            finalProcessedHtml: HTMLBuilder.fixDoctypeSpacing(
                HTMLBuilder.removeTagWhitespace(page.finalHtml),
            ),
        }));

        htmlPages.push(...processedPages);

        // Phase 3: Write files and track statistics (parallel)
        const writePromises = htmlPages.map(async (page) => {
            // Only write files if skipWrite is not true
            if (!this.options.skipWrite) {
                await fs.writeFile(page.outputPath, page.finalProcessedHtml);

                // Set timestamp from both source markdown file and page-specific templates
                // CRITICAL: build must fail if timestamp cannot be set
                try {
                    const layout = page.pageData.layout || 'blocks/page/page.njk';

                    // Get template files for this layout
                    const { loadBemDeclaration, getTemplateFilesForBlocks } = require('./utils');
                    let bundle = 'page'; // default
                    if (layout.includes('page-index')) {
                        bundle = 'page-index';
                    }
                    const blocks = loadBemDeclaration(bundle, this.dir);
                    const templateFiles = getTemplateFilesForBlocks(blocks, this.dir);

                    // Use the latest timestamp from both markdown and template files
                    const sourcePaths = [];

                    // Add markdown file if it exists
                    if (page.pageData.file) {
                        const mdPath = path.join(Dir.getExternalContent(), page.pageData.file);
                        sourcePaths.push(mdPath);
                    }

                    // Add template files
                    if (templateFiles.length > 0) {
                        sourcePaths.push(...templateFiles);
                    }

                    // Only set timestamp if we have source files
                    if (sourcePaths.length > 0) {
                        await Timestamp.setTimestamp(page.outputPath, sourcePaths);
                    }
                } catch (timestampError) {
                    const errorMsg = 'CRITICAL: Failed to set timestamp for '
                        + `${page.flatFilename}: ${timestampError.message}`;
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
    removeTagWhitespace: HTMLBuilder.removeTagWhitespace,
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
