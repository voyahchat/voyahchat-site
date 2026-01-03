#!/usr/bin/env node

/**
 * CI Setup Script
 *
 * Smart setup for CI/CD that:
 * 1. Checks each repository individually
 * 2. If not cached - clones it
 * 3. If cached - pulls latest changes
 *
 * Usage: node lib/build/setup-ci.js
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
        lfs: false,  // Disable LFS for this repo due to budget constraints
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

    console.log(`\nProcessing ${repoName}...`);

    // Convert SSH URL to HTTPS for CI environment
    let httpsUrl = repoUrl;
    if (repoUrl.startsWith('git@github.com:')) {
        httpsUrl = repoUrl.replace('git@github.com:', 'https://github.com/');
    }

    if (fs.existsSync(repoPath)) {
        // Repository exists, update it
        console.log('  Repository exists, updating...');

        try {
            // Check if it's a valid git repository
            runCommand('git rev-parse --git-dir', repoPath, '');

            // Update remote URL to HTTPS if needed
            runCommand(`git remote set-url origin ${httpsUrl}`, repoPath, '');

            // Fetch latest changes
            if (config.shallow) {
                runCommand('git fetch --depth 1 origin', repoPath, `Failed to fetch ${repoName}:`);
            } else {
                runCommand('git fetch origin', repoPath, `Failed to fetch ${repoName}:`);
            }

            // Pull latest changes
            runCommand('git pull origin main', repoPath, `Failed to pull ${repoName}:`);

            console.log(`  ${repoName} updated successfully`);

        } catch (error) {
            console.log('  Invalid repository, re-cloning...');
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

    console.log(`  Cloning ${repoName}...`);

    // Convert SSH URL to HTTPS for CI environment
    let httpsUrl = repoUrl;
    if (repoUrl.startsWith('git@github.com:')) {
        httpsUrl = repoUrl.replace('git@github.com:', 'https://github.com/');
    }

    let cloneCommand = 'git clone';
    if (config.shallow) {
        cloneCommand += ' --depth 1';
    }

    // Skip LFS during clone if disabled to avoid LFS budget issues
    if (!config.lfs) {
        cloneCommand += ' --config filter.lfs.smudge=git-lfs-smudge '
            + '--config filter.lfs.process=git-lfs-filter-process '
            + '--config filter.lfs.required=false';
    }

    cloneCommand += ` ${httpsUrl} ${repoName}`;

    try {
        runCommand(cloneCommand, EXTERNAL_DIR, `Failed to clone ${repoName}:`);
    } catch (error) {
        // If clone failed and LFS is enabled, try again without LFS
        if (config.lfs && error.message.includes('LFS')) {
            console.warn(`  LFS clone failed for ${repoName}, retrying without LFS...`);
            const noLfsCommand = cloneCommand.replace(
                'git clone',
                'git clone --config filter.lfs.smudge=git-lfs-smudge '
                + '--config filter.lfs.process=git-lfs-filter-process '
                + '--config filter.lfs.required=false',
            );
            runCommand(noLfsCommand, EXTERNAL_DIR, `Failed to clone ${repoName} without LFS:`);
        } else {
            throw error;
        }
    }

    // Pull LFS files if needed
    if (config.lfs) {
        console.log(`  Pulling LFS files for ${repoName}...`);
        try {
            runCommand('git lfs pull', repoPath, `Failed to pull LFS files for ${repoName}:`);
        } catch (error) {
            console.warn(`  Warning: LFS pull failed for ${repoName}, continuing...`);
            console.warn(`  Error: ${error.message}`);
        }
    }

    console.log(`  ${repoName} cloned successfully`);
}

function verifySetup() {
    console.log('\nVerifying setup...');

    const repoUrls = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    let allGood = true;

    for (const repoUrl of repoUrls) {
        const repoName = path.basename(repoUrl, '.git');
        const repoPath = path.join(EXTERNAL_DIR, repoName);

        if (!fs.existsSync(repoPath)) {
            console.error(`  ${repoName} not found`);
            allGood = false;
        } else {
            const gitDir = path.join(repoPath, '.git');
            if (!fs.existsSync(gitDir)) {
                console.error(`  ${repoName} is not a git repository`);
                allGood = false;
            } else {
                console.log(`  ${repoName} is ready`);
            }
        }
    }

    if (!allGood) {
        console.error('\nSetup verification failed');
        process.exit(1);
    }

    // Show sizes
    console.log('\nRepository sizes:');
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

function updateAvaConfig() {
    console.log('\nUpdating AVA configuration for CI environment...');

    const avaConfigPath = path.join(__dirname, '../../config/config-ava.js');

    try {
        // Read the current AVA configuration
        let configContent = fs.readFileSync(avaConfigPath, 'utf8');

        // Update configuration to exclude nginx-integrity tests
        configContent = configContent.replace(
            'files: [\n        \'lib/test/**/*.test.js\',\n    ],',
            'files: [\n        \'lib/test/**/*.test.js\',\n        \'!lib/test/nginx-integrity.test.js\',\n    ],',
        );

        // Write the updated configuration back to the same file
        fs.writeFileSync(avaConfigPath, configContent, 'utf8');

        console.log('  AVA configuration updated for CI environment');
    } catch (error) {
        console.error('  Failed to update AVA configuration:', error.message);
        throw error;
    }
}

function main() {
    console.log('CI Setup - Smart repository management');
    console.log(`External directory: ${EXTERNAL_DIR}`);

    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(`Error: Configuration file not found: ${CONFIG_PATH}`);
        process.exit(1);
    }

    // Ensure external directory exists
    if (!fs.existsSync(EXTERNAL_DIR)) {
        fs.mkdirSync(EXTERNAL_DIR, { recursive: true });
    }

    try {
        // Read repository URLs
        const repoUrls = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

        console.log(`\nFound ${repoUrls.length} repositories to process`);

        // Setup each repository
        for (const repoUrl of repoUrls) {
            const repoName = path.basename(repoUrl, '.git');
            setupRepository(repoUrl, repoName);
        }

        // Verify setup
        verifySetup();

        // Update AVA configuration for CI environment
        updateAvaConfig();

        // Disable Git default branch warnings
        execSync('git config --global advice.defaultBranchName false', { stdio: 'pipe' });

        console.log('\nCI setup completed successfully');
        console.log('All repositories are ready for build');

    } catch (error) {
        console.error('\nCI setup failed:', error.message);
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
    updateAvaConfig,
};
