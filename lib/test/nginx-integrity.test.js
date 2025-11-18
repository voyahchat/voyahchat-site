const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const zlib = require('zlib');
const { promisify } = require('util');
const test = require('ava');
const { getAllFiles } = require('./utils');

const gunzip = promisify(zlib.gunzip);
const brotliDecompress = promisify(zlib.brotliDecompress);

const PORT = 8080;

// Helper function to make HTTP request
function makeRequest(urlParam, headers = {}) {
    return new Promise((resolveParam, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: urlParam,
            method: 'GET',
            headers,
        };
        const req = http.request(options, (res) => {
            const chunks = [];

            res.on('data', (chunk) => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                const rawBody = Buffer.concat(chunks);
                const body = rawBody.toString('utf8');

                resolveParam({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body,
                    rawBody,
                });
            });
        });

        req.on('error', () => {
            // Handle error silently for test purposes
        });
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

// Helper function to wait for server to be ready
async function waitForServer(maxAttempts = 30) {
    const tryServer = async (attempt) => {
        if (attempt >= maxAttempts) {
            throw new Error('Server failed to start within timeout period');
        }

        try {
            const response = await makeRequest('/');

            if (response.statusCode === 200 || response.statusCode === 404) {
                return true;
            }
        } catch (error) {
            // Server not ready yet
        }

        await new Promise((resolveParam) => {
            setTimeout(resolveParam, 1000);
        });

        return tryServer(attempt + 1);
    };

    return tryServer(0);
}

// Build site once before all tests
test.before(async (t) => {
    // Ensure build artifacts exist
    const buildHtmlPath = path.join(process.cwd(), '.build', 'build-html.json');
    const siteIndexPath = path.join(process.cwd(), 'site', 'html', 'index.html');

    if (!fs.existsSync(buildHtmlPath) || !fs.existsSync(siteIndexPath)) {
        console.log('Build artifacts not found. Running full build...');
        try {
            execSync('npm run build', { stdio: 'inherit' });
        } catch (error) {
            t.fail(`Build failed: ${error.message}`);
            return;
        }
    }

    // Clean up any existing server
    try {
        execSync('npm stop', { stdio: 'pipe' });
    } catch (error) {
        // Ignore errors if server not running
    }

    // Start the server
    try {
        execSync('npm start', { stdio: 'pipe' });
    } catch (error) {
        t.fail(`Failed to start server: ${error.message}`);
        return;
    }

    // Wait for server to be ready
    try {
        await waitForServer();
    } catch (error) {
        t.fail(`Server not ready: ${error.message}`);
    }
});

// Stop nginx after all tests
test.after(async () => {
    try {
        execSync('npm stop', { stdio: 'pipe' });
    } catch (error) {
        // Ignore errors during cleanup
    }
});

// ============================================================================
// SECTION 1: Compression Build Tests
// ============================================================================

test('nginx - compression build text files are compressed', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const brotliDir = path.join(siteDir, 'brotli');
    const gzipDir = path.join(siteDir, 'gzip');

    // Check that brotli and gzip directories exist
    t.true(fs.existsSync(brotliDir), 'brotli/ directory should exist');
    t.true(fs.existsSync(gzipDir), 'gzip/ directory should exist');

    // Load unified build statistics
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const buildJs = JSON.parse(fs.readFileSync('.build/build-js.json', 'utf8'));
    const buildImages = JSON.parse(fs.readFileSync('.build/build-images.json', 'utf8'));
    const buildHtml = JSON.parse(fs.readFileSync('.build/build-html.json', 'utf8'));

    // Test CSS files
    Object.entries(buildCss).forEach(([filename]) => {
        const brPath = path.join(brotliDir, `${filename}.br`);
        const gzPath = path.join(gzipDir, `${filename}.gz`);

        t.true(fs.existsSync(brPath), `${filename} should have brotli version`);
        t.true(fs.existsSync(gzPath), `${filename} should have gzip version`);
    });

    // Test JS files
    Object.entries(buildJs).forEach(([filename]) => {
        const brPath = path.join(brotliDir, `${filename}.br`);
        const gzPath = path.join(gzipDir, `${filename}.gz`);

        t.true(fs.existsSync(brPath), `${filename} should have brotli version`);
        t.true(fs.existsSync(gzPath), `${filename} should have gzip version`);
    });

    // Test SVG files from build-images.json
    Object.entries(buildImages).forEach(([filename, info]) => {
        if (info.metadata.format === 'svg') {
            // Remove svg/ prefix for compressed files since they're stored flat
            const compressedFilename = filename.replace('svg/', '');
            const brPath = path.join(brotliDir, `${compressedFilename}.br`);
            const gzPath = path.join(gzipDir, `${compressedFilename}.gz`);

            t.true(fs.existsSync(brPath), `${filename} should have brotli version`);
            t.true(fs.existsSync(gzPath), `${filename} should have gzip version`);
        }
    });

    // Test HTML files (using build-html.json)
    Object.entries(buildHtml).forEach(([filename]) => {
        const brPath = path.join(brotliDir, `${filename}.br`);
        const gzPath = path.join(gzipDir, `${filename}.gz`);

        t.true(fs.existsSync(brPath), `${filename} should have brotli version`);
        t.true(fs.existsSync(gzPath), `${filename} should have gzip version`);
    });
});

test('nginx - compression build binary files are NOT compressed', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const brotliDir = path.join(siteDir, 'brotli');
    const gzipDir = path.join(siteDir, 'gzip');

    const buildImages = JSON.parse(fs.readFileSync('.build/build-images.json', 'utf8'));

    // Test binary image files (PNG, JPG, GIF, ICO)
    Object.entries(buildImages).forEach(([filename]) => {
        const ext = path.extname(filename).toLowerCase();

        if (['.png', '.jpg', '.jpeg', '.gif', '.ico'].includes(ext)) {
            const brPath = path.join(brotliDir, `${filename}.br`);
            const gzPath = path.join(gzipDir, `${filename}.gz`);

            t.false(fs.existsSync(brPath), `${filename} should NOT have brotli version`);
            t.false(fs.existsSync(gzPath), `${filename} should NOT have gzip version`);
        }
    });
});

test('nginx - compression build directory structure is correct', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const brotliDir = path.join(siteDir, 'brotli');
    const gzipDir = path.join(siteDir, 'gzip');

    // brotli/ directory contains ONLY .br files
    const brotliFiles = getAllFiles(brotliDir);

    brotliFiles.forEach((file) => {
        t.true(file.endsWith('.br'), `File ${file} in brotli/ must have .br extension`);
    });

    // gzip/ directory contains ONLY .gz files
    const gzipFiles = getAllFiles(gzipDir);

    gzipFiles.forEach((file) => {
        t.true(file.endsWith('.gz'), `File ${file} in gzip/ must have .gz extension`);
    });

    // Root directory has NO .br or .gz files
    const rootFiles = fs.readdirSync(siteDir);
    const brFiles = rootFiles.filter((f) => f.endsWith('.br'));
    const gzFiles = rootFiles.filter((f) => f.endsWith('.gz'));

    t.is(brFiles.length, 0, 'Root should have no .br files');
    t.is(gzFiles.length, 0, 'Root should have no .gz files');
});

test('nginx - compression build compressed files decompress correctly', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const brotliDir = path.join(siteDir, 'brotli');
    const gzipDir = path.join(siteDir, 'gzip');

    // Test index.html compression
    const originalPath = path.join(siteDir, 'html', 'index.html');
    const brPath = path.join(brotliDir, 'index.html.br');
    const gzPath = path.join(gzipDir, 'index.html.gz');

    const originalContent = fs.readFileSync(originalPath);
    const brContent = fs.readFileSync(brPath);
    const decompressedBr = await brotliDecompress(brContent);

    t.deepEqual(decompressedBr, originalContent, 'Brotli decompressed content should match original');

    const gzContent = fs.readFileSync(gzPath);
    const decompressedGz = await gunzip(gzContent);

    t.deepEqual(decompressedGz, originalContent, 'Gzip decompressed content should match original');
});

// ============================================================================
// SECTION 2: Complete File Coverage Tests
// ============================================================================

test('nginx - file coverage all HTML pages are accessible', async (t) => {
    const htmlBuild = JSON.parse(fs.readFileSync('.build/build-html.json', 'utf8'));

    await Promise.all(Object.entries(htmlBuild).map(async ([filename, info]) => {
        const response = await makeRequest(info.url);

        t.is(response.statusCode, 200, `${info.url} (${filename}) should be accessible`);
    }));
});

test('nginx - file coverage all CSS files are accessible', async (t) => {
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));

    await Promise.all(Object.entries(buildCss).map(async ([filename, info]) => {
        const response = await makeRequest(info.metadata.url);

        t.is(response.statusCode, 200, `CSS ${filename} at ${info.metadata.url} should be accessible`);
    }));
});

test('nginx - file coverage all JS files are accessible', async (t) => {
    const buildJs = JSON.parse(fs.readFileSync('.build/build-js.json', 'utf8'));

    await Promise.all(Object.entries(buildJs).map(async ([filename, info]) => {
        const response = await makeRequest(info.metadata.url);

        t.is(response.statusCode, 200, `JS ${filename} at ${info.metadata.url} should be accessible`);
    }));
});

test('nginx - file coverage all image files are accessible', async (t) => {
    const buildImages = JSON.parse(fs.readFileSync('.build/build-images.json', 'utf8'));

    await Promise.all(Object.entries(buildImages).map(async ([filename, info]) => {
        const response = await makeRequest(info.metadata.url);

        t.is(response.statusCode, 200, `Image ${filename} at ${info.metadata.url} should be accessible`);
    }));
});

// ============================================================================
// SECTION 3: Content-Type Verification Tests
// ============================================================================

test('nginx - content-type HTML files have correct MIME type', async (t) => {
    const response = await makeRequest('/');

    t.is(response.statusCode, 200);
    t.true(response.headers['content-type'].includes('text/html'), 'HTML should have text/html content-type');
});

test('nginx - content-type CSS files have correct MIME type', async (t) => {
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const firstCss = Object.values(buildCss)[0];

    const response = await makeRequest(firstCss.metadata.url);

    t.is(response.statusCode, 200);
    t.is(response.headers['content-type'], 'text/css', 'CSS should have text/css content-type');
});

test('nginx - content-type JS files have correct MIME type', async (t) => {
    const buildJs = JSON.parse(fs.readFileSync('.build/build-js.json', 'utf8'));
    const firstJs = Object.values(buildJs)[0];

    const response = await makeRequest(firstJs.metadata.url);

    t.is(response.statusCode, 200);
    t.is(
        response.headers['content-type'],
        'application/javascript',
        'JS should have application/javascript content-type',
    );
});

test('nginx - content-type SVG files have correct MIME type', async (t) => {
    const buildImages = JSON.parse(fs.readFileSync('.build/build-images.json', 'utf8'));
    const svgFiles = Object.entries(buildImages).filter(([, info]) => info.metadata.format === 'svg');

    t.true(svgFiles.length > 0, 'Should have SVG files');

    const [, info] = svgFiles[0];
    const response = await makeRequest(info.metadata.url);

    t.is(response.statusCode, 200);
    t.true(response.headers['content-type'].includes('image/svg'), 'SVG should have image/svg+xml content-type');
});

// ============================================================================
// SECTION 4: Compression Tests
// ============================================================================

test('nginx - compression HTML serves with brotli', async (t) => {
    const response = await makeRequest('/', {'Accept-Encoding': 'br'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br', 'Should serve with brotli encoding');
    t.true(response.headers['content-type'].includes('text/html'));
});

test('nginx - compression HTML serves with gzip', async (t) => {
    const response = await makeRequest('/', {'Accept-Encoding': 'gzip'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'gzip', 'Should serve with gzip encoding');
    t.true(response.headers['content-type'].includes('text/html'));
});

test('nginx - compression HTML serves uncompressed', async (t) => {
    const response = await makeRequest('/');

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], undefined, 'Should not have content-encoding header');
    t.true(response.body.includes('<!DOCTYPE html') || response.body.includes('<html'), 'Should be plain HTML');
});

test('nginx - compression CSS serves with brotli', async (t) => {
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const firstCss = Object.values(buildCss)[0];

    const response = await makeRequest(firstCss.metadata.url, {'Accept-Encoding': 'br'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br', 'CSS should serve with brotli');
});

test('nginx - compression CSS serves with gzip', async (t) => {
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const firstCss = Object.values(buildCss)[0];

    const response = await makeRequest(firstCss.metadata.url, {'Accept-Encoding': 'gzip'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'gzip', 'CSS should serve with gzip');
});

test('nginx - compression JS serves with brotli', async (t) => {
    const buildJs = JSON.parse(fs.readFileSync('.build/build-js.json', 'utf8'));
    const firstJs = Object.values(buildJs)[0];

    const response = await makeRequest(firstJs.metadata.url, {'Accept-Encoding': 'br'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br', 'JS should serve with brotli');
});

test('nginx - compression SVG serves with brotli', async (t) => {
    const buildImages = JSON.parse(fs.readFileSync('.build/build-images.json', 'utf8'));
    const svgFiles = Object.entries(buildImages).filter(([, info]) => info.metadata.format === 'svg');

    t.true(svgFiles.length > 0, 'Should have SVG files');

    const [, info] = svgFiles[0];
    const response = await makeRequest(info.metadata.url, {'Accept-Encoding': 'br'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br', 'SVG should serve with brotli');
});

test('nginx - compression prefers brotli over gzip', async (t) => {
    const response = await makeRequest('/', {'Accept-Encoding': 'br, gzip'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br', 'Should prefer brotli when both are supported');
});

test('nginx - compression invalid encoding "abr" does NOT use brotli', async (t) => {
    const response = await makeRequest('/', {'Accept-Encoding': 'abr'});

    t.is(response.statusCode, 200);
    t.not(response.headers['content-encoding'], 'br', 'Should NOT use brotli for invalid encoding "abr"');
});

test('nginx - compression invalid encoding "bra" does NOT use brotli', async (t) => {
    const response = await makeRequest('/', {'Accept-Encoding': 'bra'});

    t.is(response.statusCode, 200);
    t.not(response.headers['content-encoding'], 'br', 'Should NOT use brotli for invalid encoding "bra"');
});

test('nginx - compression invalid encoding "agzip" does NOT use gzip', async (t) => {
    const response = await makeRequest('/', {'Accept-Encoding': 'agzip'});

    t.is(response.statusCode, 200);
    t.not(response.headers['content-encoding'], 'gzip', 'Should NOT use gzip for invalid encoding "agzip"');
});

test('nginx - compression invalid encoding "gzipa" does NOT use gzip', async (t) => {
    const response = await makeRequest('/', {'Accept-Encoding': 'gzipa'});

    t.is(response.statusCode, 200);
    t.not(response.headers['content-encoding'], 'gzip', 'Should NOT use gzip for invalid encoding "gzipa"');
});

// ============================================================================
// SECTION 5: Content Verification Tests
// ============================================================================

test('nginx - content verification brotli response matches original file', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const originalPath = path.join(siteDir, 'html', 'index.html');

    const response = await makeRequest('/', {'Accept-Encoding': 'br'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br');

    // Decompress response and compare with original
    const decompressed = await brotliDecompress(response.rawBody);
    const original = fs.readFileSync(originalPath);

    t.deepEqual(decompressed, original, 'Decompressed brotli response should match original file');
});

test('nginx - content verification gzip response matches original file', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const originalPath = path.join(siteDir, 'html', 'index.html');

    const response = await makeRequest('/', {'Accept-Encoding': 'gzip'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'gzip');

    // Decompress response and compare with original
    const decompressed = await gunzip(response.rawBody);
    const original = fs.readFileSync(originalPath);

    t.deepEqual(decompressed, original, 'Decompressed gzip response should match original file');
});

test('nginx - content verification uncompressed response matches original file', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const originalPath = path.join(siteDir, 'html', 'index.html');

    const response = await makeRequest('/');

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], undefined);

    // Compare directly with original
    const original = fs.readFileSync(originalPath, 'utf8');

    t.is(response.body, original, 'Uncompressed response should match original file');
});

test('nginx - content verification CSS brotli response matches original', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const [filename, info] = Object.entries(buildCss)[0];

    const originalPath = path.join(siteDir, 'css', filename);

    const response = await makeRequest(info.metadata.url, {'Accept-Encoding': 'br'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br');

    const decompressed = await brotliDecompress(response.rawBody);
    const original = fs.readFileSync(originalPath);

    t.deepEqual(decompressed, original, 'CSS brotli response should match original');
});

test('nginx - content verification brotli HTTP response matches disk .br file exactly', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const brotliDir = path.join(siteDir, 'brotli');

    const response = await makeRequest('/', {'Accept-Encoding': 'br'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br');

    // Read the actual brotli file from disk
    const diskContent = fs.readFileSync(path.join(brotliDir, 'index.html.br'));

    // Compare raw bytes - HTTP response should match disk file exactly
    t.deepEqual(response.rawBody, diskContent, 'HTTP brotli response raw bytes should match disk .br file exactly');
});

test('nginx - content verification gzip HTTP response matches disk .gz file exactly', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const gzipDir = path.join(siteDir, 'gzip');

    const response = await makeRequest('/', {'Accept-Encoding': 'gzip'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'gzip');

    // Read the actual gzip file from disk
    const diskContent = fs.readFileSync(path.join(gzipDir, 'index.html.gz'));

    // Compare raw bytes - HTTP response should match disk file exactly
    t.deepEqual(response.rawBody, diskContent, 'HTTP gzip response raw bytes should match disk .gz file exactly');
});

test('nginx - content verification CSS brotli HTTP response matches disk .br file exactly', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const brotliDir = path.join(siteDir, 'brotli');
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const [filename, info] = Object.entries(buildCss)[0];

    const response = await makeRequest(info.metadata.url, {'Accept-Encoding': 'br'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'br');

    // Read the actual brotli file from disk
    const diskContent = fs.readFileSync(path.join(brotliDir, `${filename}.br`));

    // Compare raw bytes
    t.deepEqual(response.rawBody, diskContent, `CSS brotli HTTP response should match disk ${filename}.br exactly`);
});

test('nginx - content verification SVG gzip HTTP response matches disk .gz file exactly', async (t) => {
    const siteDir = path.join(process.cwd(), 'site');
    const gzipDir = path.join(siteDir, 'gzip');
    const buildImages = JSON.parse(fs.readFileSync('.build/build-images.json', 'utf8'));
    const svgFiles = Object.entries(buildImages).filter(([, info]) => info.metadata.format === 'svg');

    t.true(svgFiles.length > 0, 'Should have SVG files');

    const [filename, info] = svgFiles[0];
    const response = await makeRequest(info.metadata.url, {'Accept-Encoding': 'gzip'});

    t.is(response.statusCode, 200);
    t.is(response.headers['content-encoding'], 'gzip');

    // Remove svg/ prefix for compressed files since they're stored flat
    const compressedFilename = filename.replace('svg/', '');
    const diskContent = fs.readFileSync(path.join(gzipDir, `${compressedFilename}.gz`));

    // Compare raw bytes
    t.deepEqual(
        response.rawBody,
        diskContent,
        `SVG gzip HTTP response should match disk ${compressedFilename}.gz exactly`,
    );
});

// ============================================================================
// SECTION 6: Security Tests
// ============================================================================

test('nginx - security direct access to .br files returns 404', async (t) => {
    const response = await makeRequest('/index.html.br');

    t.is(response.statusCode, 404, 'Direct access to .br files should be blocked');
});

test('nginx - security direct access to .gz files returns 404', async (t) => {
    const response = await makeRequest('/index.html.gz');

    t.is(response.statusCode, 404, 'Direct access to .gz files should be blocked');
});

test('nginx - security direct access to /brotli/ directory returns 404', async (t) => {
    const response = await makeRequest('/brotli/');

    t.is(response.statusCode, 404, 'Direct access to /brotli/ directory should be blocked');
});

test('nginx - security direct access to /brotli/file.br returns 404', async (t) => {
    const response = await makeRequest('/brotli/index.html.br');

    t.is(response.statusCode, 404, 'Direct access to files in /brotli/ should be blocked');
});

test('nginx - security direct access to /gzip/ directory returns 404', async (t) => {
    const response = await makeRequest('/gzip/');

    t.is(response.statusCode, 404, 'Direct access to /gzip/ directory should be blocked');
});

test('nginx - security direct access to /gzip/file.gz returns 404', async (t) => {
    const response = await makeRequest('/gzip/index.html.gz');

    t.is(response.statusCode, 404, 'Direct access to files in /gzip/ should be blocked');
});

test('nginx - security X-Frame-Options header is present', async (t) => {
    const response = await makeRequest('/');

    t.is(response.statusCode, 200);
    t.is(response.headers['x-frame-options'], 'SAMEORIGIN', 'Should have X-Frame-Options header');
});

test('nginx - security X-Content-Type-Options header is present', async (t) => {
    const response = await makeRequest('/');

    t.is(response.statusCode, 200);
    t.is(response.headers['x-content-type-options'], 'nosniff', 'Should have X-Content-Type-Options header');
});

test('nginx - security Referrer-Policy header is present', async (t) => {
    const response = await makeRequest('/');

    t.is(response.statusCode, 200);
    t.true(response.headers['referrer-policy'] !== undefined, 'Should have Referrer-Policy header');
});

// ============================================================================
// SECTION 7: Cache Headers Tests
// ============================================================================

test('nginx - cache headers static assets have Cache-Control', async (t) => {
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const firstCss = Object.values(buildCss)[0];

    const response = await makeRequest(firstCss.metadata.url);

    t.is(response.statusCode, 200);
    t.true(response.headers['cache-control'] !== undefined, 'Should have Cache-Control header');
    t.true(response.headers['cache-control'].includes('public'), 'Should have public cache control');
});

test('nginx - cache headers static assets have Expires header', async (t) => {
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const firstCss = Object.values(buildCss)[0];

    const response = await makeRequest(firstCss.metadata.url);

    t.is(response.statusCode, 200);
    t.true(response.headers.expires !== undefined, 'Should have Expires header');
});

test('nginx - cache headers immutable directive is present', async (t) => {
    const buildCss = JSON.parse(fs.readFileSync('.build/build-css.json', 'utf8'));
    const firstCss = Object.values(buildCss)[0];

    const response = await makeRequest(firstCss.metadata.url);

    t.is(response.statusCode, 200);
    t.true(response.headers['cache-control'].includes('immutable'), 'Should have immutable directive');
});

// ============================================================================
// SECTION 8: Error Handling Tests
// ============================================================================

test('nginx - error handling non-existent URLs return 404', async (t) => {
    const response = await makeRequest('/non-existent-page-12345');

    t.is(response.statusCode, 404, 'Should return 404 for non-existent pages');
});

test('nginx - error handling nested non-existent URLs return 404', async (t) => {
    const response = await makeRequest('/free/non-existent-subpage-67890');

    t.is(response.statusCode, 404, 'Should return 404 for non-existent subpages');
});

test('nginx - error handling trailing slash redirects work', async (t) => {
    const response = await makeRequest('/free/');

    // Should either serve content or redirect
    t.true(
        response.statusCode === 200 || response.statusCode === 301 || response.statusCode === 302,
        'Should handle trailing slash appropriately',
    );

    if (response.statusCode === 301 || response.statusCode === 302) {
        t.true(
            response.headers.location === '/free' || response.headers.location === 'http://localhost:8080/free',
            'Should redirect to URL without trailing slash',
        );
    }
});
