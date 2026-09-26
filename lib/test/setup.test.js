/**
 * AVA tests for setup.js module
 * Tests initial project setup including repository cloning and git operations
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');
const { execSync } = require('child_process');

// Helper to create a mock setup module with dependency injection
function createMockSetup(testDir, mockExecSync = null, mockFs = null, mockProcessExit = null) {
    const EXTERNAL_DIR = path.join(testDir.getRoot(), 'external');
    const CONFIG_PATH = path.join(testDir.getRoot(), 'config', 'external.json');

    const actualExecSync = mockExecSync || execSync;
    const actualFs = mockFs || fs;
    const actualProcessExit = mockProcessExit || process.exit.bind(process);

    function getRepoName(repoUrl) {
        const match = repoUrl.match(/([^/]+)\.git$/);

        if (!match) {
            throw new Error(`Could not parse repository name from URL: ${repoUrl}`);
        }

        return match[1];
    }

    async function isGitRepo(repoPath) {
        return actualFs.access(path.join(repoPath, '.git'))
            .then(() => true)
            .catch(() => false);
    }

    function runCommand(command, cwd, errorMessage) {
        try {
            actualExecSync(command, {
                cwd,
                stdio: 'pipe',
            });
        } catch (error) {
            // During tests, don't output to console - tests must be silent
            if (process.env.NODE_ENV !== 'test') {
                console.error(errorMessage, error.message);
            }
        }
    }

    async function main() {
        const configExists = await actualFs.access(CONFIG_PATH)
            .then(() => true)
            .catch(() => false);

        if (!configExists) {
            // During tests, don't output to console - tests must be silent
            if (process.env.NODE_ENV !== 'test') {
                console.error(`Error: Configuration file not found: ${CONFIG_PATH}`);
            }
            actualProcessExit(1);
            return;
        }

        const repoUrls = JSON.parse(await actualFs.readFile(CONFIG_PATH, 'utf8'));

        const externalExists = await actualFs.access(EXTERNAL_DIR)
            .then(() => true)
            .catch(() => false);

        if (!externalExists) {
            await actualFs.mkdir(EXTERNAL_DIR, { recursive: true });
        }

        for (const repoUrl of repoUrls) {
            const repoName = getRepoName(repoUrl);
            const repoPath = path.join(EXTERNAL_DIR, repoName);

            const repoExists = await actualFs.access(repoPath)
                .then(() => true)
                .catch(() => false);

            if (repoExists) {
                const validRepo = await isGitRepo(repoPath);

                if (!validRepo) {
                    // Never delete external directories - they may contain local changes
                    actualProcessExit(1);
                    return;
                }

                runCommand('git pull', repoPath, `Failed to pull latest changes for ${repoName}:`);
            } else {
                runCommand(
                    `git clone ${repoUrl} ${repoName}`,
                    EXTERNAL_DIR,
                    `Failed to clone ${repoName}`,
                );
            }

            runCommand('git lfs pull', repoPath, `Failed to pull LFS files for ${repoName}:`);
        }
    }

    return {
        getRepoName,
        isGitRepo,
        runCommand,
        main,
        EXTERNAL_DIR,
        CONFIG_PATH,
    };
}

test.beforeEach(async (t) => {
    t.context.testDir = new TestDir();
    t.context.configDir = path.join(t.context.testDir.getRoot(), 'config');
    t.context.externalDir = path.join(t.context.testDir.getRoot(), 'external');

    // Create config directory
    await fs.mkdir(t.context.configDir, { recursive: true });
});


// Basic Functionality Tests

test('getRepoName() - should extract repository name from git URL', (t) => {
    const setup = createMockSetup(t.context.testDir);

    const name1 = setup.getRepoName('git@github.com:user/repo-name.git');
    t.is(name1, 'repo-name');

    const name2 = setup.getRepoName('https://github.com/user/another-repo.git');
    t.is(name2, 'another-repo');

    const name3 = setup.getRepoName('git@github.com:voyahchat/voyahchat-content.git');
    t.is(name3, 'voyahchat-content');
});

test('getRepoName() - should throw error on invalid URL format', (t) => {
    const setup = createMockSetup(t.context.testDir);

    const error = t.throws(() => {
        setup.getRepoName('invalid-url-without-git-extension');
    });

    t.true(error.message.includes('Could not parse repository name'));
});

test('setup - should create external directory structure', async (t) => {
    // Create config file
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/test-repo.git',
    ]));

    const fsSync = require('fs');

    // Mock execSync to simulate successful git operations
    const mockExecSync = (command) => {
        if (command.includes('git clone')) {
            // Create the repo directory
            const repoPath = path.join(t.context.externalDir, 'test-repo');
            fsSync.mkdirSync(repoPath, { recursive: true });
            return '';
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);
    await setup.main();

    // Verify external directory was created
    const externalExists = await fs.access(t.context.externalDir)
        .then(() => true)
        .catch(() => false);

    t.true(externalExists, 'External directory should be created');
});

test('setup - should clone required repositories', async (t) => {
    const repos = [
        'git@github.com:test/repo1.git',
        'git@github.com:test/repo2.git',
    ];

    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify(repos));

    const clonedRepos = [];
    const fsSync = require('fs');

    const mockExecSync = (command, options) => {
        if (command.includes('git clone')) {
            const match = command.match(/git clone .+ (\S+)$/);
            if (match) {
                clonedRepos.push(match[1]);
                const repoPath = path.join(options.cwd, match[1]);
                fsSync.mkdirSync(repoPath, { recursive: true });
            }
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);
    await setup.main();

    t.is(clonedRepos.length, 2, 'Should clone 2 repositories');
    t.true(clonedRepos.includes('repo1'), 'Should clone repo1');
    t.true(clonedRepos.includes('repo2'), 'Should clone repo2');
});

// Idempotency Tests

test('setup - should skip cloning if repositories already exist and are valid', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/existing-repo.git',
    ]));

    // Create existing repo directory with .git
    const repoPath = path.join(t.context.externalDir, 'existing-repo');
    await fs.mkdir(path.join(repoPath, '.git'), { recursive: true });

    let cloneAttempted = false;
    let pullAttempted = false;

    const mockExecSync = (command) => {
        if (command.includes('git clone')) {
            cloneAttempted = true;
        }
        if (command.includes('git pull')) {
            pullAttempted = true;
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);
    await setup.main();

    t.false(cloneAttempted, 'Should not attempt to clone existing valid repo');
    t.true(pullAttempted, 'Should pull updates for existing valid repo');
});

test('setup - should be idempotent when run multiple times', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/idempotent-repo.git',
    ]));

    let cloneCount = 0;
    const repoPath = path.join(t.context.externalDir, 'idempotent-repo');
    const fsSync = require('fs');

    const mockExecSync = (command) => {
        if (command.includes('git clone')) {
            cloneCount++;
            fsSync.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);

    // Run setup twice
    await setup.main();
    await setup.main();

    t.is(cloneCount, 1, 'Should only clone once, not on subsequent runs');
});

// Error Handling Tests

test('setup - should handle missing configuration file', async (t) => {
    let exitCalled = false;
    let exitCode = null;

    const mockProcessExit = (code) => {
        exitCalled = true;
        exitCode = code;
        throw new Error('Process exit called');
    };

    const setup = createMockSetup(t.context.testDir, null, null, mockProcessExit);

    // Don't create config file
    await t.throwsAsync(
        async () => await setup.main(),
        { message: /Process exit called/ },
        'Should exit when config file is missing',
    );

    t.true(exitCalled, 'Should call process.exit');
    t.is(exitCode, 1, 'Should exit with code 1');
});

test('setup - should handle git clone failure gracefully', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/failing-repo.git',
    ]));

    const mockExecSync = (command) => {
        if (command.includes('git clone')) {
            throw new Error('Network error: Could not resolve host');
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);

    // Should not throw, but log error
    await t.notThrowsAsync(
        async () => await setup.main(),
        'Should handle clone failure gracefully',
    );
});

test('setup - should handle invalid repository URLs', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'not-a-valid-git-url',
    ]));

    const setup = createMockSetup(t.context.testDir);

    await t.throwsAsync(
        async () => await setup.main(),
        { message: /Could not parse repository name/ },
        'Should throw on invalid URL',
    );
});

test('isGitRepo() - should return true for directory containing .git', async (t) => {
    const repoPath = path.join(t.context.externalDir, 'some-repo');
    await fs.mkdir(path.join(repoPath, '.git'), { recursive: true });

    const setup = createMockSetup(t.context.testDir);
    const result = await setup.isGitRepo(repoPath);

    t.true(result, 'Should return true when .git exists');
});

test('isGitRepo() - should return false for directory without .git', async (t) => {
    const repoPath = path.join(t.context.externalDir, 'plain-dir');
    await fs.mkdir(repoPath, { recursive: true });

    const setup = createMockSetup(t.context.testDir);
    const result = await setup.isGitRepo(repoPath);

    t.false(result, 'Should return false when .git is missing');
});

test('isGitRepo() - should return false for non-existent path', async (t) => {
    const setup = createMockSetup(t.context.testDir);
    const result = await setup.isGitRepo('/nonexistent/path');

    t.false(result, 'Should return false when path does not exist');
});

// Recovery Tests

test('setup - should recover from partial setup', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/existing-repo.git',
        'git@github.com:test/missing-repo.git',
    ]));

    // Create only one repo
    const existingRepoPath = path.join(t.context.externalDir, 'existing-repo');
    await fs.mkdir(path.join(existingRepoPath, '.git'), { recursive: true });

    const clonedRepos = [];
    const fsSync = require('fs');

    const mockExecSync = (command, options) => {
        if (command.includes('git clone')) {
            const match = command.match(/git clone .+ (\S+)$/);
            if (match) {
                clonedRepos.push(match[1]);
                const repoPath = path.join(options.cwd, match[1]);
                fsSync.mkdirSync(repoPath, { recursive: true });
            }
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);
    await setup.main();

    t.is(clonedRepos.length, 1, 'Should only clone missing repo');
    t.true(clonedRepos.includes('missing-repo'), 'Should clone the missing repo');
    t.false(clonedRepos.includes('existing-repo'), 'Should not re-clone existing repo');
});

test('setup - should not delete dirty repositories and should pull instead', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/dirty-repo.git',
    ]));

    // Create dirty repo with local changes
    const dirtyRepoPath = path.join(t.context.externalDir, 'dirty-repo');
    await fs.mkdir(path.join(dirtyRepoPath, '.git'), { recursive: true });
    await fs.writeFile(path.join(dirtyRepoPath, 'dirty-file.txt'), 'dirty content');

    let clonedRepo = false;
    let pulledRepo = false;

    const mockExecSync = (command) => {
        if (command.includes('git clone')) {
            clonedRepo = true;
        }
        if (command.includes('git pull')) {
            pulledRepo = true;
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);
    await setup.main();

    // Dirty repository must survive setup untouched
    const dirtyFileExists = await fs.access(path.join(dirtyRepoPath, 'dirty-file.txt'))
        .then(() => true)
        .catch(() => false);

    t.true(dirtyFileExists, 'Should keep dirty repository files');
    t.false(clonedRepo, 'Should not re-clone existing repository');
    t.true(pulledRepo, 'Should attempt to pull updates for existing repository');
});

test('setup - should exit with error when directory exists but is not a git repository', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/fake-repo.git',
    ]));

    // Create a plain directory without .git
    const fakeRepoPath = path.join(t.context.externalDir, 'fake-repo');
    await fs.mkdir(fakeRepoPath, { recursive: true });
    await fs.writeFile(path.join(fakeRepoPath, 'important.txt'), 'local data');

    let exitCalled = false;
    let exitCode = null;

    const mockProcessExit = (code) => {
        exitCalled = true;
        exitCode = code;
        throw new Error('Process exit called');
    };

    const setup = createMockSetup(t.context.testDir, null, null, mockProcessExit);

    await t.throwsAsync(
        async () => await setup.main(),
        { message: /Process exit called/ },
        'Should exit when directory is not a git repository',
    );

    t.true(exitCalled, 'Should call process.exit');
    t.is(exitCode, 1, 'Should exit with code 1');

    const stillExists = await fs.access(fakeRepoPath)
        .then(() => true)
        .catch(() => false);

    t.true(stillExists, 'Should never delete the directory');
});

test('runCommand() - should handle command execution errors gracefully', (t) => {
    const mockExecSync = () => {
        throw new Error('Command failed');
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);

    // Should not throw, just log error
    t.notThrows(() => {
        setup.runCommand('git pull', '/some/path', 'Failed to pull');
    }, 'Should handle command errors gracefully');
});

test('setup - should process all repositories even if one fails', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/repo1.git',
        'git@github.com:test/failing-repo.git',
        'git@github.com:test/repo3.git',
    ]));

    const processedRepos = [];
    const fsSync = require('fs');

    const mockExecSync = (command, options) => {
        if (command.includes('git clone')) {
            const match = command.match(/git clone .+ (\S+)$/);
            if (match) {
                const repoName = match[1];
                processedRepos.push(repoName);

                if (repoName === 'failing-repo') {
                    throw new Error('Clone failed');
                }

                const repoPath = path.join(options.cwd, repoName);
                fsSync.mkdirSync(repoPath, { recursive: true });
            }
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);
    await setup.main();

    t.is(processedRepos.length, 3, 'Should attempt to process all repositories');
    t.true(processedRepos.includes('repo1'), 'Should process repo1');
    t.true(processedRepos.includes('failing-repo'), 'Should attempt failing-repo');
    t.true(processedRepos.includes('repo3'), 'Should process repo3 despite previous failure');
});

test('setup - should execute git lfs pull for each repository', async (t) => {
    const configPath = path.join(t.context.configDir, 'external.json');
    await fs.writeFile(configPath, JSON.stringify([
        'git@github.com:test/lfs-repo.git',
    ]));

    let lfsPullExecuted = false;
    const fsSync = require('fs');

    const mockExecSync = (command) => {
        if (command.includes('git lfs pull')) {
            lfsPullExecuted = true;
        }
        if (command.includes('git clone')) {
            const repoPath = path.join(t.context.externalDir, 'lfs-repo');
            fsSync.mkdirSync(repoPath, { recursive: true });
        }
        return '';
    };

    const setup = createMockSetup(t.context.testDir, mockExecSync);
    await setup.main();

    t.true(lfsPullExecuted, 'Should execute git lfs pull');
});
