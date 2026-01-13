#!/usr/bin/env node

/**
 * Telegram authentication CLI
 * Handles authentication status checking and login flow
 *
 * @module telegram/auth
 */

const TelegramDownloader = require('./download');

/**
 * Log message if not in test environment
 * @param {...any} args - Arguments to pass to console.log
 */
function log(...args) {
    if (process.env.NODE_ENV !== 'test') {
        console.log(...args);
    }
}

/**
 * Log error if not in test environment
 * @param {...any} args - Arguments to pass to console.error
 */
function error(...args) {
    if (process.env.NODE_ENV !== 'test') {
        console.error(...args);
    }
}

/**
 * Check authentication status
 */
async function checkAuthStatus() {
    log('Telegram Authentication Status Check');
    log('===================================');

    // Check if session exists in config
    try {
        const { TelegramConfig } = require('./config');
        const config = new TelegramConfig();
        const authConfig = await config.loadAuthConfig();
        const sessionExists = !!(authConfig && authConfig.session);
        log(`\nSession exists: ${sessionExists ? '✓ Yes' : '✗ No'}`);

        // Display configuration
        log('\nConfiguration:');
        log(`  Phone: ${authConfig.phone}`);
        if (authConfig.email) {
            log(`  Email: ${authConfig.email}`);
        }
        log(`  API ID: ${authConfig.api_id}`);

        // Provide recommendations
        log('\nRecommendations:');

        if (!sessionExists) {
            log('\n1. First-time authentication:');
            log('   - Try: npm run telegram:auth');
            log('   - If SMS doesn\'t arrive, check your Telegram app for the code');
            log('   - The code might appear in Telegram Desktop/Mobile instead of SMS');

            log('\n2. If SMS is blocked:');
            log('   - Use VPN (US/Europe) and try again');
            log('   - Wait 1-2 hours for Telegram to unblock your number');
            log('   - The session will be saved to config/auth-telegram.yml');
        } else {
            log('\n✓ Session exists - you can download messages:');
            log('   - Download all: npm run telegram:download');
            log('   - Download specific: npm run telegram:download -- --section=encars');
        }
    } catch (err) {
        log('\n✗ Configuration file not found or invalid');
        log('  Please create config/auth-telegram.yml with your credentials');
        log('  Get API credentials from https://my.telegram.org/apps');
    }

    log('\nTroubleshooting:');
    log('- If you have 2FA enabled, have your password ready (from Apple Passwords)');
    log('- Make sure Telegram Desktop/Mobile is installed - codes appear there too');
}

/**
 * Authenticate with Telegram
 */
async function auth() {
    const downloader = new TelegramDownloader();

    try {
        log('Initializing Telegram client...');
        log('Reading auth config...');
        const { TelegramConfig } = require('./config');
        const config = new TelegramConfig();
        const authConfig = await config.loadAuthConfig();
        log(`Phone: ${authConfig.phone}`);
        log(`API ID: ${authConfig.api_id}`);

        await downloader.init();
        log('Authentication successful!');
        log('Session saved to config/auth-telegram.yml');
        await downloader.close();
    } catch (err) {
        error('Authentication failed:', err.message);
        error('Full error:', err);
        process.exit(1);
    }
}

// Check command line arguments
const args = process.argv.slice(2);

// Run if called directly
if (require.main === module) {
    if (args.includes('--status')) {
        checkAuthStatus();
    } else {
        auth();
    }
}

module.exports = { auth, checkAuthStatus };
