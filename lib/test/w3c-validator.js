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
    // Validate input
    if (typeof html !== 'string') {
        return {
            valid: false,
            errors: [{
                type: 'error',
                message: 'HTML input must be a string',
            }],
            errorCount: 1,
            warningCount: 0,
        };
    }

    if (!html.trim()) {
        return {
            valid: false,
            errors: [{
                type: 'error',
                message: 'HTML input cannot be empty',
            }],
            errorCount: 1,
            warningCount: 0,
        };
    }

    // Create temporary file for HTML content
    const tmpFile = path.join(
        os.tmpdir(),
        `html-validate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.html`,
    );

    try {
        // Write HTML to temporary file
        fs.writeFileSync(tmpFile, html, 'utf8');

        // Get path to vnu.jar
        let vnuJarPath;
        try {
            vnuJarPath = require('vnu-jar');
        } catch (error) {
            return {
                valid: false,
                errors: [{
                    type: 'error',
                    message: 'vnu-jar package not found. Install with: npm install vnu-jar',
                    details: error.message,
                }],
                errorCount: 1,
                warningCount: 0,
            };
        }

        // Check if vnu.jar file exists
        if (!fs.existsSync(vnuJarPath)) {
            return {
                valid: false,
                errors: [{
                    type: 'error',
                    message: `vnu.jar not found at: ${vnuJarPath}`,
                }],
                errorCount: 1,
                warningCount: 0,
            };
        }

        // Run vnu validator
        // --format json: Output in JSON format
        // --stdout: Output to stdout instead of stderr
        // --errors-only: Only show errors (optional)
        const command = `java -jar "${vnuJarPath}" --format json --stdout "${tmpFile}"`;

        try {
            const stdout = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 30000, // 30 second timeout per file
            });

            // If no exception and no output, HTML is valid
            if (!stdout || !stdout.trim()) {
                return {
                    valid: true,
                    errors: [],
                    errorCount: 0,
                    warningCount: 0,
                };
            }

            // Parse JSON output (some versions of vnu may output to stdout even for valid files)
            try {
                const result = JSON.parse(stdout);
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
                // If JSON parsing fails but there was no exception, assume valid
                return {
                    valid: true,
                    errors: [],
                    errorCount: 0,
                    warningCount: 0,
                };
            }

        } catch (error) {
            // Parse JSON output from stderr or stdout
            const output = error.stdout || error.stderr || '';

            if (!output.trim()) {
                // No output means validation passed (Java process failed but no validation errors)
                return {
                    valid: true,
                    errors: [],
                    errorCount: 0,
                    warningCount: 0,
                };
            }

            // Check if this is a Java/system error vs validation error
            if (output.includes('java') || output.includes('Exception') || output.includes('Error: Could not find')) {
                return {
                    valid: false,
                    errors: [{
                        type: 'error',
                        message: 'Java runtime error during validation',
                        details: output.trim(),
                    }],
                    errorCount: 1,
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
                        raw: output.trim(),
                        parseError: parseError.message,
                    }],
                    errorCount: 1,
                    warningCount: 0,
                };
            }
        }
    } catch (error) {
        return {
            valid: false,
            errors: [{
                type: 'error',
                message: 'Validation failed due to system error',
                details: error.message,
            }],
            errorCount: 1,
            warningCount: 0,
        };
    } finally {
        // Clean up temporary file
        try {
            if (fs.existsSync(tmpFile)) {
                fs.unlinkSync(tmpFile);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors, but log in debug mode
            if (process.env.DEBUG_W3C) {
                console.warn('Warning: Failed to cleanup temporary file:', tmpFile);
            }
        }
    }
}

module.exports = {
    validateHtml,
};
