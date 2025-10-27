/**
 * Mock AssetsBuilder for testing
 * Extracted from build-assets.test.js to reduce duplication
 */

const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('../test-dir');

function createMockAssetsBuilder() {
    let ASSETS_DIR = path.join(__dirname, '../../../.assets');
    let ASSETS_JSON_PATH = path.join(ASSETS_DIR, 'assets.json');
    let SITE_DIR = path.join(__dirname, '../../../site');

    const dir1 = new TestDir();
    const dir2 = new TestDir();

    let SOURCE_REPOS = [
        {
            name: 'test-repo-1',
            path: dir1.getRoot(),
            baseUrl: 'https://github.com/test/repo1/raw/refs/heads/main',
        },
        {
            name: 'test-repo-2',
            path: dir2.getRoot(),
            baseUrl: 'https://github.com/test/repo2/raw/refs/heads/main',
        },
    ];

    async function ensureDir(dirPath) {
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
        }
    }

    async function validateAssetsExist(assetsJson) {
        const missingAssets = await Promise.all(Object.entries(assetsJson).map(async ([, localPath]) => {
            const fileName = path.basename(localPath);
            const assetPath = path.join(ASSETS_DIR, fileName);

            try {
                await fs.access(assetPath);

                return null;
            } catch {
                return fileName;
            }
        }));

        return missingAssets.filter(Boolean);
    }

    async function copyAssets() {
        const assetMap = {};

        await Promise.all(SOURCE_REPOS.map(async (repo) => {
            try {
                await fs.access(repo.path);
            } catch {
                throw new Error(`Source directory not found: ${repo.path}`);
            }

            const files = await fs.readdir(repo.path);

            const assetPromises = files
                .filter((file) => file.endsWith('.pdf') || file.endsWith('.zip'))
                .map(async (file) => {
                    const sourcePath = path.join(repo.path, file);
                    const destPath = path.join(ASSETS_DIR, file);
                    const fullSourceUrl = `${repo.baseUrl}/${file}`;
                    const localUrl = `/${file}`;

                    await fs.copyFile(sourcePath, destPath);
                    assetMap[fullSourceUrl] = localUrl;
                });

            await Promise.all(assetPromises);
        }));

        return assetMap;
    }

    async function generateAssetsJson(assetMap) {
        const content = JSON.stringify(assetMap, null, 4);

        await fs.writeFile(ASSETS_JSON_PATH, content, 'utf8');
    }

    async function copyAssetsToSite(assetsJson) {
        await ensureDir(SITE_DIR);

        await Promise.all(Object.entries(assetsJson).map(async ([, localPath]) => {
            const fileName = path.basename(localPath);
            const sourcePath = path.join(ASSETS_DIR, fileName);
            const destPath = path.join(SITE_DIR, fileName);

            await fs.copyFile(sourcePath, destPath);
        }));
    }

    async function main() {
        await ensureDir(ASSETS_DIR);

        let assetsJson = null;
        let needsInitialBuild = false;

        try {
            const content = await fs.readFile(ASSETS_JSON_PATH, 'utf8');

            assetsJson = JSON.parse(content);

            const missingAssets = await validateAssetsExist(assetsJson);

            if (missingAssets.length > 0) {
                console.error(`Missing assets: ${missingAssets.join(', ')}`);
                needsInitialBuild = true;
            }
        } catch {
            needsInitialBuild = true;
        }

        if (needsInitialBuild) {
            const assetMap = await copyAssets();

            await generateAssetsJson(assetMap);
            assetsJson = assetMap;
        }

        await copyAssetsToSite(assetsJson);
    }

    return {
        ensureDir,
        validateAssetsExist,
        copyAssets,
        generateAssetsJson,
        copyAssetsToSite,
        main,
        get ASSETS_DIR() { return ASSETS_DIR; },
        set ASSETS_DIR(value) {
            ASSETS_DIR = value;
            ASSETS_JSON_PATH = path.join(value, 'assets.json');
        },
        get ASSETS_JSON_PATH() { return ASSETS_JSON_PATH; },
        get SITE_DIR() { return SITE_DIR; },
        set SITE_DIR(value) { SITE_DIR = value; },
        get SOURCE_REPOS() { return SOURCE_REPOS; },
        set SOURCE_REPOS(value) { SOURCE_REPOS = value; },
    };
}

module.exports = { createMockAssetsBuilder };
