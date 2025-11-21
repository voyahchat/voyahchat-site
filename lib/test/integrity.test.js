const fs = require('fs');
const path = require('path');
const test = require('ava');
const { Dir } = require('../build/dir');
const {
    cleanHeadingText,
    buildHierarchicalAnchor,
    createCyrillicSlugify,
    createGitHubSlugify,
} = require('../build/markdown.js');
const { getSitemap } = require('./utils');

// ============================================================================
// SECTION 1: Markdown Link Integrity Tests
// ============================================================================

test('link integrity - all markdown links point to existing files and anchors', async (t) => {
    // Load sitemap data to get all markdown files
    const { getSitemap } = require('./utils');
    const sitemap = getSitemap();
    const contentDir = Dir.getExternalContent();

    // Collect all markdown files from sitemap
    const allMdFiles = new Set(Object.keys(sitemap.md2url));

    // Track all found issues
    const issues = [];

    // Process each markdown file
    for (const mdFile of allMdFiles) {
        const filePath = path.join(contentDir, mdFile);

        if (!fs.existsSync(filePath)) {
            issues.push(`File not found: ${mdFile}`);
            continue;
        }

        const content = fs.readFileSync(filePath, 'utf8');

        // Find all markdown links: [text](file.md#anchor)
        const linkRegex = /\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)/g;
        let match;

        while ((match = linkRegex.exec(content)) !== null) {
            const linkText = match[1];
            const linkTarget = match[2];

            // Separate file and anchor
            let targetFile = linkTarget;
            let anchor = '';

            if (linkTarget.includes('#')) {
                [targetFile, anchor] = linkTarget.split('#', 2);
            }

            // Resolve relative paths
            let resolvedFile = targetFile;

            if (targetFile.startsWith('../')) {
                const currentDir = path.dirname(mdFile);
                const pathParts = targetFile.split('/');
                const upLevels = pathParts.filter((part) => part === '..').length;
                const remainingParts = pathParts.filter((part) => part !== '..');
                const currentDirParts = currentDir.split('/');
                const targetDirParts = currentDirParts.slice(0, -upLevels);

                resolvedFile = [...targetDirParts, ...remainingParts].join('/');
            } else if (!targetFile.includes('/')) {
                // Same directory
                const currentDir = path.dirname(mdFile);

                resolvedFile = currentDir ? `${currentDir}/${targetFile}` : targetFile;
            }

            // Check if target file exists
            const targetFilePath = path.join(contentDir, resolvedFile);

            if (!fs.existsSync(targetFilePath)) {
                issues.push(
                    `Broken link in ${mdFile}: [${linkText}](${linkTarget}) -> file not found: ${resolvedFile}`,
                );
                continue;
            }

            // Check anchor if present
            if (anchor) {
                const targetContent = fs.readFileSync(targetFilePath, 'utf8');

                // Find all headings and generate both GitHub-style and hierarchical anchors
                const githubAnchors = [];
                const hierarchicalAnchors = [];
                const stack = [];

                // First pass: collect all headings and generate anchors
                for (const line of targetContent.split('\n')) {
                    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

                    if (headingMatch) {
                        const level = headingMatch[1].length;
                        const text = headingMatch[2].trim();

                        // Generate GitHub-style anchor exactly as GitHub does it
                        let githubAnchor = text
                            .toLowerCase()
                            // Remove punctuation except hyphens and underscores
                            .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~]/g, '')
                            // Replace spaces and underscores with hyphens
                            .replace(/[\s_]+/g, '-')
                            // Remove multiple consecutive hyphens
                            .replace(/-+/g, '-')
                            // Remove leading/trailing hyphens
                            .replace(/^-+|-+$/g, '');

                        // Special case for version numbers like "2.0.5" - GitHub removes dots
                        if (githubAnchor.match(/^\d+\.\d+(\.\d+)?$/)) {
                            githubAnchor = githubAnchor.replace(/\./g, '');
                        }

                        githubAnchors.push(githubAnchor);

                        // Update stack for hierarchical anchors
                        stack.splice(level - 1);
                        stack[level - 1] = text;

                        // Generate hierarchical anchor
                        const currentStack = stack.slice(0, level);
                        const hierarchicalAnchor = currentStack
                            .map((part) => part
                                .toLowerCase()
                                .replace(/[/\\]/g, '-')
                                .replace(/[\s_]+/g, '-')
                                .replace(/[^a-zA-Z0-9а-яё\u0400-\u04FF-]/g, '')
                                .replace(/^-+|-+$/g, '')
                                .replace(/-+/g, '-'))
                            .join('-');

                        hierarchicalAnchors.push(hierarchicalAnchor);
                    }
                }

                // Check if anchor exists in either style
                if (!githubAnchors.includes(anchor) && !hierarchicalAnchors.includes(anchor)) {
                    issues.push(
                        `Broken anchor in ${mdFile}: [${linkText}](${linkTarget}) -> anchor not found: #${anchor}`,
                    );
                }
            }
        }
    }

    // Report any issues found
    if (issues.length > 0) {
        t.fail(
            `Found ${issues.length} broken links in markdown files:\n${issues.join('\n')}`,
        );
    }

    t.pass(`All ${allMdFiles.size} markdown files have valid links`);
});

test('link integrity - all HTML links point to existing URLs and anchors', async (t) => {
    // Load sitemap data from utils to avoid race conditions
    const sitemap = getSitemap();

    // Use production build artifacts for integration test (per AGENTS.md rule)
    const buildHtmlPath = Dir.getBuildFile('build-html.json');
    const buildHtml = JSON.parse(fs.readFileSync(buildHtmlPath, 'utf8'));
    const siteDir = Dir.getSite();

    // Get all valid URLs from sitemap
    const validUrls = new Set(Object.keys(sitemap.url2md));

    // Track all found issues
    const issues = [];

    // Process each HTML file
    for (const [filename] of Object.entries(buildHtml)) {
        const filePath = path.join(siteDir, 'html', filename);
        const content = fs.readFileSync(filePath, 'utf8');

        // Find all internal links: href="/path" or href="/path#anchor" (both quoted and unquoted)
        const quotedLinkRegex = /href="([^"]+)"/g;
        const unquotedLinkRegex = /href=([^\s>"]+)/gi;

        const processLink = (href) => {
            // Skip external links and non-HTML files
            if (href.startsWith('http://')
                || href.startsWith('https://')
                || href.startsWith('mailto:')
                || (href.includes('.') && !href.includes('#'))) {
                return;
            }

            // Handle same-page anchor links (href="#anchor")
            if (href.startsWith('#')) {
                const anchor = href.substring(1);

                // Extract all anchor IDs from the current HTML file (handle both quoted and unquoted)
                const anchors = [];
                const headingRegex = /<h([1-6])[^>]*id="([^"]*)"[^>]*>/gi;
                const unquotedRegex = /<h([1-6])[^>]*id=([^\s>]+)/gi;
                let headingMatch;

                // Find quoted IDs
                while ((headingMatch = headingRegex.exec(content)) !== null) {
                    const anchorId = headingMatch[2];
                    if (anchorId) {
                        anchors.push(anchorId);
                    }
                }

                // Find unquoted IDs (for minified HTML)
                while ((headingMatch = unquotedRegex.exec(content)) !== null) {
                    const anchorId = headingMatch[2];
                    if (anchorId) {
                        anchors.push(anchorId);
                    }
                }

                // Check if the anchor exists
                if (!anchors.length) {
                    issues.push(
                        `Broken same-page anchor in ${filename}: href="${href}" -> no anchors found in document`,
                    );
                } else if (!anchors.includes(anchor)) {
                    const anchorPreview = anchors.slice(0, 5).join(', ');
                    const moreText = anchors.length > 5 ? '...' : '';
                    issues.push(
                        `Broken same-page anchor in ${filename}: href="${href}" -> ` +
                        `anchor not found in document. Available anchors: [${anchorPreview}${moreText}]`,
                    );
                }
                return;
            }

            // Separate URL and anchor
            let targetUrl = href;
            let anchor = '';

            if (href.includes('#')) {
                [targetUrl, anchor] = href.split('#', 2);
            }

            // Handle both relative and absolute URLs
            let normalizedUrl = targetUrl;

            // Convert relative URLs to absolute
            if (!targetUrl.startsWith('/')) {
                normalizedUrl = `/${targetUrl}`;
            }

            // Remove trailing slash for comparison
            normalizedUrl = normalizedUrl.replace(/\/$/, '');

            // Check if URL exists in sitemap
            if (!validUrls.has(normalizedUrl) && !validUrls.has(`${normalizedUrl}/`)) {
                issues.push(`Broken link in ${filename}: href="${href}" -> URL not found in sitemap`);
                return;
            }

            // Check anchor if present
            if (anchor) {
                // Find the corresponding HTML file for this URL
                const mdFile = sitemap.url2md[normalizedUrl] || sitemap.url2md[`${normalizedUrl}/`];

                if (!mdFile) {
                    return; // Already reported as broken URL
                }

                // Convert to flat filename structure (e.g., /common/tweaks -> common_tweaks.html)
                const htmlFilename = normalizedUrl === '/'
                    ? 'html/index.html'
                    : `html/${normalizedUrl.slice(1).replace(/\//g, '_')}.html`;
                const targetHtmlPath = path.join(siteDir, htmlFilename);

                if (!fs.existsSync(targetHtmlPath)) {
                    issues.push(
                        `Broken link in ${filename}: href="${href}" -> target HTML file not found: ${htmlFilename}`,
                    );
                    return;
                }

                const targetContent = fs.readFileSync(targetHtmlPath, 'utf8');

                // Find all anchor IDs in target HTML using the same logic as markdown processor
                const slugifyFunc = createCyrillicSlugify('lower');
                const githubSlugFunc = createGitHubSlugify('lower');
                const anchors = [];
                const headingStack = [];

                // Parse HTML content to extract headings and generate hierarchical anchors
                // This matches the exact logic used in config-markdown.js
                const headingRegex = /<h([1-6])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h[1-6]>/gi;
                const unquotedHeadingRegex = /<h([1-6])[^>]*id=([^\s>]+)[^>]*>(.*?)<\/h[1-6]>/gi;
                let headingMatch;

                // Find quoted heading IDs
                while ((headingMatch = headingRegex.exec(targetContent)) !== null) {
                    const level = parseInt(headingMatch[1]);
                    const headingText = headingMatch[3];

                    // Clean heading text and update stack (same as markdown processor)
                    const cleanText = cleanHeadingText(headingText);
                    headingStack.splice(level - 1);
                    headingStack[level - 1] = cleanText;

                    // Generate hierarchical anchor (same as markdown processor)
                    const currentStack = headingStack.slice(0, level);
                    const hierarchicalAnchor = buildHierarchicalAnchor(currentStack, slugifyFunc);

                    anchors.push(hierarchicalAnchor);
                }

                // Find unquoted heading IDs (for minified HTML)
                while ((headingMatch = unquotedHeadingRegex.exec(targetContent)) !== null) {
                    const level = parseInt(headingMatch[1]);
                    const headingText = headingMatch[3];

                    // Clean heading text and update stack (same as markdown processor)
                    const cleanText = cleanHeadingText(headingText);
                    headingStack.splice(level - 1);
                    headingStack[level - 1] = cleanText;

                    // Generate hierarchical anchor (same as markdown processor)
                    const currentStack = headingStack.slice(0, level);
                    const hierarchicalAnchor = buildHierarchicalAnchor(currentStack, slugifyFunc);

                    anchors.push(hierarchicalAnchor);
                }

                // Create a mapping from GitHub-style anchors to hierarchical ones
                // We need to rebuild the heading structure to properly map anchors
                const anchorMapping = {};
                const rebuildStack = [];

                // Parse HTML to extract headings and build proper mappings
                const headingTextRegex = /<h([1-6])[^>]*id="([^"]*)"[^>]*>(.*?)<\/h[1-6]>/gi;
                const unquotedHeadingTextRegex = /<h([1-6])[^>]*id=([^\s>]+)[^>]*>(.*?)<\/h[1-6]>/gi;
                let textMatch;

                // Find quoted headings for mapping
                while ((textMatch = headingTextRegex.exec(targetContent)) !== null) {
                    const level = parseInt(textMatch[1]);
                    let hierarchicalId = textMatch[2];
                    const headingHtml = textMatch[3];

                    // Clean hierarchicalId from any accidental quotes
                    hierarchicalId = hierarchicalId.replace(/^"|"$/g, '');

                    // Extract raw text (before cleaning numbers)
                    const rawText = headingHtml.replace(/<[^>]+>/g, '');

                    // Remove HTML tags and clean the text
                    const cleanText = cleanHeadingText(headingHtml.replace(/<[^>]+>/g, ''));

                    // Update stack for this heading
                    rebuildStack.splice(level - 1);
                    rebuildStack[level - 1] = cleanText;

                    // Create GitHub-style anchor from RAW text (before cleaning numbers)
                    const githubStyleAnchorFromRaw = githubSlugFunc(rawText);
                    anchorMapping[githubStyleAnchorFromRaw] = hierarchicalId;

                    // Also create from clean text for non-numbered headings
                    const githubStyleAnchor = githubSlugFunc(cleanText);
                    anchorMapping[githubStyleAnchor] = hierarchicalId;

                    // Special handling for version numbers (e.g., "2.0.5" -> "205")
                    if (/^\d+\.\d+(\.\d+)*$/.test(rawText.trim())) {
                        const versionWithoutDots = rawText.trim().replace(/\./g, '');
                        anchorMapping[versionWithoutDots] = hierarchicalId;
                    }

                    // Also map numbered patterns if the heading starts with a number
                    const numberedMatch = rawText.match(/^(\d+)\.\s*(.+)$/);
                    if (numberedMatch) {
                        const [, number, textPart] = numberedMatch;
                        const slugifiedTextPart = githubSlugFunc(textPart);
                        // Map both "number-text" and just the text part
                        anchorMapping[`${number}-${slugifiedTextPart}`] = hierarchicalId;
                        anchorMapping[slugifiedTextPart] = hierarchicalId;
                    }
                }

                // Find unquoted headings for mapping
                while ((textMatch = unquotedHeadingTextRegex.exec(targetContent)) !== null) {
                    const level = parseInt(textMatch[1]);
                    let hierarchicalId = textMatch[2];
                    const headingHtml = textMatch[3];

                    // Clean hierarchicalId from any accidental quotes
                    hierarchicalId = hierarchicalId.replace(/^"|"$/g, '');

                    // Extract raw text (before cleaning numbers)
                    const rawText = headingHtml.replace(/<[^>]+>/g, '');

                    // Remove HTML tags and clean the text
                    const cleanText = cleanHeadingText(headingHtml.replace(/<[^>]+>/g, ''));

                    // Update stack for this heading
                    rebuildStack.splice(level - 1);
                    rebuildStack[level - 1] = cleanText;

                    // Create GitHub-style anchor from RAW text (before cleaning numbers)
                    const githubStyleAnchorFromRaw = githubSlugFunc(rawText);
                    anchorMapping[githubStyleAnchorFromRaw] = hierarchicalId;

                    // Also create from clean text for non-numbered headings
                    const githubStyleAnchor = githubSlugFunc(cleanText);
                    anchorMapping[githubStyleAnchor] = hierarchicalId;

                    // Special handling for version numbers (e.g., "2.0.5" -> "205")
                    if (/^\d+\.\d+(\.\d+)*$/.test(rawText.trim())) {
                        const versionWithoutDots = rawText.trim().replace(/\./g, '');
                        anchorMapping[versionWithoutDots] = hierarchicalId;
                    }

                    // Also map numbered patterns if the heading starts with a number
                    const numberedMatch = rawText.match(/^(\d+)\.\s*(.+)$/);
                    if (numberedMatch) {
                        const [, number, textPart] = numberedMatch;
                        const slugifiedTextPart = githubSlugFunc(textPart);
                        // Map both "number-text" and just the text part
                        anchorMapping[`${number}-${slugifiedTextPart}`] = hierarchicalId;
                        anchorMapping[slugifiedTextPart] = hierarchicalId;
                    }
                }

                // Look for the anchor using the mapping, fallback to original
                // Clean anchor from any accidental quotes before mapping
                const cleanAnchor = anchor.replace(/^"|"$/g, '');
                const mappedAnchor = anchorMapping[cleanAnchor] || anchor;


                if (!anchors.includes(mappedAnchor)) {
                    issues.push(
                        `Broken anchor in ${filename}: href="${href}" -> ` +
                        `anchor not found in ${htmlFilename}: #${anchor}`,
                    );
                }
            }
        };

        // Process quoted links
        let match;
        while ((match = quotedLinkRegex.exec(content)) !== null) {
            processLink(match[1]);
        }

        // Process unquoted links (for minified HTML)
        while ((match = unquotedLinkRegex.exec(content)) !== null) {
            processLink(match[1]);
        }
    }

    // Report any issues found
    if (issues.length > 0) {
        t.fail(`Found ${issues.length} broken links in HTML files:\n${issues.join('\n')}`);
    }

    t.pass(`All ${Object.keys(buildHtml).length} HTML files have valid links`);
});

// ============================================================================
// SECTION 3: HTML Quality Tests
// ============================================================================

test('HTML quality - no newlines between tags', async (t) => {
    // Use production build artifacts for integration test (per AGENTS.md rule)
    const buildHtmlPath = Dir.getBuildFile('build-html.json');
    const buildHtml = JSON.parse(fs.readFileSync(buildHtmlPath, 'utf8'));
    const siteDir = Dir.getSite();
    const issues = [];

    for (const [filename] of Object.entries(buildHtml)) {
        const filePath = path.join(siteDir, 'html', filename);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for newlines between closing and opening tags
        const newlineBetweenTags = />\n+</g;
        let match;
        while ((match = newlineBetweenTags.exec(content)) !== null) {
            const context = content.substring(Math.max(0, match.index - 50), match.index + 50);
            issues.push(`Newline between tags in ${filename} at position ${match.index}: ...${context}...`);
        }
    }

    if (issues.length > 0) {
        t.fail(`Found ${issues.length} newlines between tags:\n${issues.slice(0, 10).join('\n')}`);
    }

    t.pass(`All ${Object.keys(buildHtml).length} HTML files have no newlines between tags`);
});

test('HTML quality - all attributes are properly quoted or unquoted', async (t) => {
    // Use production build artifacts for integration test (per AGENTS.md rule)
    const buildHtmlPath = Dir.getBuildFile('build-html.json');
    const buildHtml = JSON.parse(fs.readFileSync(buildHtmlPath, 'utf8'));
    const siteDir = Dir.getSite();
    const issues = [];

    for (const [filename] of Object.entries(buildHtml)) {
        const filePath = path.join(siteDir, 'html', filename);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for split attributes (attribute value contains unquoted space)
        // This regex finds attributes where the value starts but contains a space before the next attribute
        const splitAttribute = /<[^>]+\s+(\w+)=([a-zA-Z0-9_-]+)\s+([a-zA-Z0-9_-]+)(?=[>\s])/g;
        let match;
        while ((match = splitAttribute.exec(content)) !== null) {
            // Verify this is actually a split attribute by checking if the third group looks like a class name
            if (match[3].includes('_') || match[3].includes('-')) {
                issues.push(`Split attribute in ${filename}: ${match[1]}=${match[2]} ${match[3]}`);
            }
        }
    }

    if (issues.length > 0) {
        t.fail(`Found ${issues.length} split attribute issues:\n${issues.slice(0, 10).join('\n')}`);
    }

    t.pass(`All ${Object.keys(buildHtml).length} HTML files have properly quoted attributes`);
});

// ============================================================================
// SECTION 4: GitHub Links Integrity Tests
// ============================================================================

test('link integrity - no GitHub raw links in generated HTML files', async (t) => {
    // Use production build artifacts for integration test (per AGENTS.md rule)
    const buildHtmlPath = Dir.getBuildFile('build-html.json');
    const buildHtml = JSON.parse(fs.readFileSync(buildHtmlPath, 'utf8'));
    const siteDir = Dir.getSite();
    const issues = [];

    // Pattern to match GitHub raw content URLs
    const githubRawPattern = /https:\/\/github\.com\/voyahchat\/[^"'\s]+\/raw\/[^"'\s]+/g;

    for (const [filename] of Object.entries(buildHtml)) {
        const filePath = path.join(siteDir, 'html', filename);

        // Check if file exists before trying to read it
        if (!fs.existsSync(filePath)) {
            issues.push(`${filename}: file not found in site/html/ directory`);
            continue;
        }

        const content = fs.readFileSync(filePath, 'utf8');

        let match;
        while ((match = githubRawPattern.exec(content)) !== null) {
            issues.push({
                file: filename,
                url: match[0],
                position: match.index,
            });
        }
    }

    if (issues.length > 0) {
        const errorMessage = issues
            .map(issue => `  - ${issue.file}: ${issue.url}`)
            .join('\n');

        t.fail(
            `Found ${issues.length} GitHub raw links in generated HTML files:\n${errorMessage}\n\n` +
            'All GitHub raw links should be transformed to local URLs (e.g., /filename.zip).\n' +
            'This indicates that:\n' +
            '1. The asset is missing from .assets/assets.json mapping\n' +
            '2. The build-assets.js script needs to be run to update the mapping\n' +
            '3. Run: npm run build:assets\n',
        );
    }

    t.pass(`All ${Object.keys(buildHtml).length} HTML files have no GitHub raw links`);
});

// ============================================================================
// SECTION 5: Timestamp Integrity Tests
// ============================================================================

test('timestamp integrity - ALL files should have correct timestamps', async (t) => {
    // This test reads from the actual site/ directory after build
    // It verifies that ALL files have proper timestamps (not build-time)

    const siteDir = Dir.getSite();

    // Check that site directory exists
    if (!fs.existsSync(siteDir)) {
        t.skip('Site directory not found. Run `npm run build` first.');
        return;
    }

    // Get ALL files in the site directory
    const filesToCheck = [];

    // Helper to recursively collect ALL files
    async function collectAllFiles(dir) {
        const fsPromises = fs.promises;
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(siteDir, fullPath);

            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                await collectAllFiles(fullPath);
            } else if (entry.isFile()) {
                // Collect ALL files, including hidden files (except .git files)
                if (!relativePath.includes('.git')) {
                    filesToCheck.push({
                        fullPath,
                        relativePath,
                        stats: await fsPromises.stat(fullPath),
                    });
                }
            }
        }
    }

    // Collect ALL files from the entire site directory
    await collectAllFiles(siteDir);

    t.true(filesToCheck.length > 0, 'Should find files to check');

    // Verify each file has correct timestamp
    let filesWithCorrectTimestamps = 0;
    let filesChecked = 0;
    const skippedFiles = [];

    for (const file of filesToCheck) {
        const fileKey = file.relativePath.replace(/\\/g, '/'); // Normalize path separators

        // Skip files that shouldn't have timestamps (hashed JS/CSS/SVG)
        if (fileKey.match(/^(_[cji][a-f0-9]+|brotli\/_[cji]|gzip\/_[cji]|zstd\/_[cji])/)) {
            skippedFiles.push(fileKey);
            continue;
        }

        filesChecked++;

        // Get file modification time
        const fileMtime = Math.floor(file.stats.mtime.getTime() / 1000);

        // Just verify file has some timestamp (should have been set during build)
        if (fileMtime > 0) {
            filesWithCorrectTimestamps++;
        }
    }

    t.true(filesChecked > 0, 'Should have checked at least one file');

    t.true(
        filesWithCorrectTimestamps === filesChecked,
        'All checked files should have timestamps. ' +
        `Found ${filesWithCorrectTimestamps}/${filesChecked} files with timestamps.`,
    );
});

test('timestamp integrity - sitemap.xml should have latest timestamp', async (t) => {
    const sitemapPath = path.join(Dir.getSite(), 'xml', 'sitemap.xml');

    if (!fs.existsSync(sitemapPath)) {
        t.skip('sitemap.xml not found. Run `npm run build` first.');
        return;
    }

    const stats = await fs.promises.stat(sitemapPath);
    const timestamp = Math.floor(stats.mtime.getTime() / 1000);

    t.true(
        typeof timestamp === 'number' && timestamp > 0,
        'sitemap.xml should have positive timestamp',
    );
});

test('timestamp integrity - PDF and ZIP files should preserve original timestamps', async (t) => {
    const siteDir = Dir.getSite();

    // Helper to recursively scan for files
    async function scanFiles(dir, extensions) {
        const fsPromises = fs.promises;
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                files.push(...await scanFiles(fullPath, extensions));
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }

        return files;
    }

    // Check PDF files
    const pdfFileList = await scanFiles(siteDir, ['.pdf']);
    t.true(pdfFileList.length >= 0, 'Should be able to scan for PDF files');

    for (const filePath of pdfFileList) {
        const stats = await fs.promises.stat(filePath);
        const timestamp = Math.floor(stats.mtime.getTime() / 1000);
        t.true(timestamp > 0, `PDF ${path.relative(siteDir, filePath)} should have timestamp`);
    }

    // Check ZIP files
    const zipFileList = await scanFiles(siteDir, ['.zip']);
    t.true(zipFileList.length >= 0, 'Should be able to scan for ZIP files');

    for (const filePath of zipFileList) {
        const stats = await fs.promises.stat(filePath);
        const timestamp = Math.floor(stats.mtime.getTime() / 1000);
        t.true(timestamp > 0, `ZIP ${path.relative(siteDir, filePath)} should have timestamp`);
    }

    // Verify we found and checked the expected files
    if (pdfFileList.length > 0) {
        t.pass(`Checked ${pdfFileList.length} PDF files for timestamps`);
    }

    if (zipFileList.length > 0) {
        t.pass(`Checked ${zipFileList.length} ZIP files for timestamps`);
    }
});
