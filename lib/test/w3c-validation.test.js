const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const test = require('ava');
const { Dir } = require('../build/dir.js');
const { validateHtml } = require('./w3c-validator.js');

test('W3C HTML validation', async (t) => {
    // Timeout is set in config/config-ava-validation.js (10m)

    // Use production build artifacts for integration test (per AGENTS.md rule)
    const buildHtmlPath = Dir.getBuildFile('build-html.json');
    const buildHtml = JSON.parse(fs.readFileSync(buildHtmlPath, 'utf8'));
    const siteDir = Dir.getSite();

    // Validate ALL files (required by AGENTS.md)
    const allFiles = Object.entries(buildHtml);

    // Process files in single batch for maximum parallel performance
    const batchSize = 100; // Process all files concurrently (max 100, but we only have 68)
    const allResults = [];

    for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);

        // Create validation promise for each file in batch
        const validationPromises = batch.map(async ([filename]) => {
            const filePath = path.join(siteDir, 'html', filename);

            // Check file exists (fail fast if missing) - MUST fail if missing (AGENTS.md requirement)
            try {
                await fsPromises.access(filePath);
            } catch (error) {

                return {
                    filename,
                    error: 'missing',
                    message: `Build artifact missing: ${filename}\n` +
                    `Expected location: ${filePath}\n` +
                    '\n' +
                    'This file is listed in .build/build-html.json but does not exist in site/html/.\n' +
                    'This indicates the HTML build process failed to create this file.\n' +
                    '\n' +
                    'According to AGENTS.md: "Missing build artifacts MUST cause build failures"\n' +
                    '\n' +
                    'To fix:\n' +
                    '1. Check if the source markdown file exists\n' +
                    '2. Review build-html.js for errors during HTML generation\n' +
                    '3. Ensure the build process completed successfully\n',
                };
            }

            // Read file asynchronously
            const html = await fsPromises.readFile(filePath, 'utf8');

            // Validate asynchronously
            const result = await validateHtml(html);

            return { filename, result };
        });

        // Wait for current batch to complete
        const batchResults = await Promise.allSettled(validationPromises);
        allResults.push(...batchResults);
    }

    const results = allResults;

    // Process results and aggregate errors
    const issues = [];
    let totalErrors = 0;
    let totalWarnings = 0;
    const validationResults = [];

    for (const { status, value, reason } of results) {
        if (status === 'rejected') {
            issues.push(`${value?.filename || 'unknown'} - validation failed: ${reason.message}`);
            totalErrors++;
            continue;
        }

        if (value.error === 'missing') {
            t.fail(value.message);
            continue;
        }

        validationResults.push({ filename: value.filename, result: value.result });

        if (!value.result.valid) {
            totalErrors += value.result.errorCount;
            totalWarnings += value.result.warningCount;

            // Add only errors to issues list
            value.result.errors
                .filter(msg => msg.type === 'error')
                .forEach(msg => {
                    const location = msg.lastLine
                        ? `:${msg.lastLine}:${msg.lastColumn || '?'}`
                        : '';
                    const extract = msg.extract ? ` (${msg.extract.trim()})` : '';
                    issues.push(`${value.filename}${location} - ${msg.message}${extract}`);
                });
        }
    }

    // Fail on ANY issues (validation errors or file access problems)
    if (issues.length > 0) {
        t.fail(
            `Found ${totalErrors} W3C HTML validation errors ` +
            `(${totalWarnings} warnings) in ${validationResults.length} files:\n` +
            issues.slice(0, 20).join('\n') +
            (issues.length > 20 ? `\n... and ${issues.length - 20} more errors` : ''),
        );
    }

    t.pass(`All ${allFiles.length} HTML files passed W3C validation`);
});
