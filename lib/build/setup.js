#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXTERNAL_DIR = path.join(__dirname, '../../external');
const CONFIG_PATH = path.join(__dirname, '../../config/external.json');

function getRepoName(repoUrl) {
    const match = repoUrl.match(/([^/]+)\.git$/);

    if (!match) {
        throw new Error(`Could not parse repository name from URL: ${repoUrl}`);
    }

    return match[1];
}

function isRepoUpToDate(repoPath) {
    try {
        const statusOutput = execSync('git status --porcelain', {
            cwd: repoPath,
            encoding: 'utf8',
        });

        return statusOutput.trim() === '';
    } catch (error) {
        // If git status fails, it's not up-to-date or not a valid repo
        return false;
    }
}

function runCommand(command, cwd, errorMessage) {
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
        // Optionally, exit the process if a command fails
        // process.exit(1);
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

        if (fs.existsSync(repoPath) && isRepoUpToDate(repoPath)) {
            // During tests, don't output to console - tests must be silent
            if (process.env.NODE_ENV !== 'test') {
                console.log(`${repoName} is already up to date. Pulling latest changes and LFS files`);
            }
            runCommand('git pull', repoPath, `Failed to pull latest changes for ${repoName}:`);
        } else {
            // During tests, don't output to console - tests must be silent
            if (process.env.NODE_ENV !== 'test') {
                console.log(`Cloning ${repoName}`);
            }
            if (fs.existsSync(repoPath)) {
                // During tests, don't output to console - tests must be silent
                if (process.env.NODE_ENV !== 'test') {
                    console.log(`Directory ${repoPath} exists but is not clean or not a valid repo. ` +
                        'Removing and re-cloning');
                }
                fs.rmSync(repoPath, { recursive: true, force: true });
            }
            runCommand(
                `git clone ${repoUrl} ${repoName}`,
                EXTERNAL_DIR,
                `Failed to clone ${repoName}`,
            );
        }

        // During tests, don't output to console - tests must be silent
        if (process.env.NODE_ENV !== 'test') {
            console.log(`Pulling LFS files for ${repoName}`);
        }
        runCommand('git lfs pull', repoPath, `Failed to pull LFS files for ${repoName}:`);

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
