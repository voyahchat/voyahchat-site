/**
 * Build Script: Search Index Generation
 *
 * Responsibilities:
 * - Generate SQLite FTS5 search database from sitemap
 * - Extract and index page content (name, title, breadcrumbs, content)
 * - Strip HTML tags and decode entities from content
 * - Generate PHP configuration file with CSS/favicon/logo constants
 * - Support Cyrillic text search with unicode61 tokenizer
 *
 * Dependencies: better-sqlite3
 * Output: site/search.db, site/search-config.php, .build/build-search.json
 *
 * @module build/build-search
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Dir } = require('./dir');
const { Stats } = require('./stats');
const { Timestamp } = require('./timestamp');

/**
 * Strip HTML tags and decode entities from HTML content
 * @param {string} html - HTML content to strip
 * @returns {string} Plain text content
 */
function stripHtml(html) {
    if (!html) return '';

    let text = html;

    // Remove <script> and <style> blocks entirely
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Strip all HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, '\'');
    text = text.replace(/&nbsp;/g, ' ');

    // Decode numeric entities (&#NNN;)
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

    // Collapse whitespace to single spaces
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}

/**
 * Search Index Build Script
 *
 * Generates SQLite FTS5 database for site search functionality
 * - Uses .build/ for reading sitemap data
 * - Outputs search database to site/ directory
 * - Never modifies source files
 */
class SearchBuilder {
    constructor(options = {}, dir = Dir) {
        this.options = options;
        this.dir = dir;
    }

    /**
     * Convert breadcrumb URL array to display string
     * @param {Object} pageData - Page data object with breadcrumbs array
     * @param {Object} pages - Pages map (url -> page data)
     * @returns {string} Breadcrumb string (e.g., "Free → Модели")
     */
    static buildBreadcrumbsString(pageData, pages) {
        if (!pageData.breadcrumbs || pageData.breadcrumbs.length === 0) {
            return '';
        }

        const breadcrumbNames = pageData.breadcrumbs.map((url) => {
            const page = pages[url];
            return page ? page.name : '';
        }).filter(Boolean);

        // Add current page name at the end
        breadcrumbNames.push(pageData.name);

        return breadcrumbNames.join(' → ');
    }

    /**
     * Generate PHP configuration file with constants
     * @param {Object} config - Configuration object
     * @param {string} config.cssUrl - CSS file URL
     * @param {string} config.faviconUrl - Favicon URL
     * @param {string} config.logoSvg - Logo SVG content
     * @returns {string} PHP file content
     */
    static generateConfigPhp({ cssUrl, faviconUrl, logoSvg }) {
        // Escape single quotes in SVG content for PHP
        const escapedLogoSvg = logoSvg.replace(/'/g, '\\\'');

        return `<?php
// Auto-generated search configuration
// DO NOT EDIT MANUALLY

define('SEARCH_CSS_URL', '${cssUrl}');
define('SEARCH_FAVICON_URL', '${faviconUrl}');
define('SEARCH_LOGO_SVG', '${escapedLogoSvg}');
`;
    }

    /**
     * Get configuration data for PHP file generation
     * @returns {Object} Configuration object with cssUrl, faviconUrl, logoSvg
     */
    async getConfigData() {
        const projectRoot = this.dir.getRoot();
        const buildDir = this.dir.getBuild();

        // Get CSS URL from hash-css.json
        const hashCssPath = path.join(buildDir, 'hash-css.json');
        const hashCssData = JSON.parse(await fs.readFile(hashCssPath, 'utf8'));
        const cssUrl = hashCssData.page?.url || '/page.css';

        // Get favicon URL from image-mapping.json (use dir-aware loading)
        const imageMappingPath = path.join(buildDir, 'image-mapping.json');
        const imageMapping = JSON.parse(await fs.readFile(imageMappingPath, 'utf8'));
        const faviconUrl = imageMapping['logo/logo.svg'] ? `/${imageMapping['logo/logo.svg']}` : '/logo.svg';

        // Get logo SVG content
        const logoSvgPath = path.join(projectRoot, 'blocks', 'logo', 'logo.svg');
        const logoSvg = await fs.readFile(logoSvgPath, 'utf8');

        return { cssUrl, faviconUrl, logoSvg };
    }

    /**
     * Build search index with the current options
     * @returns {Promise<Object>} Build result with statistics
     */
    async build() {
        try {
            const siteDir = this.dir.getSite();
            const buildDir = this.dir.getBuild();

            // Ensure site directory exists
            await this.dir.ensure(siteDir);

            // Load sitemap data (use dir-aware loading)
            const sitemapPath = path.join(buildDir, 'sitemap.json');
            const sitemapData = JSON.parse(await fs.readFile(sitemapPath, 'utf8'));
            const { pages } = sitemapData;

            // Create SQLite database
            const dbPath = path.join(siteDir, 'search.db');

            // Remove existing database if it exists
            if (fsSync.existsSync(dbPath)) {
                await fs.unlink(dbPath);
            }

            const db = new Database(dbPath);

            try {
                // Create FTS5 virtual table with unicode61 tokenizer for Cyrillic support
                db.exec(`
                    CREATE VIRTUAL TABLE pages USING fts5(
                        url UNINDEXED,
                        name,
                        title,
                        section UNINDEXED,
                        breadcrumbs UNINDEXED,
                        content,
                        tokenize='unicode61'
                    );
                `);

                // Prepare insert statement
                const insert = db.prepare(`
                    INSERT INTO pages (url, name, title, section, breadcrumbs, content)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                // Use transaction for better performance
                const insertMany = db.transaction((pagesData) => {
                    for (const pageData of pagesData) {
                        insert.run(
                            pageData.url,
                            pageData.name,
                            pageData.title,
                            pageData.section,
                            pageData.breadcrumbs,
                            pageData.content,
                        );
                    }
                });

                // Prepare data for insertion
                const pagesData = Object.values(pages).map((pageData) => {
                    // Strip HTML from content
                    const content = stripHtml(pageData.html || '');

                    // Build breadcrumbs string
                    const breadcrumbsString = SearchBuilder.buildBreadcrumbsString(pageData, pages);

                    return {
                        url: pageData.url,
                        name: pageData.name,
                        title: pageData.title,
                        section: pageData.section || '',
                        breadcrumbs: breadcrumbsString,
                        content,
                    };
                });

                // Insert all pages in a single transaction
                insertMany(pagesData);

                // Get database size
                const dbStats = await fs.stat(dbPath);
                const dbSize = dbStats.size;

                // Generate PHP configuration file
                const configData = await this.getConfigData();
                const phpContent = SearchBuilder.generateConfigPhp(configData);
                const phpPath = path.join(siteDir, 'search-config.php');
                await fs.writeFile(phpPath, phpContent, 'utf8');

                // Get PHP file size for stats
                const phpStats = await fs.stat(phpPath);
                const phpSize = phpStats.size;

                // Set timestamps from all markdown files (use latest)
                const projectRoot = this.dir.getRoot();
                const contentDir = path.join(projectRoot, 'external', 'voyahchat-content');
                const markdownFiles = Object.values(pages)
                    .map(pageData => path.join(contentDir, pageData.file))
                    .filter(Boolean);

                if (markdownFiles.length > 0) {
                    await Timestamp.setTimestamp(dbPath, markdownFiles);
                    await Timestamp.setTimestamp(phpPath, markdownFiles);
                }

                // Save build statistics
                const stats = new Stats('build-search.json', buildDir);
                stats.add(
                    'search.db',
                    '.build/sitemap.json',
                    dbSize,
                    {
                        pages: pagesData.length,
                        cssUrl: configData.cssUrl,
                        faviconUrl: configData.faviconUrl,
                    },
                );
                stats.add(
                    'search-config.php',
                    '.build/sitemap.json',
                    phpSize,
                    {
                        cssUrl: configData.cssUrl,
                        faviconUrl: configData.faviconUrl,
                    },
                );
                await stats.save();

                // Output CLI message
                if (process.env.NODE_ENV !== 'test') {
                    console.log(`Search index: ${pagesData.length} pages, ${dbSize} bytes`);
                }

                return {
                    pages: pagesData.length,
                    size: dbSize,
                };
            } finally {
                // Always close database connection
                db.close();
            }
        } catch (error) {
            throw new Error(`Search index generation failed: ${error.message}`);
        }
    }
}

module.exports = {
    SearchBuilder,
    stripHtml,
};

// Run the script
if (require.main === module) {
    const builder = new SearchBuilder();
    builder.build().catch((error) => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}
