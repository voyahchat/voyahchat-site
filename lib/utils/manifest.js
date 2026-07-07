const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { Dir } = require('./dir');

const MANIFEST_FILE = 'manifest.json';
const HASH_LENGTH = 16;
const PARTIAL_HASH_EXTS = new Set(['.zip', '.pdf']);

class Manifest {
    static getFileName() {
        return MANIFEST_FILE;
    }

    static writeManifest(manifest, filePath) {
        const sorted = {};
        Object.keys(manifest).sort().forEach(key => {
            sorted[key] = manifest[key];
        });
        fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2));
        return sorted;
    }

    static load(siteDir) {
        const manifestPath = path.join(siteDir || Dir.getSite(), MANIFEST_FILE);
        if (fs.existsSync(manifestPath)) {
            return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        }
        return {};
    }

    static generateFileHash(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const opts = PARTIAL_HASH_EXTS.has(path.extname(filePath).toLowerCase())
                ? { start: 0, end: 1023 }
                : {};
            const stream = fs.createReadStream(filePath, opts);
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex').substring(0, HASH_LENGTH)));
            stream.on('error', reject);
        });
    }

    static async generate(siteDir) {
        const manifest = {};

        const scanDir = async (dirPath, basePath = '') => {
            const items = fs.readdirSync(dirPath);

            for (const item of items) {
                const fullPath = path.join(dirPath, item);
                const relativePath = path.join(basePath, item).replace(/\\/g, '/');
                const stats = fs.statSync(fullPath);

                if (stats.isDirectory()) {
                    await scanDir(fullPath, relativePath);
                } else if (relativePath !== MANIFEST_FILE) {
                    const hash = await Manifest.generateFileHash(fullPath);
                    manifest[relativePath] = { size: stats.size, hash };
                }
            }
        };

        await scanDir(siteDir);

        const outputPath = path.join(siteDir, MANIFEST_FILE);
        Manifest.writeManifest(manifest, outputPath);
        return manifest;
    }

    static compare(localManifest, serverManifest) {
        const toUpload = [];
        const toDelete = [];
        const unchanged = [];

        for (const [filePath, local] of Object.entries(localManifest)) {
            const server = serverManifest[filePath];
            if (!server) {
                toUpload.push({ path: filePath, reason: 'new' });
            } else if (server.size !== local.size) {
                toUpload.push({ path: filePath, reason: 'changed' });
            } else if (server.hash !== local.hash) {
                toUpload.push({ path: filePath, reason: 'changed' });
            } else {
                unchanged.push(filePath);
            }
        }

        for (const filePath of Object.keys(serverManifest)) {
            if (!(filePath in localManifest)) {
                toDelete.push(filePath);
            }
        }

        return {
            toUpload: toUpload.sort((a, b) => a.path.localeCompare(b.path)),
            toDelete: toDelete.sort(),
            unchanged,
            totalToUpload: toUpload.length,
            totalToDelete: toDelete.length,
            totalUnchanged: unchanged.length,
        };
    }

    /**
     * Compare using actual server file sizes from LIST, not manifest metadata.
     * Hash comparison only when actual sizes match.
     */
    static compareWithServer(localManifest, serverManifest, serverFileSizes) {
        const toUpload = [];
        const toDelete = [];
        const unchanged = [];

        for (const [filePath, local] of Object.entries(localManifest)) {
            const actualSize = serverFileSizes[filePath];
            if (actualSize === undefined) {
                toUpload.push({ path: filePath, reason: 'new' });
            } else if (actualSize !== local.size) {
                toUpload.push({ path: filePath, reason: 'changed' });
            } else {
                const server = serverManifest[filePath];
                if (server && server.hash !== local.hash) {
                    toUpload.push({ path: filePath, reason: 'changed' });
                } else {
                    unchanged.push(filePath);
                }
            }
        }

        // Detect orphans against the ACTUAL server listing (serverFileSizes), not the
        // manifest. A file that exists on the server but is missing from the manifest — e.g.
        // left over from an interrupted deploy where the manifest upload never ran — would
        // otherwise never be cleaned up, and the gap between server LIST and local count
        // would grow on every run. The manifest file itself is always skipped: it lives on
        // the server but is intentionally excluded from the local manifest, and is uploaded
        // separately as the last step of the deploy.
        for (const filePath of Object.keys(serverFileSizes)) {
            if (!(filePath in localManifest) && filePath !== MANIFEST_FILE) {
                toDelete.push(filePath);
            }
        }

        return {
            toUpload: toUpload.sort((a, b) => a.path.localeCompare(b.path)),
            toDelete: toDelete.sort(),
            unchanged,
            totalToUpload: toUpload.length,
            totalToDelete: toDelete.length,
            totalUnchanged: unchanged.length,
        };
    }

    static preserveFiles(localManifest, serverManifest, filePaths) {
        let preserved = 0;
        for (const filePath of filePaths) {
            if (serverManifest[filePath] && !localManifest[filePath]) {
                localManifest[filePath] = serverManifest[filePath];
                preserved++;
            }
        }
        return preserved;
    }
}

module.exports = Manifest;
