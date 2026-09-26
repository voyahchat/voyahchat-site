#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getRepoName } = require('./utils');

const EXTERNAL_DIR = path.join(__dirname, '../../external');
const CONFIG_PATH = path.join(__dirname, '../../config/external.json');

function isGitRepo(repoPath) {
    return fs.existsSync(path.join(repoPath, '.git'));
}

function runCommand(command, cwd, errorMessage, continueOnError = false) {
    try {
        execSync(command, {
            cwd,
            stdio: 'pipe',
        }); // stdio: 'pipe' to suppress output on success
    } catch (error) {
        // During tests, don't output to console - tests must be silent
        if (process.env.NODE_ENV !== 'test') {
            console.error(errorMessage, error.message);
        }

        // If continueOnError is true, don't re-throw the error
        if (!continueOnError) {
            throw error;
        }
    }
}

function main() {
    if (!fs.existsSync(CONFIG_PATH)) {
        // During tests, don't output to console - tests must be silent
        if (process.env.NODE_ENV !== 'test') {
            console.error(`Error: Configuration file not found: ${CONFIG_PATH}`);
        }
        process.exit(1);
    }

    const repoUrls = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    if (!fs.existsSync(EXTERNAL_DIR)) {
        fs.mkdirSync(EXTERNAL_DIR, { recursive: true });
    }

    repoUrls.forEach((repoUrl) => {
        const repoName = getRepoName(repoUrl);
        const repoPath = path.join(EXTERNAL_DIR, repoName);

        // During tests, don't output to console - tests must be silent
        if (process.env.NODE_ENV !== 'test') {
            console.log(`Processing ${repoName}`);
        }

        if (fs.existsSync(repoPath)) {
            if (!isGitRepo(repoPath)) {
                // Never delete external directories - they may contain local changes
                if (process.env.NODE_ENV !== 'test') {
                    console.error(`Error: ${repoPath} exists but is not a git repository. ` +
                        'Remove it manually and re-run setup');
                }
                process.exit(1);
            }

            // During tests, don't output to console - tests must be silent
            if (process.env.NODE_ENV !== 'test') {
                console.log(`Pulling latest changes for ${repoName}`);
            }
            runCommand('git pull', repoPath, `Failed to pull latest changes for ${repoName}:`, true);
        } else {
            // During tests, don't output to console - tests must be silent
            if (process.env.NODE_ENV !== 'test') {
                console.log(`Cloning ${repoName}`);
            }
            runCommand(
                `git clone ${repoUrl} ${repoName}`,
                EXTERNAL_DIR,
                `Failed to clone ${repoName}`,
                true,
            );
        }

        // During tests, don't output to console - tests must be silent
        if (process.env.NODE_ENV !== 'test') {
            console.log(`Pulling LFS files for ${repoName}`);
        }
        runCommand('git lfs pull', repoPath, `Failed to pull LFS files for ${repoName}:`, true);

        // During tests, don't output to console - tests must be silent
        if (process.env.NODE_ENV !== 'test') {
            console.log(`${repoName} processed successfully\n`);
        }
    });

    // During tests, don't output to console - tests must be silent
    if (process.env.NODE_ENV !== 'test') {
        console.log('All external repositories have been set up');
    }
}

main();
