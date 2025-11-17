/**
 * Consolidated nginx configuration tests
 * Tests URL mapping, compression logic, and config structure
 * without requiring an HTTP server
 */

const fs = require('fs');
const path = require('path');
const test = require('ava');
const nunjucks = require('nunjucks');
const { TestDir } = require('./test-dir');

/**
 * Helper to create test sitemap data
 */
function createTestSitemap(pages) {
    return {
        pages,
        sitemap: Object.keys(pages),
        urlMapping: new Map(),
        md2url: {},
        url2md: {},
    };
}

/**
 * Helper to generate nginx config from template
 */
function generateNginxConfig(testDir) {
    const env = nunjucks.configure(path.join(process.cwd(), 'config'), {
        autoescape: false,
        trimBlocks: true,
        lstripBlocks: true,
    });

    const templatePath = path.join(process.cwd(), 'config', 'config-nginx.njk');
    const template = fs.readFileSync(templatePath, 'utf8');
    const rendered = env.renderString(template, {ROOT: testDir});

    return rendered;
}

/**
 * Helper to convert URL to flat filename (matches nginx map logic)
 */
function urlToFilename(url) {
    if (url === '/') {
        return 'index';
    }

    // Remove leading slash and replace remaining slashes with underscores
    return url.substring(1).replace(/\//g, '_');
}

// ============================================================================
// URL Mapping Tests
// ============================================================================

test('urlToFilename() - converts root URL correctly', (t) => {
    t.is(urlToFilename('/'), 'index');
});

test('urlToFilename() - converts simple URLs correctly', (t) => {
    t.is(urlToFilename('/free'), 'free');
    t.is(urlToFilename('/dreamer'), 'dreamer');
    t.is(urlToFilename('/passion'), 'passion');
});

test('urlToFilename() - converts nested URLs to flat structure', (t) => {
    t.is(urlToFilename('/free/12v'), 'free_12v');
    t.is(urlToFilename('/free/models'), 'free_models');
    t.is(urlToFilename('/common/firmware/update/paid'), 'common_firmware_update_paid');
});

test('urlToFilename() - handles complex nested URLs', (t) => {
    t.is(urlToFilename('/common/tweaks/settings'), 'common_tweaks_settings');
    t.is(urlToFilename('/common/software/setup-nxp'), 'common_software_setup-nxp');
    t.is(urlToFilename('/docs/api/v1/endpoints/users'), 'docs_api_v1_endpoints_users');
});

// ============================================================================
// Config Generation Tests
// ============================================================================

test('nginx config() - file is generated successfully', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const siteDir = path.join(testDir, 'site');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(siteDir, { recursive: true });

    const config = generateNginxConfig(testDir);

    t.truthy(config);
    t.true(config.length > 0);
    t.true(config.includes('worker_processes'));
    t.true(config.includes('server {'));
});

test('nginx config() - contains compression mapping', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check compression directory mapping
    t.true(config.includes('map $http_accept_encoding $compression_dir'));
    t.true(config.includes('"~*\\bbr\\b"'));
    t.true(config.includes('"brotli/"'));
    t.true(config.includes('"~*\\bgzip\\b"'));
    t.true(config.includes('"gzip/"'));
});

test('nginx config() - contains compression suffix mapping', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check compression suffix mapping
    t.true(config.includes('map $compression_dir $compression_suffix'));
    t.true(config.includes('".br"'));
    t.true(config.includes('".gz"'));
});

test('nginx config() - contains content encoding mapping', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check content encoding header mapping
    t.true(config.includes('map $compression_dir $content_encoding'));
    t.true(config.includes('"br"'));
    t.true(config.includes('"gzip"'));
});

test('nginx config() - contains flat HTML mapping', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check URL to flat filename mapping
    t.true(config.includes('map $uri $flat_html'));
    t.true(config.includes('"~^/$"'));
    t.true(config.includes('"index.html"'));
    t.true(config.includes('"~^/([^/]+)$"'));
    t.true(config.includes('"$1.html"'));
    t.true(config.includes('"~^/([^/]+)/([^/]+)$"'));
    t.true(config.includes('"$1_$2.html"'));
});

// ============================================================================
// Config Structure Tests
// ============================================================================

test('nginx config() - has correct server block structure', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    t.true(config.includes('server {'));
    t.true(config.includes('listen 8080;'));
    t.true(config.includes('server_name localhost;'));
    t.true(config.includes(`root ${testDir}/site;`));
    t.true(config.includes('index index.html;'));
});

test('nginx config() - blocks compression directories', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check that direct access to compression directories is blocked
    t.true(config.includes('location ~ ^/(brotli|gzip|zstd)'));
    t.true(config.includes('return 404;'));
});

test('nginx config() - removes trailing slashes', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check trailing slash removal
    t.true(config.includes('location ~ ^(.+)/$ {'));
    t.true(config.includes('return 301 $1;'));
});

test('nginx config() - has error page directive', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    t.true(config.includes('error_page 404 /404.html;'));
});

// ============================================================================
// Compression Logic Tests
// ============================================================================

test('nginx config() - has compression logic for CSS files', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check CSS location block
    t.true(config.includes('location ~* \\.css$'));
    t.true(config.includes('default_type text/css;'));
    t.true(config.includes('set $file_path'));
    t.true(config.includes('set $encoding_header'));
});

test('nginx config() - has compression logic for JS files', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check JS location block
    t.true(config.includes('location ~* \\.js$'));
    t.true(config.includes('default_type application/javascript;'));
});

test('nginx config() - has compression logic for SVG files', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check SVG location block
    t.true(config.includes('location ~* \\.svg$'));
    t.true(config.includes('default_type image/svg+xml;'));
});

test('nginx config() - has compression logic for HTML pages', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check HTML location block
    t.true(config.includes('location / {'));
    t.true(config.includes('default_type text/html'));
    t.true(config.includes('$flat_html'));
});

test('nginx config() - checks for compressed file existence', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check that config tests for compressed file existence
    t.true(config.includes('if (-f "$document_root/$check_file")'));
    t.true(config.includes('set $check_file "${compression_dir}${target_file}${compression_suffix}"'));
    t.true(config.includes('set $file_path "/$check_file"'));
});

test('nginx config() - falls back to uncompressed files', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check fallback logic
    t.true(config.includes('if ($file_path = "")'));
    t.true(config.includes('rewrite ^ $file_path break;'));
});

// ============================================================================
// Header Tests
// ============================================================================

test('nginx config() - sets cache control headers', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    t.true(config.includes('add_header Cache-Control $cache_control;'));
    t.true(config.includes('expires $expires_time;'));
});

test('nginx config() - sets vary header for compression', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    t.true(config.includes('add_header Vary "Accept-Encoding" always;'));
});

test('nginx config() - sets content encoding header', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    t.true(config.includes('add_header Content-Encoding $encoding_header always;'));
});

test('nginx config() - sets security headers for HTML', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check security headers in HTML location block
    t.true(config.includes('add_header X-Frame-Options "SAMEORIGIN" always;'));
    t.true(config.includes('add_header X-Content-Type-Options "nosniff" always;'));
    t.true(config.includes('add_header Referrer-Policy "strict-origin-when-cross-origin" always;'));
});

// ============================================================================
// Static Files Tests
// ============================================================================

test('nginx config() - handles non-compressible files', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check location block for images and binary files
    t.true(config.includes('location ~* \\.(jpg|jpeg|png|gif|ico|pdf|zip)$'));
    t.true(config.includes('try_files $uri =404;'));
});

test('nginx config() - has cache control mapping for static files', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check hashed static file detection
    t.true(config.includes('map $uri $is_hashed_static'));
    t.true(config.includes('~*\\.(css|js|svg|jpg|jpeg|png|gif|ico)$'));
});

test('nginx config() - has different cache times for hashed vs non-hashed', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check expires time mapping
    t.true(config.includes('map $is_hashed_static $expires_time'));
    t.true(config.includes('0   1h;'));
    t.true(config.includes('1   10y;'));
});

test('nginx config() - has immutable cache for hashed assets', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check cache control mapping
    t.true(config.includes('map $is_hashed_static $cache_control'));
    t.true(config.includes('0   "public, no-cache";'));
    t.true(config.includes('1   "public, immutable";'));
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

test('nginx config() - handles deeply nested URLs', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const config = generateNginxConfig(testDir);

    // Check that config supports up to 5 levels of nesting
    t.true(config.includes('"~^/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)$"'));
    t.true(config.includes('"$1_$2_$3_$4_$5.html"'));
});

test('urlToFilename() - handles URLs with hyphens', (t) => {
    t.is(urlToFilename('/setup-nxp'), 'setup-nxp');
    t.is(urlToFilename('/common/software/setup-nxp'), 'common_software_setup-nxp');
});

test('urlToFilename() - handles URLs with numbers', (t) => {
    t.is(urlToFilename('/free/12v'), 'free_12v');
    t.is(urlToFilename('/api/v1'), 'api_v1');
    t.is(urlToFilename('/docs/api/v1/endpoints'), 'docs_api_v1_endpoints');
});

// ============================================================================
// Integration Tests
// ============================================================================

test('nginx config() - generation with real project structure', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');
    const siteDir = path.join(testDir, 'site');

    fs.mkdirSync(buildDir, { recursive: true });
    fs.mkdirSync(siteDir, { recursive: true });

    // Create test sitemap
    const sitemap = createTestSitemap({
        '/': { file: 'index.md', url: '/', title: 'Home' },
        '/free': { file: 'free/index.md', url: '/free', title: 'Free' },
        '/free/models': { file: 'free/models.md', url: '/free/models', title: 'Models' },
        '/common/firmware/update/paid': {
            file: 'common/firmware_update_paid.md',
            url: '/common/firmware/update/paid',
            title: 'Paid Update',
        },
    });

    fs.writeFileSync(
        path.join(buildDir, 'sitemap.json'),
        JSON.stringify(sitemap),
    );

    const config = generateNginxConfig(testDir);

    // Verify config is valid and complete
    t.truthy(config);
    t.true(config.includes('server {'));
    t.true(config.includes(`root ${testDir}/site;`));
    t.true(config.includes('map $http_accept_encoding $compression_dir'));
    t.true(config.includes('map $uri $flat_html'));
    t.true(config.includes('location / {'));
});

test('nginx config() - can be written to file', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');

    fs.mkdirSync(buildDir, { recursive: true });

    const config = generateNginxConfig(testDir);
    const outputPath = path.join(buildDir, 'nginx.conf');

    fs.writeFileSync(outputPath, config, 'utf8');

    t.true(fs.existsSync(outputPath));

    const writtenConfig = fs.readFileSync(outputPath, 'utf8');

    t.is(writtenConfig, config);
    t.true(writtenConfig.length > 0);
});
