/**
 * Markdown Processing Module
 *
 * Responsibilities:
 * - Configure markdown-it with custom renderers
 * - Handle heading anchors and hierarchical IDs
 * - Process images with hash mapping
 * - Transform links and anchors
 * - Apply Russian typography rules
 * - Generate pre-minified HTML
 *
 * Dependencies: markdown-it, markdown-it-video
 * Used by: build-sitemap.js, tests
 *
 * @module build/markdown
 */

const fs = require('fs');
const path = require('path');
const markdownIt = require('markdown-it');
const markdownItVideo = require('markdown-it-video');
const { getSitemap, getImageMapping, getAssetsMapping } = require('./utils');

/**
 * Create a slugify function that preserves Cyrillic characters.
 * This matches the interface expected by TOC processing.
 */
function createCyrillicSlugify(caseType = 'lower') {
    return function cyrillicSlugify(text, separator = '-') {
        // Apply case transformation
        if (caseType === 'lower') {
            text = text.toLowerCase();
        } else if (caseType === 'upper') {
            text = text.toUpperCase();
        }

        // Remove HTML tags
        text = text.replace(/<[^>]+>/g, '');

        // Remove trailing dots from numbered headings (e.g., "1. Text" -> "1 Text")
        if (/^\d+\.\s/.test(text)) {
            text = text.replace(/^(\d+)\.\s/, '$1 ');
        }

        // Replace slashes with the specified separator first
        text = text.replace(/[/\\]+/g, separator);

        // Replace whitespace and other separators with the specified separator
        text = text.replace(/[\s_]+/g, separator);

        // Remove characters that are not letters, digits, or the separator
        // Keep Cyrillic letters (U+0400-U+04FF), Latin letters (a-zA-Z), digits (0-9), dots, and separator
        const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`[^a-zA-Z0-9\\u0400-\\u04FF\\.${escapedSeparator}]+`, 'g');
        text = text.replace(pattern, '');

        // Remove leading/trailing separators
        text = text.replace(new RegExp(`^${escapedSeparator}+|${escapedSeparator}+$`, 'g'), '');

        // Collapse multiple separators
        text = text.replace(new RegExp(`${escapedSeparator}+`, 'g'), separator);

        return text;
    };
}

/**
 * Clean heading text by removing HTML tags and numbered prefixes.
 */
function cleanHeadingText(text) {
    // Remove HTML tags
    let cleanText = text.replace(/<[^>]+>/g, '');

    // Remove numbered prefixes like "1. ", "2.1. ", "2.1.3. ", etc.
    // The pattern matches: start of string + digits + optional dot + digits + dot + space + rest of text
    // This preserves version numbers like "2.4.3", "1.2.3.4.5" when they're not at the beginning
    cleanText = cleanText.replace(/^\d+(?:\.\d+)*\.\s+(?=\S)/, '').trim();

    return cleanText.trim();
}

/**
 * Build hierarchical anchor from heading stack.
 */
function buildHierarchicalAnchor(headingStack, slugifyFunc = null) {
    if (!slugifyFunc) {
        slugifyFunc = createCyrillicSlugify();
    }

    if (!headingStack || headingStack.length === 0) {
        return '';
    }

    // Generate hierarchical anchor, preserving empty strings for double hyphens
    // but filter out leading empty/undefined strings to avoid starting with dash
    const anchorParts = headingStack
        .map(heading => slugifyFunc(heading || ''));

    // Find the first non-empty part
    let firstNonEmptyIndex = 0;
    while (firstNonEmptyIndex < anchorParts.length &&
           (anchorParts[firstNonEmptyIndex] === '' || anchorParts[firstNonEmptyIndex] === undefined)) {
        firstNonEmptyIndex++;
    }

    // If all parts are empty, return empty string
    if (firstNonEmptyIndex >= anchorParts.length) {
        return '';
    }

    // Join from the first non-empty part, preserving empty strings after that for double hyphens
    return anchorParts.slice(firstNonEmptyIndex).join('-');
}


/**
 * Transform GitHub raw asset links to local site URLs
 */
function transformAssetLinkPath(originalHref) {
    if (!originalHref) return originalHref;

    const assets = getAssetsMapping();
    if (assets[originalHref]) {
        return assets[originalHref];
    }

    return originalHref;
}

/**
 * Get current page section from environment context
 */
function getCurrentSection(env) {
    // Try to extract section from the current page data
    if (env && env.page && env.page.inputPath) {
        const inputPath = env.page.inputPath;
        const relativePath = inputPath.replace('./external/voyahchat-content/', '');
        const pathParts = relativePath.split('/');

        if (pathParts.length > 1) {
            return pathParts[0];
        }
    }
    return null;
}

/**
 * Transform internal anchor links to context-aware hierarchical anchors
 * @param {string} originalHref - Original href
 * @param {Object} env - Environment context
 * @param {Object} sitemap - Sitemap data object
 * @returns {string} Transformed href or original href
 */
function transformAnchorLink(originalHref, env) {
    if (!originalHref || !originalHref.startsWith('#')) {
        return originalHref;
    }

    // Extract the GitHub-style anchor (remove the # prefix)
    const githubAnchor = originalHref.substring(1);

    // First, try to find in anchor mapping if available (for already processed anchors)
    if (env && env._processingState && env._currentUrl) {
        const anchorMapping = env._processingState.anchorMap.get(env._currentUrl);
        if (anchorMapping) {
            const decodedAnchor = decodeURIComponent(githubAnchor);
            const hierarchicalAnchor = anchorMapping.get(githubAnchor) || anchorMapping.get(decodedAnchor);
            if (hierarchicalAnchor) {
                return `#${hierarchicalAnchor}`;
            }
        }
    }

    // If not found in mapping and we have a heading stack,
    // build hierarchical anchor for forward references (links before heading is defined)
    if (env && env._headingStack && env._headingStack.length > 0) {
        const slugifyFunc = createCyrillicSlugify('lower');

        // Remove any GitHub-style duplicate suffix (-1, -2, etc.) from the anchor
        const anchorWithoutSuffix = githubAnchor.replace(/-\d+$/, '');

        // Build hierarchical anchor: current context + anchor text
        const contextParts = env._headingStack.filter(h => h); // Remove empty entries
        const fullStack = [...contextParts, anchorWithoutSuffix];
        const hierarchicalAnchor = buildHierarchicalAnchor(fullStack, slugifyFunc);

        // Only return the hierarchical anchor if it's different from the original
        // This prevents transforming anchors that don't correspond to actual headings
        if (hierarchicalAnchor && hierarchicalAnchor !== githubAnchor) {
            return `#${hierarchicalAnchor}`;
        }
    }

    return originalHref;
}

/**
 * Transform relative markdown links to correct site URLs
 * @param {string} originalHref - Original href
 * @param {Object} env - Environment context
 * @param {Object} sitemapData - Sitemap data object
 * @returns {string} Transformed href or original href
 */
function transformLinkPath(originalHref, env, sitemapData) {
    if (!originalHref) return originalHref;

    // Validate sitemap parameter
    if (!sitemapData) {
        throw new Error('transformLinkPath: sitemap parameter is required');
    }

    // Skip external links, absolute paths, and file extensions
    if (originalHref.startsWith('http://') ||
        originalHref.startsWith('https://') ||
        originalHref.startsWith('mailto:') ||
        originalHref.startsWith('/') ||
        /\.(png|jpg|jpeg|gif|svg|pdf|zip)$/i.test(originalHref)) {
        return originalHref;
    }

    // Transform internal anchor links
    if (originalHref.startsWith('#')) {
        return transformAnchorLink(originalHref, env);
    }

    // Use the sitemap parameter directly
    const md2urlToUse = sitemapData.md2url || {};

    if (Object.keys(md2urlToUse).length === 0) {
        return originalHref;
    }

    // Get current page's section for context
    const currentSection = getCurrentSection(env);

    // Separate anchor from link target
    let anchor = '';
    let baseTarget = originalHref;
    if (originalHref.includes('#')) {
        [baseTarget, anchor] = originalHref.split('#', 2);
        anchor = `#${anchor}`;
    }

    // Handle relative markdown links (app.md -> app)
    if (baseTarget.endsWith('.md')) {
        let mdTarget = baseTarget;
        let mappedUrl = null;

        // Handle relative paths like ../free/tyres.md
        if (mdTarget.startsWith('../')) {
            // Resolve relative path based on current file location
            if (env && env.page && env.page.inputPath) {
                const inputPath = env.page.inputPath.replace('./external/voyahchat-content/', '');
                const currentDir = path.dirname(inputPath);

                // Resolve the relative path by removing ../ and joining with current directory
                const pathParts = mdTarget.split('/');
                const upLevels = pathParts.filter(part => part === '..').length;
                const remainingParts = pathParts.filter(part => part !== '..');

                // Go up from current directory and add remaining path
                const currentDirParts = currentDir.split('/');
                const targetDirParts = currentDirParts.slice(0, -upLevels);
                const resolvedPath = [...targetDirParts, ...remainingParts].join('/');

                if (md2urlToUse[resolvedPath]) {
                    mappedUrl = md2urlToUse[resolvedPath];
                }

                // Update mdTarget to resolved path for further processing
                if (mappedUrl) {
                    mdTarget = resolvedPath;
                }
            }
        }

        // Try exact filename match first (for resolved paths or non-relative paths)
        if (!mappedUrl && md2urlToUse[mdTarget]) {
            mappedUrl = md2urlToUse[mdTarget];
        }

        // Then try with current section prefix (only for non-relative paths)
        if (!mappedUrl && currentSection && !baseTarget.startsWith('../')) {
            const sectionFile = `${currentSection}/${mdTarget}`;
            if (md2urlToUse[sectionFile]) {
                mappedUrl = md2urlToUse[sectionFile];
            }
        }

        // Finally, try to find any file that ends with the target filename
        // This handles cases where files are in different sections but referenced relatively
        if (!mappedUrl) {
            // Extract just the filename without path
            const basename = mdTarget.split('/').pop();

            // Look for files with matching basename in the current section first
            if (currentSection) {
                for (const [mappedFile, mappedUrlValue] of Object.entries(md2urlToUse)) {
                    const mappedBasename = mappedFile.split('/').pop();
                    if (mappedBasename === basename && mappedFile.startsWith(`${currentSection}/`)) {
                        mappedUrl = mappedUrlValue;
                        break;
                    }
                }
            }

            // If still not found, look in any section
            if (!mappedUrl) {
                for (const [mappedFile, mappedUrlValue] of Object.entries(md2urlToUse)) {
                    if (mappedFile.endsWith('/' + mdTarget) || mappedFile === mdTarget) {
                        mappedUrl = mappedUrlValue;
                        break;
                    }
                }
            }
        }

        // Validation: If no mapping found, throw error for unknown markdown file
        if (!mappedUrl) {
            const filePath = env && env.page && env.page.inputPath
                ? env.page.inputPath
                : 'unknown file';
            throw new Error(
                `Unknown relative link in ${filePath}: "${originalHref}"\n` +
                `Markdown file not found in sitemap. The file "${baseTarget}" does not exist in config/sitemap.yml.`,
            );
        }

        if (mappedUrl) {
            // Always decode URL-encoded anchors to readable Cyrillic text
            if (anchor) {
                try {
                    const decodedAnchor = decodeURIComponent(anchor.substring(1));
                    // Use decoded anchor if it contains Cyrillic characters
                    if (/[\u0400-\u04FF]/.test(decodedAnchor)) {
                        anchor = `#${decodedAnchor}`;
                    }
                } catch (error) {
                    // If decoding fails, keep original anchor
                }
            }
            return mappedUrl + anchor;
        }
    }

    // Validation: Detect unknown relative link types (non-markdown files that aren't allowed)
    // Skip external links, absolute paths, and allowed file extensions
    if (!originalHref.startsWith('http://') &&
        !originalHref.startsWith('https://') &&
        !originalHref.startsWith('mailto:') &&
        !originalHref.startsWith('/') &&
        !originalHref.startsWith('#')) {

        // Check if it's a relative link to a non-markdown file (excluding allowed extensions)
        const hasDisallowedExtension = /\.(html|php|asp|jsp)$/i.test(baseTarget);

        if (hasDisallowedExtension) {
            const filePath = env && env.page && env.page.inputPath
                ? env.page.inputPath
                : 'unknown file';
            // Extract extension and create a descriptive link type
            const ext = baseTarget.match(/\.([^.]+)$/)?.[1] || 'unknown';
            const linkType = `${ext}/${baseTarget}`;
            throw new Error(
                `Unknown relative link type in ${filePath}: "${linkType}"\n` +
                'Relative links to .html, .php, and similar files are not allowed. Use .md files or absolute URLs.',
            );
        }
    }

    return originalHref;
}

/**
 * Transform image path to hashed version
 * @param {string} originalPath - Original image path
 * @param {Object} options - Options object with optional imageMapping and env context
 * @returns {string} Transformed path or original path if not found
 */
function transformImagePath(originalPath, options = {}) {
    if (!originalPath) return originalPath;

    // Skip external URLs, data URLs, and already hashed paths
    if (originalPath.startsWith('http://') ||
        originalPath.startsWith('https://') ||
        originalPath.startsWith('data:') ||
        originalPath.startsWith('//') ||
        /^\/[a-f0-9]{16}\.(png|jpg|jpeg|gif|svg|webp)$/i.test(originalPath)) {
        return originalPath;
    }

    // Use provided imageMapping if available (parameter priority)
    const mappingToUse = options.imageMapping || getImageMapping();

    // Normalize the path for mapping lookup
    const normalizedPath = originalPath.replace(/^\/+/, '').replace(/\\/g, '/');

    // Check if we have a direct mapping for this image
    if (mappingToUse[normalizedPath]) {
        const hashedFilename = mappingToUse[normalizedPath];
        return `/${hashedFilename}`;
    }

    // Try to resolve relative path based on current file location
    if (options.env && options.env.page && options.env.page.inputPath) {
        const inputPath = options.env.page.inputPath;
        const relativePath = inputPath.replace('./external/voyahchat-content/', '');
        const pathParts = relativePath.split('/');

        if (pathParts.length > 1) {
            const currentSection = pathParts[0];
            const sectionImagePath = `${currentSection}/${normalizedPath}`;

            if (mappingToUse[sectionImagePath]) {
                const hashedFilename = mappingToUse[sectionImagePath];
                return `/${hashedFilename}`;
            }
        }
    }

    // If no direct match, try to find by filename in all directories
    const filename = normalizedPath.split('/').pop();
    for (const [mappedPath, hashedFilename] of Object.entries(mappingToUse)) {
        if (mappedPath.endsWith('/' + filename) || mappedPath === filename) {
            return `/${hashedFilename}`;
        }
    }

    // Log unmapped images for debugging (only once per image and only in non-test environments)
    if (!transformImagePath._loggedImages) {
        transformImagePath._loggedImages = new Set();
    }
    if (!transformImagePath._loggedImages.has(normalizedPath) && process.env.NODE_ENV !== 'test') {
        console.warn(`⚠️  Unmapped image: ${originalPath}`);
        transformImagePath._loggedImages.add(normalizedPath);
    }
    return originalPath;
}

/**
 * Apply Russian typography rules to text content
 * Replaces regular spaces around em dash with non-breaking spaces to prevent wrapping
 */
function applyRussianTypography(text) {
    if (!text || typeof text !== 'string') return text;

    // Pattern 1: space-em dash-space -> non-breaking space-em dash-regular space
    let result = text.replace(/ — /g, '\u00A0— ');

    // Pattern 2: space-em dash-no space -> non-breaking space-em dash-regular space
    result = result.replace(/ —(?=[^\s])/g, '\u00A0— ');

    // Pattern 3: no space-em dash-space -> non-breaking space-em dash-regular space
    result = result.replace(/(?<=[^\s])— /g, '\u00A0— ');

    // Pattern 4: no space-em dash-no space (between words) -> non-breaking space-em dash-regular space
    // This handles cases where words are directly connected with em dash
    result = result.replace(/(?<=[a-zA-Zа-яА-ЯёЁ])—(?=[a-zA-Zа-яА-ЯёЁ])/g, '\u00A0— ');

    return result;
}

/**
 * Format HTML attribute without quotes when safe (HTML5 rules)
 * Quotes are required if value contains: space, quote, equals, angle brackets, backtick, or is empty
 * @param {string} name - Attribute name
 * @param {string} value - Attribute value
 * @returns {string} Formatted attribute string
 */
function formatAttribute(name, value) {
    // Must quote if: empty, has spaces, quotes, equals, or special chars
    const needsQuotes = value === '' || /[\s"'=<>`]/.test(value);
    return needsQuotes ? `${name}="${value}"` : `${name}=${value}`;
}

/**
 * Build attributes string with class always first
 * @param {Array<string>} attrs - Array of formatted attribute strings
 * @returns {string} Joined attributes with class first
 */
function buildAttributesWithClassFirst(attrs) {
    // Separate class attribute from others
    const classAttr = attrs.find(attr => attr.startsWith('class=') || attr.startsWith('class="'));
    const otherAttrs = attrs.filter(attr => !attr.startsWith('class=') && !attr.startsWith('class="'));

    // Return with class first if it exists
    if (classAttr) {
        return [classAttr, ...otherAttrs].join(' ');
    }
    return attrs.join(' ');
}

/**
 * Process HTML img tags to replace src with hashed versions
 */
function processHtmlImages(html, options = {}) {
    // Regex to find img tags and extract src attribute
    const imgRegex = /<img([^>]*?)\s+src=['"]([^'"]+)['"]([^>]*?)>/gi;

    return html.replace(imgRegex, (match, beforeSrc, src, afterSrc) => {
        // Transform the src path with options
        const transformedSrc = transformImagePath(src, options);

        // If the src was transformed, update the img tag
        if (transformedSrc !== src) {
            return `<img${beforeSrc} src="${transformedSrc}"${afterSrc}>`;
        }

        // Otherwise return the original img tag
        return match;
    });
}

/**
 * Configure custom markdown-it instance with article classes and hierarchical anchors
 * Handles heading anchors, CSS classes for all elements, and image processing
 * @param {Object} options - Configuration options
 * @param {Object} options.imageMapping - Optional image mapping object to use instead of loading from file
 * @param {Object} options.sitemap - Optional sitemap data object to use instead of loading from file
 * @returns {Object} Configured markdown-it instance
 */
function createMarkdownInstance(options = {}) {
    // Store options for use in renderers
    createMarkdownInstance._options = options;

    // Configure custom markdown-it with article classes
    // Set xhtmlOut: false for HTML5 mode to enable optional closing tags
    const md = markdownIt({
        html: true,
        breaks: false,
        linkify: true,
        xhtmlOut: false,
    });

    // Add video embed support with @[youtube](VIDEO_ID) syntax
    // Use HTML5-compliant attributes only
    md.use(markdownItVideo, {
        youtube: {
            width: 560,
            height: 315,
            parameters: 'rel=0&modestbranding=1',
            containerClass: 'video',
            iframeClass: 'video__iframe',
            nocookie: false,
        },
    });

    // Add typography plugin before other processing
    md.use(function(md) {
        md.core.ruler.before('normalize', 'russian_typography', function(state) {
            // Apply typography to the source text before tokenization
            state.src = applyRussianTypography(state.src);
        });
    });

    // Initialize heading stack for hierarchical anchors - make it instance-specific
    const slugifyFunc = createCyrillicSlugify('lower');

    // Store original renderers
    const originalText = md.renderer.rules.text || function(tokens, idx, _options, _env, _renderer) {
        return _renderer.renderToken(tokens, idx, _options);
    };

    const originalCodeInline = md.renderer.rules.code_inline ||
        function(tokens, idx, _options, _env, _renderer) {
            return _renderer.renderToken(tokens, idx, _options);
        };

    // Custom renderer for headings with anchor generation
    md.renderer.rules.heading_open = function(tokens, idx, _options, env) {
        const token = tokens[idx];
        const level = parseInt(token.tag.slice(1)); // Extract level from h1, h2, etc.

        // Initialize heading stack for this environment if not exists
        if (!env) env = {};
        if (!env._headingStack) env._headingStack = [];

        // Initialize generated IDs tracking for duplicate detection
        if (!env._generatedIds) env._generatedIds = new Set();

        // Find the heading content from the next inline token
        let headingText = '';
        const inlineToken = tokens[idx + 1];
        if (inlineToken && inlineToken.type === 'inline') {
            headingText = inlineToken.content;
        }

        // Track current H1 context for anchor resolution
        if (level === 1) {
            const cleanText = cleanHeadingText(headingText);
            const slugifyFunc = createCyrillicSlugify('lower');
            env._currentH1Context = slugifyFunc(cleanText);
        }

        // Check for custom anchor syntax {#custom-id}
        let customAnchor = null;
        const customAnchorMatch = headingText.match(/\{#([^}]+)\}$/);
        if (customAnchorMatch) {
            customAnchor = customAnchorMatch[1];
            headingText = headingText.replace(/\s*\{#[^}]+\}$/, '').trim();

            // Update the inline token content and its children to remove the custom anchor syntax
            if (inlineToken) {
                inlineToken.content = headingText;
                if (inlineToken.children && inlineToken.children.length > 0) {
                    // Update the first text child token
                    inlineToken.children[0].content = headingText;
                }
            }
        }

        // Clean heading text for anchor generation
        const cleanText = cleanHeadingText(headingText);

        // Update heading stack for hierarchical anchors
        env._headingStack.splice(level - 1); // Remove deeper levels
        env._headingStack[level - 1] = cleanText;

        // Generate anchor ID
        let anchorId;
        if (customAnchor) {
            anchorId = customAnchor;
        } else {
            // Use hierarchical anchor generation
            const currentStack = env._headingStack.slice(0, level);
            anchorId = buildHierarchicalAnchor(currentStack, slugifyFunc);
        }

        // Validation: Check for duplicate IDs
        if (anchorId && env._generatedIds.has(anchorId)) {
            const filePath = env && env.page && env.page.inputPath
                ? env.page.inputPath
                : 'unknown file';
            throw new Error(
                `Duplicate heading ID in ${filePath}: "${headingText}"\n` +
                `The heading "${headingText}" generates a duplicate ID "${anchorId}". ` +
                `Use custom anchor syntax like "# ${headingText} {#custom-id}" to create a unique ID.`,
            );
        }

        // Track this ID as generated
        if (anchorId) {
            env._generatedIds.add(anchorId);
        }

        // Collect anchor mappings for cross-document link resolution
        if (env._processingState && env._currentUrl) {
            const { anchorMap } = env._processingState;
            if (!anchorMap.has(env._currentUrl)) {
                anchorMap.set(env._currentUrl, new Map());
            }
            const urlAnchors = anchorMap.get(env._currentUrl);

            // Generate GitHub-style slug from original heading text
            const githubSlug = createGitHubSlug(headingText);


            // Handle duplicate GitHub-style anchors by adding suffixes
            // Track how many times we've seen this slug
            if (!env._githubSlugCounts) {
                env._githubSlugCounts = new Map();
            }

            let finalGithubSlug = githubSlug;
            if (env._githubSlugCounts.has(githubSlug)) {
                const count = env._githubSlugCounts.get(githubSlug);
                finalGithubSlug = `${githubSlug}-${count}`;
                env._githubSlugCounts.set(githubSlug, count + 1);
            } else {
                env._githubSlugCounts.set(githubSlug, 1);
            }

            // Store BOTH decoded and encoded versions
            urlAnchors.set(finalGithubSlug, anchorId);
            urlAnchors.set(encodeURIComponent(finalGithubSlug), anchorId);
        }

        // Set CSS classes using formatAttribute
        const existingClass = token.attrGet('class') || '';
        const newClass = `article__heading article__heading_level_${level}`;
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;

        // Build attributes manually with formatAttribute
        const attrs = [];
        attrs.push(formatAttribute('class', finalClass));

        // Set the ID attribute
        if (anchorId) {
            attrs.push(formatAttribute('id', anchorId));

            // Wrap the heading content in anchor link by modifying the inline token's children
            if (inlineToken && inlineToken.children && inlineToken.children.length > 0) {
                const textToken = inlineToken.children[0];
                if (textToken.type === 'text') {
                    // Replace text token with HTML token containing anchor link with minified attributes
                    const anchorLink = `<a ${formatAttribute('href', `#${anchorId}`)} ` +
                        `${formatAttribute('class', 'article__heading-anchor')}>${textToken.content}</a>`;
                    inlineToken.children[0] = {
                        type: 'html_inline',
                        tag: '',
                        content: anchorLink,
                        level: textToken.level,
                        block: false,
                    };
                }
            }
        }

        // Return opening tag with minified attributes (class first)
        return `<${token.tag} ${buildAttributesWithClassFirst(attrs)}>`;
    };

    // Custom renderer for paragraphs
    md.renderer.rules.paragraph_open = function(tokens, idx, _options, _env, _renderer) {
        // Check if we're inside a list item by looking at surrounding tokens
        // Skip paragraph wrapper in list items to avoid invalid HTML structure
        let prevToken = null;
        let nextToken = null;

        // Find previous non-inline token
        for (let i = idx - 1; i >= 0; i--) {
            if (tokens[i].type !== 'inline') {
                prevToken = tokens[i];
                break;
            }
        }

        // Find next non-inline, non-paragraph token
        for (let i = idx + 1; i < tokens.length; i++) {
            if (tokens[i].type !== 'inline' && tokens[i].type !== 'paragraph_close') {
                nextToken = tokens[i];
                break;
            }
        }

        // Skip paragraph wrapper if we're in a list item
        // Cases:
        // 1. Simple list item:
        //    list_item_open -> paragraph_open -> inline -> paragraph_close -> list_item_close
        // 2. List item with nested list:
        //    list_item_open -> paragraph_open -> inline -> paragraph_close -> bullet_list_open
        // 3. List item with nested list:
        //    list_item_open -> paragraph_open -> inline -> paragraph_close -> ordered_list_open
        if (prevToken && prevToken.type === 'list_item_open') {
            if (nextToken && (
                nextToken.type === 'list_item_close' ||
                nextToken.type === 'bullet_list_open' ||
                nextToken.type === 'ordered_list_open'
            )) {
                return '';
            }
        }

        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__paragraph';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<p ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for links with link mapping and cross-document anchor resolution
    md.renderer.rules.link_open = function(tokens, idx, _options, env, _renderer) {
        const token = tokens[idx];

        // Transform the href attribute if it's a relative link
        let href = token.attrGet('href');
        if (href) {
            // Get sitemap from env
            const sitemap = env._sitemap;
            if (!sitemap) {
                throw new Error('link_open renderer: sitemap is missing from env._sitemap');
            }

            // STEP 1: Transform .md links to URLs (handles section context)
            if (href.endsWith('.md') || href.includes('.md#') || href.includes('.md?')) {
                let newHref = transformLinkPath(href, env, sitemap);

                // STEP 2: If it has an anchor AND we have processing state, resolve the anchor
                if (newHref.includes('#') && env._processingState && env._currentUrl) {
                    const [baseUrl, githubAnchor] = newHref.split('#', 2);

                    // Check if target document is processed
                    if (!env._processingState.completed.has(baseUrl)) {
                        // Recursively process target document
                        if (env._processDocument) {
                            const url2md = sitemap.url2md || {};
                            const targetMdPath = url2md[baseUrl];
                            if (targetMdPath) {
                                const targetFilePath = path.join('./external/voyahchat-content/', targetMdPath);
                                if (fs.existsSync(targetFilePath)) {
                                    try {
                                        env._processDocument(baseUrl, targetFilePath, sitemap);
                                    } catch (error) {
                                        if (!error.message.includes('Circular dependency')) {
                                            console.warn(`⚠️  Error processing ${targetFilePath}: ${error.message}`);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Resolve anchor
                    const anchorMapping = env._processingState.anchorMap.get(baseUrl);
                    if (anchorMapping) {
                        const decodedAnchor = decodeURIComponent(githubAnchor);
                        const ourAnchor = anchorMapping.get(githubAnchor) ||
                                        anchorMapping.get(decodedAnchor);
                        if (ourAnchor) {
                            newHref = `${baseUrl}#${ourAnchor}`;
                        }
                    }
                }

                // Update href for rendering
                href = newHref;
            } else {
                // Handle non-.md links
                let transformedHref = transformLinkPath(href, env, sitemap);
                // Apply asset transformation only if the link wasn't already transformed
                if (transformedHref === href) {
                    transformedHref = transformAssetLinkPath(href);
                }

                if (transformedHref !== href) {
                    href = transformedHref;
                }
            }
        }

        const existingClass = token.attrGet('class') || '';
        // Skip if it's already an article__heading-anchor
        const attrs = [];
        if (!existingClass.includes('article__heading-anchor')) {
            const newClass = 'article__link';
            const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
            attrs.push(formatAttribute('class', finalClass));
        } else if (existingClass) {
            attrs.push(formatAttribute('class', existingClass));
        }
        if (href) {
            attrs.push(formatAttribute('href', href));
        }
        return `<a ${buildAttributesWithClassFirst(attrs)}>`;
    };

    // Custom renderer for bullet lists
    md.renderer.rules.bullet_list_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__list';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<ul ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for ordered lists
    md.renderer.rules.ordered_list_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__list article__list_ordered';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<ol ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for list items
    md.renderer.rules.list_item_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__list-item';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<li ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for blockquotes
    md.renderer.rules.blockquote_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__blockquote';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<blockquote ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for images with hash processing
    md.renderer.rules.image = function(tokens, idx, options, env, _renderer) {
        const token = tokens[idx];

        // Transform image src to hashed version
        let src = token.attrGet('src');
        if (src) {
            // Pass through the createMarkdownInstance options for imageMapping and env context
            const transformOptions = {
                ...createMarkdownInstance._options,
                env,
            };
            const transformedSrc = transformImagePath(src, transformOptions);
            if (transformedSrc !== src) {
                src = transformedSrc;
            }
        }

        // Get alt and title attributes
        const alt = token.content || '';
        const title = token.attrGet('title') || '';

        // Set CSS classes
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__image';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;

        // Build attributes with class first
        const attrs = [];
        attrs.push(formatAttribute('class', finalClass));
        if (src) attrs.push(formatAttribute('src', src));
        if (alt) attrs.push(formatAttribute('alt', alt));
        if (title) attrs.push(formatAttribute('title', title));

        return `<img ${buildAttributesWithClassFirst(attrs)}>`;
    };

    // Custom renderer for text with Russian typography
    md.renderer.rules.text = function(tokens, idx, options, env, renderer) {
        const token = tokens[idx];

        // Apply Russian typography rules to text content
        if (token.content) {
            token.content = applyRussianTypography(token.content);
        }

        return originalText(tokens, idx, options, env, renderer);
    };

    // Also apply typography to inline tokens
    const originalInline = md.renderer.rules.inline || function(tokens, idx, options, env, renderer) {
        return renderer.renderToken(tokens, idx, options);
    };

    md.renderer.rules.inline = function(tokens, idx, options, env, renderer) {
        const token = tokens[idx];

        // Apply typography to all child tokens
        if (token.children) {
            token.children.forEach(child => {
                if (child.type === 'text' && child.content) {
                    child.content = applyRussianTypography(child.content);
                }
            });
        }

        return originalInline(tokens, idx, options, env, renderer);
    };

    // Custom renderer for code blocks to transform asset URLs and add copy functionality
    md.renderer.rules.code_block = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];


        let content = token.content;

        const assets = getAssetsMapping();
        for (const [originalUrl, localUrl] of Object.entries(assets)) {
            // Replace GitHub raw URL with https://voyahchat.ru/localUrl
            const siteUrl = `https://voyahchat.ru${localUrl}`;
            // Use regex with word boundaries to ensure exact matching
            const escapedUrl = originalUrl.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&',
            );
            const regex = new RegExp(escapedUrl, 'g');
            content = content.replace(regex, siteUrl);
        }

        token.content = content;

        // Generate custom HTML with article__code class and copy button
        const copyBtn = `<button ${formatAttribute('type', 'button')} ` +
            `${formatAttribute('class', 'article__code-copy')} ` +
            `${formatAttribute('aria-label', 'Copy code to clipboard')} ` +
            `${formatAttribute('title', 'Copy code')}></button>`;
        return `<pre ${formatAttribute('class', 'article__code')}><code>${content}</code>` +
            `${copyBtn}</pre>`;
    };
    // Custom renderer for fence blocks (fenced code blocks) to transform asset URLs and add copy functionality
    md.renderer.rules.fence = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];



        let content = token.content;

        const assets = getAssetsMapping();
        for (const [originalUrl, localUrl] of Object.entries(assets)) {
            // Replace GitHub raw URL with https://voyahchat.ru/localUrl
            const siteUrl = `https://voyahchat.ru${localUrl}`;
            // Use regex with word boundaries to ensure exact matching
            const escapedUrl = originalUrl.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&',
            );
            const regex = new RegExp(escapedUrl, 'g');
            content = content.replace(regex, siteUrl);
        }

        token.content = content;

        // Generate custom HTML with article__code class and copy button
        const copyBtn = `<button ${formatAttribute('type', 'button')} ` +
            `${formatAttribute('class', 'article__code-copy')} ` +
            `${formatAttribute('aria-label', 'Copy code to clipboard')} ` +
            `${formatAttribute('title', 'Copy code')}></button>`;
        return `<pre ${formatAttribute('class', 'article__code')}><code>${content}</code>` +
            `${copyBtn}</pre>`;
    };

    // Custom renderer for inline code to transform asset URLs
    md.renderer.rules.code_inline = function(tokens, idx, options, env, renderer) {
        const token = tokens[idx];

        let content = token.content;
        const assets = getAssetsMapping();
        for (const [originalUrl, localUrl] of Object.entries(assets)) {
            const siteUrl = `https://voyahchat.ru${localUrl}`;
            // Use regex with word boundaries to ensure exact matching
            const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedUrl, 'g');
            content = content.replace(regex, siteUrl);
        }
        token.content = content;
        return originalCodeInline(tokens, idx, options, env, renderer);
    };

    // Custom renderer for tables
    md.renderer.rules.table_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__table';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<table ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for table head
    md.renderer.rules.thead_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__table-head';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<thead ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for table body
    md.renderer.rules.tbody_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__table-body';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<tbody ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for table rows
    md.renderer.rules.tr_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__table-row';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<tr ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for table header cells
    md.renderer.rules.th_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__table-cell article__table-cell_header';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<th ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderer for table data cells
    md.renderer.rules.td_open = function(tokens, idx, _options, _env, _renderer) {
        const token = tokens[idx];
        const existingClass = token.attrGet('class') || '';
        const newClass = 'article__table-cell';
        const finalClass = existingClass ? `${existingClass} ${newClass}` : newClass;
        return `<td ${formatAttribute('class', finalClass)}>`;
    };

    // Custom renderers for optional closing tags (HTML5 minimal output)
    // Return empty string '' for minimal HTML when closing tags can be omitted

    // Optional </li> closing tag
    md.renderer.rules.list_item_close = function(tokens, idx) {
        const nextToken = tokens[idx + 1];
        // Keep </li> only before list closing tags (</ul> or </ol>)
        // Omit </li> if followed by another <li>
        if (nextToken && nextToken.type === 'list_item_open') {
            return '';
        }
        // Keep closing tag before list end or other elements
        return '</li>';
    };

    // Custom renderer for paragraph closing tags
    md.renderer.rules.paragraph_close = function(tokens, idx) {
        // Check if we're inside a list item - same logic as paragraph_open
        let prevParagraphOpen = null;
        let prevToken = null;

        // Find the matching paragraph_open token
        for (let i = idx - 1; i >= 0; i--) {
            if (tokens[i].type === 'paragraph_open') {
                prevParagraphOpen = i;
                break;
            }
        }

        if (prevParagraphOpen !== null) {
            // Find previous non-inline token before paragraph_open
            for (let i = prevParagraphOpen - 1; i >= 0; i--) {
                if (tokens[i].type !== 'inline') {
                    prevToken = tokens[i];
                    break;
                }
            }

            // Find next non-inline token after paragraph_close
            let nextToken = null;
            for (let i = idx + 1; i < tokens.length; i++) {
                if (tokens[i].type !== 'inline') {
                    nextToken = tokens[i];
                    break;
                }
            }

            // Skip closing tag if we skipped the opening tag (in list items)
            if (prevToken && prevToken.type === 'list_item_open') {
                if (nextToken && (
                    nextToken.type === 'list_item_close' ||
                    nextToken.type === 'bullet_list_open' ||
                    nextToken.type === 'ordered_list_open'
                )) {
                    return '';
                }
            }
        }

        return '</p>';
    };

    // Optional </dt> closing tag
    md.renderer.rules.dt_close = function(tokens, idx) {
        const nextToken = tokens[idx + 1];
        // Omit </dt> if followed by another <dt> or <dd>
        if (nextToken && (nextToken.type === 'dt_open' || nextToken.type === 'dd_open')) {
            return '';
        }
        return '</dt>';
    };

    // Optional </dd> closing tag
    md.renderer.rules.dd_close = function(tokens, idx) {
        const nextToken = tokens[idx + 1];
        // Omit </dd> if followed by another <dt> or <dd>
        if (nextToken && (nextToken.type === 'dt_open' || nextToken.type === 'dd_open')) {
            return '';
        }
        return '</dd>';
    };

    // Optional </thead> closing tag
    md.renderer.rules.thead_close = function(tokens, idx) {
        const next = tokens[idx + 1];
        // Omit </thead> if followed by tbody or table close
        return (next && (next.type === 'tbody_open' || next.type === 'table_close')) ? '' : '</thead>';
    };

    // Optional </tbody> closing tag
    md.renderer.rules.tbody_close = function(tokens, idx) {
        const next = tokens[idx + 1];
        // Omit </tbody> if followed by table close
        return (next && next.type === 'table_close') ? '' : '</tbody>';
    };

    // Optional </tr> closing tag
    md.renderer.rules.tr_close = function(tokens, idx) {
        const next = tokens[idx + 1];
        // Omit </tr> if followed by another tr or section close
        const shouldOmit = next && (next.type === 'tr_open' ||
            next.type === 'thead_close' || next.type === 'tbody_close');
        return shouldOmit ? '' : '</tr>';
    };

    // Optional </th> closing tag
    md.renderer.rules.th_close = function(tokens, idx) {
        const next = tokens[idx + 1];
        // Omit </th> if followed by th, td, or tr close
        const shouldOmit = next && (next.type === 'th_open' ||
            next.type === 'td_open' || next.type === 'tr_close');
        return shouldOmit ? '' : '</th>';
    };

    // Optional </td> closing tag
    md.renderer.rules.td_close = function(tokens, idx) {
        const next = tokens[idx + 1];
        // Omit </td> if followed by th, td, or tr close
        const shouldOmit = next && (next.type === 'th_open' ||
            next.type === 'td_open' || next.type === 'tr_close');
        return shouldOmit ? '' : '</td>';
    };

    // Add post-processing to replace plugin classes with BEM classes
    const originalRender = md.render.bind(md);
    md.render = function(src, env, renderOptions = {}) {
        // Validation: Check for empty input
        if (typeof src !== 'string') {
            const filePath = env && env.page && env.page.inputPath
                ? env.page.inputPath
                : 'unknown file';
            throw new Error(
                `Invalid markdown input in ${filePath}: expected string, got ${typeof src}`,
            );
        }

        const trimmedSrc = src.trim();
        if (trimmedSrc.length === 0) {
            const filePath = env && env.page && env.page.inputPath
                ? env.page.inputPath
                : 'unknown file';
            throw new Error(
                `Empty markdown input in ${filePath}\n` +
                'Markdown files must contain content. Empty files are not allowed.',
            );
        }

        // Validation: Check for malformed markdown syntax
        // Detect unclosed brackets in links
        const unclosedLinkMatch = src.match(/\[([^\]]+)$/m);
        if (unclosedLinkMatch) {
            const filePath = env && env.page && env.page.inputPath
                ? env.page.inputPath
                : 'unknown file';
            throw new Error(
                `Malformed markdown syntax in ${filePath}\n` +
                `Unclosed link bracket detected: "[${unclosedLinkMatch[1]}". ` +
                'Links must be properly closed with "](...)" syntax.',
            );
        }

        // Detect unclosed link URLs
        const unclosedUrlMatch = src.match(/\[[^\]]+\]\([^)]*$/m);
        if (unclosedUrlMatch) {
            const filePath = env && env.page && env.page.inputPath
                ? env.page.inputPath
                : 'unknown file';
            throw new Error(
                `Malformed markdown syntax in ${filePath}\n` +
                'Unclosed link URL detected. Links must be properly closed with ")" syntax.',
            );
        }

        // Initialize heading stack for this specific render
        if (!env) env = {};
        env._headingStack = [];

        // Initialize GitHub slug counter for duplicate anchor handling
        env._githubSlugCounts = new Map();

        // Initialize processing state for anchor mapping if not already set
        if (!env._processingState) {
            env._processingState = {
                anchorMap: new Map(),
                completed: new Set(),
            };
        }

        // Set current URL for same-page anchor resolution
        // Use the page's URL if available, otherwise use a placeholder
        if (!env._currentUrl && env.page && env.page.url) {
            env._currentUrl = env.page.url;
        } else if (!env._currentUrl) {
            // For tests or standalone rendering, use a placeholder URL
            env._currentUrl = '__current__';
        }

        // Store sitemap in env for renderers
        const mergedOptions = { ...createMarkdownInstance._options, ...renderOptions };
        env._sitemap = mergedOptions.sitemap || getSitemap();

        let html = originalRender(src, env, mergedOptions);

        // Process HTML img tags to replace src with hashed versions
        html = processHtmlImages(html, { ...createMarkdownInstance._options, env });

        // Replace embed-responsive classes with BEM classes (with minified attributes)
        html = html.replace(
            /class="embed-responsive embed-responsive-16by9"/g,
            formatAttribute('class', 'video'),
        );
        html = html.replace(
            /class="embed-responsive-item youtube-player"/g,
            formatAttribute('class', 'video__iframe'),
        );

        // Remove paragraph wrapper around video divs (with minified attributes)
        const paragraphVideoRegex = new RegExp(
            `<p ${formatAttribute('class', 'article__paragraph')}><div ` +
            `${formatAttribute('class', 'video')}>`,
            'g',
        );
        html = html.replace(
            paragraphVideoRegex,
            `<div ${formatAttribute('class', 'video')}>`,
        );
        html = html.replace(/<\/div><\/p>/g, '</div>');

        // Remove width and height attributes from iframes (use CSS for responsive sizing)
        html = html.replace(/(<iframe[^>]*)\s+width="[^"]*"/g, '$1');
        html = html.replace(/(<iframe[^>]*)\s+height="[^"]*"/g, '$1');

        // Remove obsolete HTML4 attributes from iframes (for W3C HTML5 validation)
        // Remove type="text/html" - not needed in HTML5
        html = html.replace(/(<iframe[^>]*)\s+type="text\/html"/g, '$1');
        // Remove frameborder="0" - use CSS instead
        html = html.replace(/(<iframe[^>]*)\s+frameborder="0"/g, '$1');
        // Remove webkitallowfullscreen - use allowfullscreen only
        html = html.replace(/(<iframe[^>]*)\s+webkitallowfullscreen/g, '$1');
        // Remove mozallowfullscreen - use allowfullscreen only
        html = html.replace(/(<iframe[^>]*)\s+mozallowfullscreen/g, '$1');

        // Remove whitespace between block elements for minification
        html = html.replace(/>\s+</g, '><');

        // Remove line breaks after <br> tags
        html = html.replace(/<br>\s+/g, '<br>');

        return html;
    };

    return md;
}


/**
 * Create a GitHub-style slug from heading text.
 * This matches GitHub's anchor generation algorithm.
 */
function createGitHubSlug(text) {
    const slug = text
        .toLowerCase()
        .replace(/[^\w\s\u0400-\u04FF-]/g, '')  // Keep Cyrillic
        .replace(/\s+/g, '-')
        .trim();
    return slug;
}

/**
 * Create a GitHub-style slugify function that removes slashes instead of replacing them.
 * GitHub removes slashes completely when creating anchors.
 */
function createGitHubSlugify(caseType = 'lower') {
    return function githubSlugify(text, separator = '-') {
        // Apply case transformation
        if (caseType === 'lower') {
            text = text.toLowerCase();
        } else if (caseType === 'upper') {
            text = text.toUpperCase();
        }

        // Remove HTML tags
        text = text.replace(/<[^>]+>/g, '');

        // Remove trailing dots from numbered headings (e.g., "1. Text" -> "1 Text")
        if (/^\d+\.\s/.test(text)) {
            text = text.replace(/^(\d+)\.\s/, '$1 ');
        }

        // Remove slashes completely (GitHub behavior)
        text = text.replace(/[/\\]+/g, '');

        // Replace whitespace and other separators with the specified separator
        text = text.replace(/[\s_]+/g, separator);

        // Remove characters that are not letters, digits, or the separator
        // Keep Cyrillic letters (U+0400-U+04FF), Latin letters (a-zA-Z), digits (0-9), dots, and separator
        const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`[^a-zA-Z0-9\\u0400-\\u04FF\\.${escapedSeparator}]+`, 'g');
        text = text.replace(pattern, '');

        // Remove leading/trailing separators
        text = text.replace(new RegExp(`^${escapedSeparator}+|${escapedSeparator}+$`, 'g'), '');

        // Collapse multiple separators
        text = text.replace(new RegExp(`${escapedSeparator}+`, 'g'), separator);

        return text;
    };
}

module.exports = {
    createMarkdownInstance,
    createCyrillicSlugify,
    createGitHubSlugify,
    cleanHeadingText,
    buildHierarchicalAnchor,
};










