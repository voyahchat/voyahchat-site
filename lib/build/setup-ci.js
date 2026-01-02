#!/usr/bin/env node

/**
 * CI Setup Script
 *
 * Smart setup for CI/CD that:
 * 1. Checks each repository individually
 * 2. If not cached - clones it
 * 3. If cached - pulls latest changes
 *
 * Usage: node lib/build/ci-setup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXTERNAL_DIR = path.join(__dirname, '../../external');
const CONFIG_PATH = path.join(__dirname, '../../config/external.json');

// Repository configuration
const REPO_CONFIG = {
    'voyahchat-content': {
        lfs: true,
        shallow: true,
    },
    'voyahchat-docs': {
        lfs: true,
        shallow: true,
    },
    'voyahchat-install': {
        lfs: true,
        shallow: true,
    },
};

function runCommand(command, cwd, errorMessage) {
    try {
        execSync(command, {
            cwd,
            stdio: process.env.NODE_ENV === 'test' ? 'pipe' : 'inherit',
        });
    } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(errorMessage, error.message);
        }
        throw error;
    }
}

function setupRepository(repoUrl, repoName) {
    const repoPath = path.join(EXTERNAL_DIR, repoName);
    const config = REPO_CONFIG[repoName] || {};

    console.log(`\n📦 Processing ${repoName}...`);

    if (fs.existsSync(repoPath)) {
        // Repository exists, update it
        console.log(`  📁 Repository exists, updating...`);

        try {
            // Check if it's a valid git repository
            runCommand('git rev-parse --git-dir', repoPath, '');

            // Fetch latest changes
            if (config.shallow) {
                runCommand('git fetch --depth 1 origin', repoPath, `Failed to fetch ${repoName}:`);
            } else {
                runCommand('git fetch origin', repoPath, `Failed to fetch ${repoName}:`);
            }

            // Pull latest changes
            runCommand('git pull origin main', repoPath, `Failed to pull ${repoName}:`);

            console.log(`  ✅ ${repoName} updated successfully`);

        } catch (error) {
            console.log(`  ⚠️  Invalid repository, re-cloning...`);
            fs.rmSync(repoPath, { recursive: true, force: true });
            return cloneRepository(repoUrl, repoName, config);
        }
    } else {
        // Repository doesn't exist, clone it
        return cloneRepository(repoUrl, repoName, config);
    }
}

function cloneRepository(repoUrl, repoName, config) {
    const repoPath = path.join(EXTERNAL_DIR, repoName);

    console.log(`  📥 Cloning ${repoName}...`);

    let cloneCommand = 'git clone';
    if (config.shallow) {
        cloneCommand += ' --depth 1';
    }
    cloneCommand += ` ${repoUrl} ${repoName}`;

    runCommand(cloneCommand, EXTERNAL_DIR, `Failed to clone ${repoName}:`);

    // Pull LFS files if needed
    if (config.lfs) {
        console.log(`  📥 Pulling LFS files for ${repoName}...`);
        try {
            runCommand('git lfs pull', repoPath, `Failed to pull LFS files for ${repoName}:`);
        } catch (error) {
            console.warn(`  ⚠️  Warning: LFS pull failed for ${repoName}, continuing...`);
        }
    }

    console.log(`  ✅ ${repoName} cloned successfully`);
}

function verifySetup() {
    console.log('\n🔍 Verifying setup...');

    const repoUrls = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    let allGood = true;

    for (const repoUrl of repoUrls) {
        const repoName = path.basename(repoUrl, '.git');
        const repoPath = path.join(EXTERNAL_DIR, repoName);

        if (!fs.existsSync(repoPath)) {
            console.error(`  ❌ ${repoName} not found`);
            allGood = false;
        } else {
            const gitDir = path.join(repoPath, '.git');
            if (!fs.existsSync(gitDir)) {
                console.error(`  ❌ ${repoName} is not a git repository`);
                allGood = false;
            } else {
                console.log(`  ✅ ${repoName} is ready`);
            }
        }
    }

    if (!allGood) {
        console.error('\n❌ Setup verification failed');
        process.exit(1);
    }

    // Show sizes
    console.log('\n📊 Repository sizes:');
    for (const repoUrl of repoUrls) {
        const repoName = path.basename(repoUrl, '.git');
        const repoPath = path.join(EXTERNAL_DIR, repoName);
        if (fs.existsSync(repoPath)) {
            try {
                const size = execSync(`du -sh "${repoPath}"`, { encoding: 'utf8' }).trim();
                console.log(`  ${repoName}: ${size}`);
            } catch (error) {
                console.log(`  ${repoName}: size unavailable`);
            }
        }
    }
}

function main() {
    console.log('🚀 CI Setup - Smart repository management');
    console.log(`📁 External directory: ${EXTERNAL_DIR}`);

    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(`❌ Error: Configuration file not found: ${CONFIG_PATH}`);
        process.exit(1);
    }

    // Ensure external directory exists
    if (!fs.existsSync(EXTERNAL_DIR)) {
        fs.mkdirSync(EXTERNAL_DIR, { recursive: true });
    }

    try {
        // Read repository URLs
        const repoUrls = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

        console.log(`\n📋 Found ${repoUrls.length} repositories to process`);

        // Setup each repository
        for (const repoUrl of repoUrls) {
            const repoName = path.basename(repoUrl, '.git');
            setupRepository(repoUrl, repoName);
        }

        // Verify setup
        verifySetup();

        console.log('\n✅ CI setup completed successfully');
        console.log('🎯 All repositories are ready for build');

    } catch (error) {
        console.error('\n❌ CI setup failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    setupRepository,
    cloneRepository,
    verifySetup,
};
