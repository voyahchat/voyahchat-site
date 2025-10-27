/**
 * W3C HTML Validator Wrapper
 *
 * Uses vnu-jar (official Nu Html Checker from W3C) to validate HTML
 * This provides the same validation as https://validator.w3.org
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Validate HTML using W3C Nu Html Checker (vnu-jar)
 * @param {string} html - HTML content to validate
 * @returns {Object} Validation result with {valid, errors, errorCount, warningCount}
 */
function validateHtml(html) {
    // Create temporary file for HTML content
    const tmpFile = path.join(os.tmpdir(), `html-validate-${Date.now()}.html`);

    try {
        // Write HTML to temporary file
        fs.writeFileSync(tmpFile, html, 'utf8');

        // Get path to vnu.jar
        const vnuJarPath = require('vnu-jar');

        // Run vnu validator
        // --format json: Output in JSON format
        // --stdout: Output to stdout instead of stderr
        const command = `java -jar "${vnuJarPath}" --format json --stdout "${tmpFile}"`;

        try {
            execSync(command, { encoding: 'utf8', stdio: 'pipe' });

            // If no exception, HTML is valid
            return {
                valid: true,
                errors: [],
                errorCount: 0,
                warningCount: 0,
            };
        } catch (error) {
            // Parse JSON output from stderr or stdout
            const output = error.stdout || error.stderr || '';

            if (!output.trim()) {
                // No output means validation passed
                return {
                    valid: true,
                    errors: [],
                    errorCount: 0,
                    warningCount: 0,
                };
            }

            try {
                const result = JSON.parse(output);
                const messages = result.messages || [];

                // Count errors and warnings
                const errors = messages.filter(m => m.type === 'error');
                const warnings = messages.filter(m => m.type === 'info' || m.type === 'warning');

                return {
                    valid: errors.length === 0,
                    errors: messages,
                    errorCount: errors.length,
                    warningCount: warnings.length,
                };
            } catch (parseError) {
                // If JSON parsing fails, treat as validation error
                return {
                    valid: false,
                    errors: [{
                        type: 'error',
                        message: 'Failed to parse validator output',
                        raw: output,
                    }],
                    errorCount: 1,
                    warningCount: 0,
                };
            }
        }
    } finally {
        // Clean up temporary file
        try {
            if (fs.existsSync(tmpFile)) {
                fs.unlinkSync(tmpFile);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
    }
}

module.exports = {
    validateHtml,
};
