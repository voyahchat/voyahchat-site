#!/usr/bin/env node

/**
 * CI Setup Script
 *
 * Updates AVA configuration to exclude nginx-integrity and telegram tests in CI environment.
 * Nginx is not available in CI, so these tests must be skipped.
 * Telegram tests require external dependencies and are not needed in CI.
 *
 * Note: Repository cloning and Git configuration are handled by ci.yml.
 *
 * Usage: node lib/build/setup-ci.js
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { generate } = require('astring');

const AVA_CONFIG_PATH = path.join(__dirname, '../../config/config-ava.js');

/**
 * Log message to console (suppressed in test environment)
 * @param {string} message - Message to log
 */
function log(message) {
    if (process.env.NODE_ENV !== 'test') {
        console.log(message);
    }
}

/**
 * Log error to console (suppressed in test environment)
 * @param {string} message - Error message to log
 */
function logError(message) {
    if (process.env.NODE_ENV !== 'test') {
        console.error(message);
    }
}

/**
 * Update AVA configuration to exclude nginx-integrity and telegram tests in CI
 * These tests require external dependencies which are not available in CI environment
 * @returns {boolean|null} true if updated, false if already updated, null if format not recognized
 */
function updateAvaConfig() {
    log('Updating AVA configuration for CI environment...');

    try {
        let configContent = fs.readFileSync(AVA_CONFIG_PATH, 'utf8');

        // Check if already updated
        if (configContent.includes('!lib/test/nginx-integrity.test.js') &&
            configContent.includes('!lib/test/telegram-*.test.js')) {
            log('  AVA configuration already updated');
            return false;
        }

        // Parse the JavaScript file using acorn
        const ast = acorn.parse(configContent, {
            ecmaVersion: 2020,
            sourceType: 'module',
        });

        // Find the files array in the module.exports
        let filesArray = null;

        // Navigate to the files property
        if (ast.body[0] && ast.body[0].type === 'ExpressionStatement' &&
            ast.body[0].expression.type === 'AssignmentExpression' &&
            ast.body[0].expression.left.type === 'MemberExpression' &&
            ast.body[0].expression.left.property.name === 'exports' &&
            ast.body[0].expression.right.type === 'ObjectExpression') {

            const objectExpression = ast.body[0].expression.right;

            for (const prop of objectExpression.properties) {
                if (prop.key.name === 'files' && prop.value.type === 'ArrayExpression') {
                    filesArray = prop.value;
                    break;
                }
            }
        }

        if (!filesArray) {
            log('  AVA configuration format not recognized, skipping update');
            return null;
        }

        // Check if nginx-integrity test is already excluded
        const nginxTestExcluded = filesArray.elements.some(element =>
            element.type === 'Literal' &&
            element.value === '!lib/test/nginx-integrity.test.js');

        // Check if telegram tests are already excluded
        const telegramTestsExcluded = filesArray.elements.some(element =>
            element.type === 'Literal' &&
            element.value === '!lib/test/telegram-*.test.js');

        if (nginxTestExcluded && telegramTestsExcluded) {
            log('  AVA configuration already updated');
            return false;
        }

        // Add the nginx-integrity test exclusion if not already present
        if (!nginxTestExcluded) {
            filesArray.elements.push({
                type: 'Literal',
                value: '!lib/test/nginx-integrity.test.js',
                raw: '\'!lib/test/nginx-integrity.test.js\'',
            });
        }

        // Add the telegram tests exclusion if not already present
        if (!telegramTestsExcluded) {
            filesArray.elements.push({
                type: 'Literal',
                value: '!lib/test/telegram-*.test.js',
                raw: '\'!lib/test/telegram-*.test.js\'',
            });
        }

        // Generate the updated JavaScript code
        const updatedContent = generate(ast, {
            indent: '    ',
            quotes: 'single',
        });

        // Write the updated configuration back to the file
        fs.writeFileSync(AVA_CONFIG_PATH, updatedContent, 'utf8');
        log('  AVA configuration updated for CI environment (nginx-integrity and telegram tests excluded)');
        return true;

    } catch (error) {
        logError(`Failed to update AVA configuration: ${error.message}`);
        throw error;
    }
}

/**
 * Main entry point
 */
function main() {
    log('CI Setup - AVA configuration update');

    try {
        updateAvaConfig();
        log('CI setup completed successfully');
    } catch (error) {
        logError(`CI setup failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    updateAvaConfig,
    AVA_CONFIG_PATH,
};
