/**
 * Build Script: Sitemap Generation and Content Processing
 *
 * Responsibilities:
 * - Parse config/sitemap.yml
 * - Generate hierarchical navigation structure
 * - Create URL mappings for markdown links
 * - Render markdown content to pre-minified HTML
 * - Generate comprehensive anchor mappings
 * - Generate sitemap.xml for SEO
 * - Fetch last modification dates from Git
 *
 * Dependencies: Node.js built-ins, markdown-it
 * Output: site/sitemap.xml, .build/sitemap.json, .build/build-sitemap.json
 *
 * @module build/build-sitemap
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Dir } = require('./dir');
const { Stats } = require('./stats');
const { BASE_URL } = require('./constants');
const {
    createMarkdownInstance,
    cleanHeadingText,
    createCyrillicSlugify,
} = require('./markdown');
const { getImageMapping } = require('../test/utils');

const execFileAsync = promisify(execFile);

/**
 * Module-level processing state for lazy anchor resolution
 * Tracks document processing to enable recursive cross-document link resolution
 */
const processingState = {
    inProgress: new Set(),
    completed: new Map(),
    anchorMap: new Map(),
};

/**
 * Process a single document with lazy anchor resolution
 * @param {string} url - Document URL
 * @param {string} filePath - Full file path to markdown file
 * @param {Object} sitemap - Sitemap data object
 * @param {Object} _options - Rendering options
 * @returns {string} Rendered HTML
 */
function processDocument(url, filePath, sitemap, _options = {}) {
    // Check circular dependency
    if (processingState.inProgress.has(url)) {
        const chain = Array.from(processingState.inProgress);
        throw new Error(`Circular dependency: ${chain.join(' → ')} → ${url}`);
    }

    // Check if already processed
    if (processingState.completed.has(url)) {
        return processingState.completed.get(url);
    }

    // Mark as in progress
    processingState.inProgress.add(url);

    try {
        // Read markdown content
        const content = fsSync.readFileSync(filePath, 'utf-8');

        // Get image mapping for HTML rendering
        const imageMapping = getImageMapping();

        // Create markdown instance and render
        const md = createMarkdownInstance({ imageMapping, sitemap });

        // Prepare environment with processing state
        const contentRoot = path.join(Dir.getRoot(), 'external', 'voyahchat-content');
        const relativePath = path.relative(contentRoot, filePath);
        const env = {
            page: { inputPath: `./external/voyahchat-content/${relativePath}` },
            _sitemap: sitemap,
            _currentUrl: url,
            _processingState: processingState,
            _processDocument: processDocument,
        };

        // Render markdown to HTML
        const html = md.render(content, env, { imageMapping, sitemap });

        // Mark as completed
        processingState.inProgress.delete(url);
        processingState.completed.set(url, html);

        return html;
    } catch (error) {
        // Remove from in-progress on error
        processingState.inProgress.delete(url);
        throw error;
    }
}

/**
 * Reset processing state (useful for testing)
 */
function resetProcessingState() {
    processingState.inProgress.clear();
    processingState.completed.clear();
    processingState.anchorMap.clear();
}

/**
 * Sitemap Build Script
 *
 * Processes sitemap configuration and generates navigation structure
 * - Uses .build/ for processing workspace
 * - Outputs final artifacts to site/ directory
 * - Never modifies source files
 */
class SitemapBuilder {
    constructor(options = {}) {
        this.options = options;
    }

    /**
     * Parse sitemap line format: "Title [URL, file.md, { layout: '...' }]"
     * @param {string} line - Sitemap line to parse
     * @returns {Object|null} Parsed object with title, url, file, and meta properties
     */
    static parseSitemapLine(line) {

        // Updated regex to capture optional metadata object
        const match = line.match(/^(.+?)\s*\[([^,]+),\s*([^,]+)(?:,\s*(\{.*\s*))?\]$/);

        if (match) {
            const result = {
                title: match[1].trim(),
                url: match[2].trim(),
                file: match[3].trim(),
                meta: {}, // Default empty meta object
            };

            // If metadata is present, parse it
            if (match[4]) {
                try {
                // Parse JSON-like object from metadata string
                // Convert YAML-like format to valid JSON
                    const jsonString = match[4]
                        .replace(/(\w+):/g, '"$1":')
                        .replace(/'/g, '"')
                        .replace(/,\s*}/g, '}');

                    result.meta = JSON.parse(jsonString);
                } catch (e) {
                    console.warn(`Could not parse metadata for line: ${line}`);
                }
            }

            return result;
        }

        return null;
    }

    /**
     * Build full URL from parent URL and current URL
     * @param {string} parentUrl - Parent URL (e.g., '/free')
     * @param {string} currentUrl - Current URL (e.g., 'models' or '/about')
     * @returns {string} Full absolute URL (e.g., '/free/models' or '/about')
     */
    static buildFullUrl(parentUrl, currentUrl) {
        if (currentUrl.startsWith('/')) {
            return currentUrl; // Already absolute URL
        }
        // Relative URL - combine with parent to make absolute
        const cleanParent = parentUrl.replace(/\/$/, '');

        return `${cleanParent}/${currentUrl}`;
    }

    /**
     * Parse indented sitemap format from raw YAML text
     * @param {string} content - Raw YAML content from sitemap.yml
     * @returns {Array} Parsed sitemap structure as nested arrays and objects
     */
    static parseIndentedSitemap(content) {
        const lines = content.split('\n');
        const result = [];
        const stack = [{ level: -1, children: result }];

        lines.forEach((line, i) => {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) return;

            // Skip YAML structure lines
            if (trimmed === 'sitemap:' || trimmed.startsWith('sitemap:')) return;

            // Calculate indentation level (each 2 spaces = 1 level)
            const match = line.match(/^(\s*)-\s*(.+)$/);

            if (!match) return;

            const indent = match[1].length;
            const level = Math.floor(indent / 2);
            const itemContent = match[2].trim();

            // Pop stack to correct level
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            const parent = stack[stack.length - 1];

            // Check if this item might have children by looking ahead
            let hasChildren = false;

            // Look for next non-empty, non-comment line
            for (let j = i + 1; j < lines.length; j += 1) {
                const nextLine = lines[j];
                const nextTrimmed = nextLine.trim();

                // Skip empty lines and comments
                if (!nextTrimmed || nextTrimmed.startsWith('#')) {
                    continue;
                }

                // Skip YAML structure lines
                if (nextTrimmed === 'sitemap:' || nextTrimmed.startsWith('sitemap:')) {
                    continue;
                }

                const nextMatch = nextLine.match(/^(\s*)-\s*(.+)$/);

                if (nextMatch) {
                    const nextIndent = nextMatch[1].length;
                    const nextLevel = Math.floor(nextIndent / 2);

                    hasChildren = nextLevel > level;
                    break;
                }
            }

            if (hasChildren) {
            // Create object with children array
                const obj = {};

                obj[itemContent] = [];
                parent.children.push(obj);
                stack.push({ level, children: obj[itemContent] });
            } else {
            // Simple item
                parent.children.push(itemContent);
            }
        });

        return result;
    }

    /**
     * Process sitemap items into structured navigation
     * @param {Array} items - Parsed sitemap items
     * @param {string} [parentUrl=''] - Parent URL for relative URL resolution
     * @returns {Object} Object with sitemap, pages, and urlMapping properties
     */
    static processSitemap(items, parentUrl = '') {
        const sitemap = [];
        const pages = {};
        const urlMapping = new Map();

        function processItems(navItems, parentUrlValue, sitemapArray) {
            navItems.forEach((item) => {
                if (typeof item === 'string') {
                // Simple string item - parse it
                    const parsed = SitemapBuilder.parseSitemapLine(item);

                    if (!parsed) {
                        console.warn(`Could not parse sitemap line: ${item}`);

                        return;
                    }

                    const fullUrl = SitemapBuilder.buildFullUrl(parentUrlValue, parsed.url);

                    urlMapping.set(parsed.file, fullUrl);

                    // Add to sitemap array
                    sitemapArray.push(fullUrl);

                    // Add to pages object
                    const urlParts = fullUrl.split('/').filter((p) => p);
                    const section = urlParts.length > 0 ? urlParts[0] : null;

                    // Build breadcrumbs
                    const breadcrumbs = urlParts.slice(0, -1).map((_, i) => (
                        `/${urlParts.slice(0, i + 1).join('/')}`
                    ));

                    const pageData = {
                        file: parsed.file,
                        url: fullUrl,
                        name: parsed.title,
                        title: parsed.title, // Will be updated with root title later
                        section,
                        breadcrumbs,
                        ...parsed.meta,
                    };

                    pages[fullUrl] = pageData;
                } else if (typeof item === 'object' && item !== null) {
                // Object with title and potentially children
                    const keys = Object.keys(item);
                    const title = keys[0];
                    const value = item[title];

                    const parsed = SitemapBuilder.parseSitemapLine(title);

                    if (!parsed) {
                        console.warn(`Could not parse sitemap line: ${title}`);

                        return;
                    }

                    const fullUrl = SitemapBuilder.buildFullUrl(parentUrlValue, parsed.url);

                    urlMapping.set(parsed.file, fullUrl);

                    if (Array.isArray(value) && value.length > 0) {
                    // Has children - create hierarchical structure
                        const childrenArray = [];
                        const sitemapEntry = {};

                        sitemapEntry[fullUrl] = childrenArray;
                        sitemapArray.push(sitemapEntry);

                        // Add to pages object first (so breadcrumbs can reference it)
                        const urlParts = fullUrl.split('/').filter((p) => p);
                        const section = urlParts.length > 0 ? urlParts[0] : null;

                        // Build breadcrumbs
                        const breadcrumbs = urlParts.slice(0, -1).map((_, i) => (
                            `/${urlParts.slice(0, i + 1).join('/')}`
                        ));

                        const pageData = {
                            file: parsed.file,
                            url: fullUrl,
                            name: parsed.title,
                            title: parsed.title, // Will be updated with root title later
                            section,
                            breadcrumbs,
                            ...parsed.meta,
                        };

                        pages[fullUrl] = pageData;

                        // Process children
                        processItems(value, fullUrl, childrenArray);
                    } else {
                    // No children - simple item
                        sitemapArray.push(fullUrl);

                        // Add to pages object
                        const urlParts = fullUrl.split('/').filter((p) => p);
                        const section = urlParts.length > 0 ? urlParts[0] : null;

                        // Build breadcrumbs
                        const breadcrumbs = urlParts.slice(0, -1).map((_, i) => (
                            `/${urlParts.slice(0, i + 1).join('/')}`
                        ));

                        const pageData = {
                            file: parsed.file,
                            url: fullUrl,
                            name: parsed.title,
                            title: parsed.title, // Will be updated with root title later
                            section,
                            breadcrumbs,
                            ...parsed.meta,
                        };

                        pages[fullUrl] = pageData;
                    }
                }
            });
        }

        processItems(items, parentUrl, sitemap);

        // Get root page title for suffix
        const rootPage = pages['/'];
        const rootTitle = rootPage ? rootPage.name : 'VoyahChat';

        // Fix title generation with proper breadcrumb titles and root suffix
        Object.values(pages).forEach((pageData) => {
            const titleParts = [pageData.name];

            if (pageData.breadcrumbs.length > 0) {
            // Add parent titles in reverse order
                pageData.breadcrumbs.slice().reverse().forEach((breadcrumbUrl) => {
                    const breadcrumbPage = pages[breadcrumbUrl];
                    if (breadcrumbPage) {
                        titleParts.push(breadcrumbPage.name);
                    }
                });
            }

            // Add root title as suffix (but not for root page itself)
            if (pageData.url !== '/') {
                titleParts.push(rootTitle);
            }

            // Handle section index duplication
            if (
                pageData.breadcrumbs.length === 0
            && pageData.section
            && titleParts.length > 2
            && titleParts[0] === titleParts[1]
            ) {
                titleParts.shift(); // Remove the first duplicate
            }

            // Update the page data with proper title
            pages[pageData.url] = {
                ...pageData,
                title: titleParts.join(' | '),
            };
        });

        return { sitemap, pages, urlMapping };
    }

    /**
     * Get last modification date(s) from Git for file(s)
     * Performance optimization: reduces N Git calls to 1 call for multiple files
     * @param {string|string[]} filePaths - Single file path or array of relative file paths
     * @param {string} repoPath - Path to git repository
     * @returns {Promise<string|null|Map<string, string|null>>} Single date string, null, or Map
     */
    static async getLastModFromGit(filePaths, repoPath) {
    // Normalize to array for unified processing
        const filesArray = Array.isArray(filePaths) ? filePaths : [filePaths];

        if (filesArray.length === 0) {
            return Array.isArray(filePaths) ? new Map() : null;
        }

        const dateMap = new Map();

        try {
        // Single Git call for all files
            const { stdout } = await execFileAsync(
                'git',
                ['log', '--name-only', '--format=%cI', '--', ...filesArray],
                { cwd: repoPath },
            );

            const lines = stdout.trim().split('\n');
            let currentDate = null;

            for (const line of lines) {
                if (line.match(/^\d{4}-\d{2}-\d{2}T/)) {
                // This is a date line
                    currentDate = line.split('T')[0];
                } else if (line && currentDate) {
                // This is a filename line
                    dateMap.set(line, currentDate);
                }
            }

            // For files not found in Git history, set null
            filesArray.forEach(filePath => {
                if (!dateMap.has(filePath)) {
                    dateMap.set(filePath, null);
                }
            });

        } catch (error) {
        // If batch fails, set all to null
            filesArray.forEach(filePath => {
                dateMap.set(filePath, null);
            });
        }

        // Return appropriate type based on input
        if (Array.isArray(filePaths)) {
            return dateMap;
        } else {
            return dateMap.get(filePaths) || null;
        }
    }

    /**
     * Extract headings from markdown content for anchor mapping
     * @param {string} content - Markdown content
     * @param {string} _filePath - File path for context
     * @returns {Array} Array of heading objects with text, anchor, and level
     */
    static extractHeadingsFromMarkdown(content, _filePath) {
        const headings = [];
        const lines = content.split('\n');
        const slugifyFunc = createCyrillicSlugify('lower');

        // Track heading stack for hierarchical anchors
        const headingStack = [];

        for (const line of lines) {
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (!match) continue;

            const level = match[1].length;
            let headingText = match[2].trim();

            // Check for custom anchor syntax {#custom-id}
            let customAnchor = null;
            const customAnchorMatch = headingText.match(/\{#([^}]+)\}$/);
            if (customAnchorMatch) {
                customAnchor = customAnchorMatch[1];
                headingText = headingText.replace(/\s*\{#[^}]+\}$/, '').trim();
            }

            // Clean heading text for anchor generation
            const cleanText = cleanHeadingText(headingText);

            // Update heading stack
            headingStack.splice(level - 1);
            headingStack[level - 1] = cleanText;

            // Generate hierarchical anchor
            let anchorId;
            if (customAnchor) {
                anchorId = customAnchor;
            } else {
                // Build hierarchical anchor from current stack
                const currentStack = headingStack.slice(0, level);
                // Filter out empty strings to avoid leading dashes
                const validParts = currentStack.filter(part => part && part.trim() !== '');
                anchorId = validParts.map(part => slugifyFunc(part)).join('-');
            }

            headings.push({
                text: headingText,
                anchor: anchorId,
                level,
            });
        }

        return headings;
    }

    /**
     * Render markdown content to HTML
     * @param {string} markdownContent - Markdown content to render
     * @param {Object} options - Rendering options
     * @returns {string} HTML
     */
    static async renderMarkdownToHtml(markdownContent, options = {}) {
        const md = createMarkdownInstance(options);
        return md.render(markdownContent, options.env || {}, options);
    }

    /**
     * Build sitemap with the current options
     * @returns {Promise<Object>} Build result with sitemap structure
     */
    async build() {
        try {
            // Get project root dynamically to support testing
            const projectRoot = Dir.getRoot();
            const buildDir = Dir.getBuild();
            const siteDir = Dir.getSite();

            // Read sitemap.yml as YAML
            const sitemapPath = this.options.sitemapPath || path.join(projectRoot, 'config', 'sitemap.yml');
            const sitemapContent = await fs.readFile(sitemapPath, 'utf8');

            // Parse the indented sitemap format directly from content
            const navigation = SitemapBuilder.parseIndentedSitemap(sitemapContent);

            // Ensure build directory exists
            await Dir.ensure(buildDir);

            // Process sitemap items into structure
            const result = SitemapBuilder.processSitemap(navigation);

            // Reset processing state for fresh build
            resetProcessingState();

            // Build file-to-URL mappings BEFORE processing documents
            const md2url = {};
            const url2md = {};

            Object.entries(result.pages).forEach(([url, pageData]) => {
                const filePath = pageData.file;

                if (filePath && url) {
                    // Map full file path to URL
                    md2url[filePath] = url;

                    // Map URL back to file path
                    url2md[url] = filePath;
                }
            });

            // Create sitemap object with mappings for document processing
            const sitemapWithMappings = {
                sitemap: result.sitemap,
                pages: result.pages,
                md2url,
                url2md,
            };

            // Extract headings from all markdown files for anchor mapping
            const contentDir = path.join(projectRoot, 'external', 'voyahchat-content');
            const pages = { ...result.pages };

            // Process all pages using the new processDocument function
            const pagePromises = Object.entries(result.pages).map(async ([url, pageData]) => {
                const filePath = pageData.file;
                if (!filePath) return;

                try {
                    const fullPath = path.join(contentDir, filePath);

                    // Use processDocument for lazy anchor resolution
                    const html = processDocument(url, fullPath, sitemapWithMappings, {
                        imageMapping: getImageMapping(),
                    });

                    // Add HTML to page data
                    pages[url] = {
                        ...pageData,
                        html,
                    };
                } catch (error) {
                    // If file doesn't exist or can't be read, keep original page data without HTML
                    console.warn(`Warning: Could not process ${filePath}: ${error.message}`);
                    pages[url] = {
                        ...pageData,
                        html: '',
                    };
                }
            });

            // Wait for all page processing to complete
            await Promise.all(pagePromises);

            // HTML is already correctly generated with proper anchors and links
            // No post-processing needed as per AGENTS.md rule

            // Create the new optimized structure (md2url and url2md already built above)
            const optimizedStructure = {
                sitemap: result.sitemap,
                pages, // Use pages with HTML
                md2url,
                url2md,
            };

            // Write optimized structure to .build/sitemap.json unless skipWrite is true
            if (!this.options.skipWrite) {
                const sitemapJsonPath = this.options.outputPath || path.join(
                    projectRoot,
                    '.build',
                    'sitemap.json',
                );

                await fs.writeFile(sitemapJsonPath, JSON.stringify(optimizedStructure, null, 4), 'utf8');
            }

            // Generate sitemap.xml for SEO unless skipWrite is true
            if (!this.options.skipWrite) {
                const xmlDir = path.join(siteDir, 'xml');
                await Dir.ensure(xmlDir);

                const sitemapXmlPath = path.join(xmlDir, 'sitemap.xml');

                // Generate sitemap.xml content with batch Git optimization
                const contentDir = path.join(projectRoot, 'external', 'voyahchat-content');

                // Get all file paths for batch processing
                const filePaths = Object.values(pages).map(pageData => pageData.file);
                const lastModDates = await SitemapBuilder.getLastModFromGit(filePaths, contentDir);

                const urlEntries = Object.entries(pages).map(([url, pageData]) => {
                    const lastmod = lastModDates.get(pageData.file);
                    const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';

                    return `<url><loc>${BASE_URL}${url}</loc>${lastmodTag}</url>`;
                });
                const urlEntriesStr = urlEntries.join('');

                const sitemapXml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntriesStr}</urlset>`;

                await fs.writeFile(sitemapXmlPath, sitemapXml, 'utf8');

                // Collect statistics for sitemap.xml
                const statsInstance = new Stats('build-sitemap.json');
                const fileStats = await fs.stat(sitemapXmlPath);
                statsInstance.add(
                    'sitemap.xml',
                    '.build/sitemap.json',
                    fileStats.size,
                    {
                        url: '/sitemap.xml',
                        urlsCount: Object.keys(result.pages).length,
                    },
                );
                await statsInstance.save();
            }

            return optimizedStructure;
        } catch (error) {
            throw new Error(`Sitemap generation failed: ${error.message}`);
        }
    }
}

module.exports = {
    SitemapBuilder,
    parseSitemapLine: SitemapBuilder.parseSitemapLine,
    buildFullUrl: SitemapBuilder.buildFullUrl,
    parseIndentedSitemap: SitemapBuilder.parseIndentedSitemap,
    processSitemap: SitemapBuilder.processSitemap,
    getLastModFromGit: SitemapBuilder.getLastModFromGit,
    extractHeadingsFromMarkdown: SitemapBuilder.extractHeadingsFromMarkdown,
    renderMarkdownToHtml: SitemapBuilder.renderMarkdownToHtml,
};

// Run the script
if (require.main === module) {
    const builder = new SitemapBuilder();
    builder.build().catch((error) => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}
