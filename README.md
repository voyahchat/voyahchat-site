# VoyahChat Site

Static site generator for VoyahChat documentation using a custom build system with hierarchical navigation and advanced heading anchor system.

## Quick Start

```bash
npm run setup    # Initial project setup
npm run build    # Full build pipeline
npm start        # Build and serve on localhost:8080
npm stop         # Stop nginx server
npm test         # Run test suite
npm run benchmark # Performance benchmarking
```

## Architecture

- Custom navigation with hierarchical URLs and section filtering
- Hash-based CSS/JS for cache busting
- External repositories for modular content and layout blocks
- Modular NPM build system with parallel execution
- Template optimization before HTML generation
- Pre-compressed gzip, brotli, and zstd files for production

## Build Pipeline

Build flow: Source → .build/ → site/

1. `clean` - Remove .build/ and site/ directories
2. `build:css` - Generate hashed CSS from blocks/
3. `build:js` - Minify JavaScript
4. `build:nav` - Generate navigation from config/sitemap.yml
5. `build:images` - Copy images to site/
6. `build:assets` - Copy assets (zip/pdf) to site/
7. `build:templates` - Optimize Nunjucks templates to .build/templates/
8. `build:html` - Build HTML content to site/
9. `build:compression` - Compress assets in site/

### Template Optimization

The `build:templates` step optimizes Nunjucks templates before HTML generation:

#### Optimization Techniques
- Removes Nunjucks comments (`{# comment #}`)
- Removes unnecessary quotes from HTML attributes (e.g., `class="value"` → `class=value`)
- Removes optional closing tags (`</li>`, `</p>`, `</tbody>`, etc.)
- Removes whitespace between HTML and Nunjucks tags

#### Performance Benefits
- Zero runtime cost (optimization happens at build time)
- Maintains valid HTML5 markup
- Preserves template functionality and syntax

#### Output
- Optimized templates stored in `.build/templates/`
- Statistics saved to `.build/build-templates.json`
- Original source templates remain unchanged

#### Technical Details
- Uses Nunjucks parser to validate optimized templates
- Implements HTML5 optional tag rules
- Follows HTML5 attribute quoting specifications
- Handles Nunjucks expressions safely during optimization

## Directory Structure

- `.build/` - Intermediate build artifacts (not deployed)
- `site/` - Final deployable artifacts for HTTP serving

## Configuration

Core configuration files:
- `config/levels.js` - BEM level definitions and source directories
- `config/sitemap.yml` - Site structure and navigation hierarchy
- `config/external.json` - External Git repositories
- `config/config-nginx.conf` - Nginx server configuration template

## Project Structure

```
├── blocks/                      # Local BEM blocks
│   ├── app-icon/                # Application icon
│   ├── app-screenshot/          # Application screenshots
│   ├── article/                 # Article content styling and scripts
│   ├── aside/                   # Sidebar (ads)
│   ├── footer/                  # Page footer
│   ├── header/                  # Page header with breadcrumbs
│   │   └── __toggle/            # Header toggle button
│   ├── link-nav/                # Navigation links
│   ├── logo/                    # Site logo
│   ├── menu/                    # Navigation menu
│   ├── nav-index/               # Index page navigation
│   ├── page/                    # Base page layout
│   ├── page-index/              # Index page specific layout
│   ├── root/                    # Root styling
│   ├── root-index/              # Index page root styling
│   ├── table/                   # Table styling
│   ├── text-with-icon/          # Text with icon component
│   └── video/                   # Youtube video embedding
├── config/                      # Build configuration files
│   ├── config-ava.js            # AVA test framework configuration
│   ├── config-eslint.js         # ESLint configuration
│   ├── config-markdown.js       # Markdown processing configuration
│   ├── config-minify-html.js    # HTML minification settings
│   ├── config-minify-js.js      # JavaScript minification settings
│   ├── config-nginx.njk         # Nginx server configuration template
│   ├── config-postcss.js        # PostCSS configuration with BEM levels
│   ├── external.json            # External Git repositories list
│   ├── levels.json              # BEM levels configuration
│   └── sitemap.yml              # Site structure and navigation definition
├── external/                    # External repositories (cloned during setup)
│   ├── adaptive-layout/         # Layout system blocks
│   ├── voyahchat-content/       # Main documentation content
│   ├── voyahchat-docs/          # Additional documentation
│   └── voyahchat-install/       # Installation files and assets
├── lib/                         # Core build utilities and tests
│   ├── build/                   # Build step scripts
│   │   ├── build-assets.js      # Asset copying and processing
│   │   ├── build-compression.js # Gzip/brotli/zstd compression
│   │   ├── build-css.js         # CSS processing and hashing
│   │   ├── build-html.js        # HTML site generation
│   │   ├── build-images.js      # Image copying and hashing
│   │   ├── build-js.js          # JavaScript processing and minification
│   │   ├── build-nav.js         # Navigation and sitemap.xml generation
│   │   ├── build-nginx.js       # Nginx configuration generation
│   │   ├── build-templates.js   # Nunjucks template optimization
│   │   ├── constants.js         # Build constants and paths
│   │   ├── dir.js               # Directory utilities
│   │   ├── hash.js              # File hashing utilities
│   │   ├── setup.js             # Project setup script
│   │   └── stats.js             # Build statistics utilities
│   └── test/                    # Test files
│       ├── build-assets.test.js # Asset build tests
│       ├── build-css.test.js    # CSS build tests
│       ├── build-html.test.js   # HTML build tests
│       ├── build-images.test.js # Image build tests
│       ├── build-js.test.js     # JavaScript build tests
│       ├── build-nav.test.js    # Navigation build tests
│       ├── hash.test.js         # Hash utilities tests
│       ├── integrity.test.js    # Build integrity tests
│       ├── markdown-*.test.js   # Markdown processing tests
│       ├── nginx-*.test.js      # Nginx configuration tests
│       ├── stats.test.js        # Statistics tests
│       ├── utils.js             # Test utilities
│       └── utils.test.js        # Test utilities tests
├── site/                        # Generated static site (output)
├── .assets/                     # Assets files (generated before build)
├── .build/                      # Temporary build files (removed each build)
├── .husky/                      # Git hooks configuration
├── AGENTS.md                    # Project development rules
└── README.md                    # Project documentation
```

## Static Asset Naming Convention

### Hash-Prefixed Files
- CSS files: `_c{hash}` (e.g., `_c9008915a30a21706`)
- JS files: `_j{hash}` (e.g., `_j904685a5dab014e8`)
- Images: `_i{hash}` (e.g., `_i0e5f33c7435efacf`)

### Image Format Priority
When requesting `_i{hash}`, server serves best available format:
1. AVIF (if available and browser supports)
2. WebP (if available and browser supports)
3. PNG/JPG (fallback to original format)

### Compression
CSS, JS and SVG files are automatically compressed:
- Zstd (if better than brotli and browser supports)
- Brotli (if available and browser supports)
- Gzip (if available and browser supports)

Server selects best compression based on Accept-Encoding header.

### File Structure
```
site/
├── _c{hash}              # CSS files (no extension)
├── _j{hash}              # JS files (no extension)
├── _i{hash}              # Image references (rewrite target)
├── {hash}.png/jpg/svg    # Original images
├── avif/
│   └── {hash}.avif       # AVIF versions (if smaller than WEBP)
├── webp/
│   └── {hash}.webp       # WebP versions (if smaller than original)
├── brotli/
│   ├── _c{hash}.br       # Compressed CSS
│   ├── _j{hash}.br       # Compressed JS
│   └── *.html.br         # Compressed HTML
├── gzip/
│   ├── _c{hash}.gz
│   ├── _j{hash}.gz
│   └── *.html.gz
└── zstd/
    ├── _c{hash}.zst
    ├── _j{hash}.zst
    └── *.html.zst
```

## Development

### Setup

```bash
npm run setup    # Clone external repos, install dependencies
```

### Development Workflow

```bash
npm start         # Build and serve on localhost:8080
npm test          # Run test suite
npm run lint      # Run ESLint (must pass before commits)
npm run benchmark # Performance benchmarking
```

### Code Style

Follow ESLint recommended configuration with 4-space indentation. End files with a single empty line. Run `npm run lint` before commits. Never use `eslint-disable`.

## Testing

The project uses AVA test framework with comprehensive test coverage across all build components. Tests are located in `lib/test/` with `.test.js` extension and support concurrent execution.

### Test Types

**Unit Tests:**
- Use `TestDir` for complete isolation
- Create temporary directories in `.test/`
- Never write to `site/` or `.build/`
- Example: `build-css.test.js`, `build-js.test.js`

**Integration Tests:**
- May READ from `site/` and `.build/` directories
- Must NOT write to production directories
- Use `TestDir` for temporary files
- Example: `build-html-integration.test.js`

### Running Tests

```bash
# Run all tests
npm test

# Run tests concurrently (faster execution)
npm test -- --concurrency=4

# Run specific test file
npm test -- build-css.test.js

# Run tests in watch mode
npm test -- --watch

# Run specific tests by pattern
npm test -- --match="*CSS*"
```

### Test Structure and Organization

Tests are organized by build component and functionality:

**Build Component Tests:**
- `build-assets-unit.test.js` - Asset builder unit tests (23 tests)
- `build-assets-integration.test.js` - Asset builder integration tests (9 tests)
- `build-compression.test.js` - Compression builder tests (18 tests)
- `build-css.test.js` - CSS generation and hashing tests (15 tests)
- `build-html-unit.test.js` - HTML builder unit tests
- `build-html-integration.test.js` - HTML builder integration tests (8 tests)
- `build-html-helpers.test.js` - HTML helper function tests
- `build-images.test.js` - Image processing tests (30 tests)
- `build-js.test.js` - JavaScript minification tests (15 tests)
- `build-sitemap.test.js` - Navigation and sitemap generation tests (50+ tests)
- `build-templates-unit.test.js` - Template optimizer unit tests
- `build-templates-integration.test.js` - Template optimizer integration tests (1 test)
- `build-templates-pipeline.test.js` - Template build pipeline tests (5 tests)

**Markdown Processing Tests:**
- `markdown.test.js` - Core markdown rendering tests (50+ tests)
- `markdown-elements.test.js` - Markdown element rendering tests (18 tests)
- `markdown-links.test.js` - Link transformation tests (25 tests)
- `markdown-minification.test.js` - HTML minification tests (6 tests)
- `markdown-image-replacement.test.js` - Image path replacement tests (5 tests)

**Build Pipeline Tests:**
- `build-pipeline.test.js` - Full pipeline integration tests (21 tests)
- `build-utils.test.js` - Build utility function tests (20 tests)

**Infrastructure Tests:**
- `dir.test.js` - Directory utility tests (15 tests)
- `test-dir.test.js` - TestDir isolation tests (17 tests)
- `utils.test.js` - Test utility tests (30 tests)
- `hash.test.js` - File hashing tests (4 tests)
- `stats.test.js` - Build statistics validation tests (20 tests)
- `setup.test.js` - Project setup tests

**Integration & Quality Tests:**
- `integrity.test.js` - Link integrity and HTML quality tests (5 tests)
- `nginx-config.test.js` - Nginx configuration generation tests
- `nginx-integrity.test.js` - Nginx server integration tests (60+ tests)
- `w3c-validation.test.js` - W3C HTML validation tests

**Test Helpers:**
- `utils.js` - Shared test utilities and factory functions
- `test-dir.js` - TestDir class for test isolation
- `console-interceptor.js` - Console output capture utility
- `w3c-validator.js` - W3C HTML validation wrapper
- `minification-benchmark.js` - Performance benchmarking utility

### Test Isolation Architecture

All tests use the **TestDir** pattern for complete isolation:

- **TestDir Class**: Creates isolated test directories in `.test/`
- **Dependency Injection**: Builders accept optional `dir` parameter
- **No Global State**: Tests never mutate `Dir.getRoot`, `Dir.getBuild`, `Dir.getSite`
- **Parallel Safe**: Tests can run concurrently without race conditions

**STRICT RULES:**
- Unit tests MUST NOT write to `site/` or `.build/` directories
- Integration tests MAY READ from production but MUST write to TestDir
- `site/` directory is sacred - contains production build artifacts

### Test Coverage

**Current test coverage: 500+ passing tests across 34 test files**

Coverage includes:
- **Build Pipeline:** CSS, JS, HTML, images, assets, compression, templates
- **Navigation:** Sitemap generation, hierarchical URLs, heading extraction
- **Markdown Processing:** Rendering, typography, link transformation, image replacement, minification
- **Infrastructure:** Directory utilities, test isolation, file operations
- **Integration:** Full pipeline tests, nginx server tests, W3C validation
- **Quality Assurance:** Link integrity, HTML quality, build statistics validation
- **Error Handling:** Edge cases, file system errors, corrupted data, permission issues
- **Performance:** Compression ratios, caching, concurrent operations

### Testing Style Guide

This section provides comprehensive guidelines for writing high-quality tests in this project.

#### Test Naming Convention

Use descriptive names that clearly state what is being tested and the expected outcome:

**Format:**
- For class methods: `ClassName.method() - should do X when Y`
- For functions: `functionName() - should do X when Y`
- For integration: `Feature - should do X when Y`

**Examples:**
```javascript
test('CSSBuilder.build() - should generate hashed CSS files', async (t) => {
    // Test implementation
});

test('getSitemap() - should return cached data when available', async (t) => {
    // Test implementation
});

test('Markdown rendering - should transform relative links to absolute', async (t) => {
    // Test implementation
});
```

**Rationale:** Clear test names serve as documentation and make test failures immediately understandable.

#### Test Structure (AAA Pattern)

Organize tests using the Arrange-Act-Assert pattern:

**Good:**
```javascript
test('CSSBuilder.generateHash() - should create consistent hash', (t) => {
    // Arrange
    const css = '.test { color: red; }';

    // Act
    const hash = CSSBuilder.generateHash(css);
    const hash2 = CSSBuilder.generateHash(css);

    // Assert
    t.is(hash.length, 16);
    t.is(hash, hash2);
});
```

**Bad:**
```javascript
test('hash test', (t) => {
    const hash = CSSBuilder.generateHash('.test { color: red; }');
    t.is(hash.length, 16);
    const hash2 = CSSBuilder.generateHash('.test { color: red; }');
    t.is(hash, hash2);
});
```

**Rationale:** AAA pattern makes tests readable and maintainable by clearly separating setup, execution, and verification.

#### Test Setup/Teardown

Always use TestDir for test isolation. TestDir handles cleanup automatically:

**Good:**
```javascript
const { TestDir } = require('./test-dir');

test.beforeEach(async (t) => {
    t.context.dir = new TestDir();
    // Setup test environment using t.context.dir
});

test.afterEach.always(async (t) => {
    // Restore mocked functions if needed
    if (t.context.originalGetBuild) {
        Dir.getBuild = t.context.originalGetBuild;
    }
    // TestDir cleanup is automatic - no manual cleanup needed
});
```

**Bad:**
```javascript
// Using try/finally in each test
test('some test', async (t) => {
    const dir = new TestDir();
    try {
        // Test code
    } finally {
        // Manual cleanup - unnecessary with TestDir
        await fs.rm(dir.getRoot(), { recursive: true, force: true });
    }
});

// Global afterEach at end of file
test.afterEach(async () => {
    // Cleanup - not isolated per test
});
```

**Rationale:** TestDir ensures proper isolation and automatic cleanup even when tests fail, preventing test pollution.

#### When to Use test.serial

Use test.serial ONLY when:
- Test modifies global state that cannot be isolated
- Test requires exclusive access to a resource
- Test has side effects that affect other tests

Do NOT use test.serial when:
- Test uses TestDir (already isolated)
- Test has proper beforeEach/afterEach cleanup
- Test only reads data

**When serial is needed:**
```javascript
test.serial('modifies global config', async (t) => {
    // Modifies process.env or other global state
    process.env.NODE_ENV = 'test';
    // Test code
});
```

**When serial is NOT needed:**
```javascript
test('processes image', async (t) => {
    const dir = new TestDir(); // Isolated directory
    // Test code - runs in parallel safely
});
```

**Rationale:** Parallel test execution is faster. Only serialize when absolutely necessary.

#### Assertion Style

Use strict, specific assertions that clearly express intent:

**Good:**
```javascript
// Strict equality
t.is(result, expected);

// Type checking with value
t.true(typeof value === 'string');
t.true(Array.isArray(items));

// Specific error matching
await t.throwsAsync(
    async () => await someFunction(),
    { message: /specific error pattern/ }
);

// Deep equality for objects
t.deepEqual(actual, expected);
```

**Bad:**
```javascript
// Loose assertions
t.truthy(result); // Too vague
t.true(result == expected); // Use t.is instead

// Generic error checking
await t.throwsAsync(async () => await someFunction()); // No error validation

// Comparing stringified objects
t.is(JSON.stringify(actual), JSON.stringify(expected)); // Use t.deepEqual
```

**Rationale:** Specific assertions provide better error messages and catch more bugs.

#### Mock Data and Factories

Use realistic mock data and factory functions for consistency:

**Good:**
```javascript
const { createMockSitemap, setupTestEnvironment } = require('./utils');

test('processes sitemap', async (t) => {
    // Use factory with realistic data
    const sitemap = createMockSitemap({
        pages: [
            { url: '/', title: 'Home', file: 'index.md' },
            { url: '/about', title: 'About', file: 'about.md' }
        ]
    });

    // Test with realistic data
    const result = processSitemap(sitemap);
    t.is(result.length, 2);
});
```

**Bad:**
```javascript
test('processes sitemap', async (t) => {
    // Inline mock with minimal data
    const sitemap = { pages: { '/': {} } };

    // Test with unrealistic data
    const result = processSitemap(sitemap);
    t.truthy(result);
});
```

**Rationale:** Factory functions ensure consistency across tests and realistic data catches edge cases.

#### Error Testing

Test both synchronous and asynchronous errors appropriately:

**Synchronous errors:**
```javascript
test('validateInput() - should throw on invalid input', (t) => {
    const error = t.throws(() => {
        validateInput(null);
    });

    t.is(error.message, 'Input cannot be null');
});
```

**Asynchronous errors:**
```javascript
test('fetchData() - should reject on network error', async (t) => {
    await t.throwsAsync(
        async () => await fetchData('invalid-url'),
        { message: /network error/i }
    );
});
```

**Error recovery:**
```javascript
test('processFile() - should handle missing files gracefully', async (t) => {
    // Mock console.warn to suppress expected warnings
    t.context.originalConsoleWarn = console.warn;
    console.warn = () => {};

    const result = await processFile('nonexistent.txt');

    t.is(result, null); // Should return null, not throw
});
```

**Rationale:** Proper error testing ensures robust error handling and prevents unexpected failures.

#### Test Isolation

Ensure complete test independence:

**Principles:**
1. Each test must run successfully in isolation
2. Tests must not depend on execution order
3. Tests must not share state
4. Each test must use TestDir for unique directories

**Good:**
```javascript
const { TestDir } = require('./test-dir');

test.beforeEach(async (t) => {
    // Each test gets its own isolated directory
    t.context.dir = new TestDir();
    const buildDir = t.context.dir.getBuild();

    await fs.mkdir(buildDir, { recursive: true });
});

test('first test', async (t) => {
    // Uses t.context.dir - isolated
    await fs.writeFile(
        path.join(t.context.dir.getBuild(), 'test.json'),
        '{}'
    );
    t.pass();
});

test('second test', async (t) => {
    // Uses its own t.context.dir - independent
    const files = await fs.readdir(t.context.dir.getBuild());
    t.is(files.length, 0); // Clean directory
});
```

**Bad:**
```javascript
// Shared state between tests
let sharedData = {};

test('first test', (t) => {
    sharedData.value = 'test';
    t.pass();
});

test('second test', (t) => {
    // Depends on first test running first
    t.is(sharedData.value, 'test');
});
```

**Rationale:** Isolated tests are reliable, debuggable, and can run in parallel.

#### Mocking Best Practices

Mock external dependencies, restore after tests:

**Good:**
```javascript
test.beforeEach((t) => {
    // Store original
    t.context.originalGetBuild = Dir.getBuild;
});

test.afterEach.always((t) => {
    // Always restore
    if (t.context.originalGetBuild) {
        Dir.getBuild = t.context.originalGetBuild;
    }
});

test.serial('uses mocked directory', async (t) => {
    // Mock for this test
    Dir.getBuild = () => t.context.testDir;

    // Test code
    const result = await someFunction();
    t.truthy(result);
});
```

**Bad:**
```javascript
test.serial('uses mocked directory', async (t) => {
    // Mock without storing original
    Dir.getBuild = () => '/tmp/test';

    // Test code - but mock is never restored!
    const result = await someFunction();
    t.truthy(result);
});
```

**Rationale:** Proper mock management prevents test pollution and ensures cleanup.

#### Dependency Injection for Builders

All builder classes use Dependency Injection for the Dir class to enable test isolation:

**Builder Pattern:**
```javascript
class Builder {
    constructor(options = {}, dir = Dir) {
        this.options = options;
        this.dir = dir;  // Use injected or global Dir
    }
}
```

**Unit Test Pattern:**
```javascript
const { TestDir } = require('./test-dir');

test.beforeEach(async (t) => {
    // Create isolated TestDir instance for this test
    t.context.dir = new TestDir();
});

test('CSSBuilder - should process files', async (t) => {
    // Inject TestDir instance instead of using global Dir
    const builder = new CSSBuilder('bundle', t.context.dir);

    // Builder uses t.context.dir internally
    await builder.build();

    // No global mocking needed!
    // TestDir handles cleanup automatically
});
```

**Integration Test Pattern:**
```javascript
const { Dir } = require('../build/dir');
const { TestDir } = require('./test-dir');

test('Integration - reads from production', async (t) => {
    // Read from production (OK)
    const sitePath = path.join(Dir.getSite(), 'index.html');
    const content = await fs.readFile(sitePath, 'utf8');

    // Write temporary files to TestDir if needed
    const testDir = new TestDir();
    const tempPath = path.join(testDir.getRoot(), 'temp.html');
    await fs.writeFile(tempPath, processed);

    t.truthy(content);
});
```

**TestDir Class:**
- Located in `lib/test/test-dir.js`
- Creates isolated test directories in `.test/`
- Provides Dir-like interface: `getRoot()`, `getBuild()`, `getSite()`, etc.
- Automatically creates directories on first access
- Each test gets unique directory
- Handles automatic cleanup on test completion

**Test Utilities (`lib/test/utils.js`):**
- **File System:** `fileExists()`, `readJsonFile()`, `getAllFiles()`, `getFixturePath()`, `copyFixture()`
- **Test Helpers:** `createTestFile()`, `createTestContent()`, `createTestSitemap()`, `createTestBuilder()`, `cleanupTestDir()`
- **Validation:** `validateUnifiedFormat()`, `validateBuildArtifact()`, `validateHtml()`
- **Assertions:** `assertValidJson()`, `assertPositiveNumber()`, `assertArrayNotEmpty()`
- **Mock Factories:** `createMockSitemap()`, `createMockImageMapping()`, `createMockAssetsMapping()`, `createMockCssHash()`, `createMockJsHash()`
- **Environment Setup:** `setupTestEnvironment()` - creates complete test environment with all mock files
- **Data Loaders:** `getSitemap()`, `getImageMapping()`, `getAssetsMapping()` - test-aware versions

**Test Helpers:**
- **`test-dir.js`:** TestDir class for complete test isolation with automatic cleanup
- **`console-interceptor.js`:** Captures and validates console output during tests
- **`w3c-validator.js`:** W3C Nu Html Checker integration for HTML validation
- **`minification-benchmark.js`:** Performance benchmarking for minification operations

**Key Benefits:**
- No global state mutations required
- Automatic cleanup - no manual teardown needed
- Tests can run in parallel safely (concurrent execution)
- Cleaner, more maintainable test code
- Explicit dependencies
- Complete test isolation

**Rationale:** Dependency Injection eliminates global state dependencies and enables true test isolation with automatic cleanup.

#### ESLint Configuration

The project uses ESLint to enforce code quality:

**Unused Variables:**
- ESLint is configured to detect unused variables
- This prevents code quality issues
- Never use `eslint-disable` comments
- Fix unused variables instead of disabling the rule

**Example:**
```javascript
// Bad - unused variable
test('example', async (t) => {
    const unused = 'value';
    t.pass();
});

// Good - remove unused variable
test('example', async (t) => {
    t.pass();
});
```

**Rationale:** Clean code without unused variables is easier to maintain and understand.

### Test Utilities

Shared test utilities are available in `lib/test/utils.js`:

- `Dir.getTest()` - Get unique test directory for isolation
- `createMockSitemap()` - Create mock sitemap data
- `createMockImageMapping()` - Create mock image mapping
- `setupTestEnvironment()` - Setup complete test environment
- `validateHtml()` - Validate HTML content
- `assertValidJson()` - Assert valid JSON
- `fileExists()` - Check file existence

### Test Quality Standards

- All warnings in tests are treated as errors and must be fixed
- Tests must use strict assertions (t.is, t.deepEqual, not t.truthy)
- Tests must have clear, descriptive names
- Tests must be completely isolated and independent
- Tests must clean up after themselves
- No eslint-disable comments allowed

## Performance Benchmarking

```bash
npm run benchmark             # Full benchmark suite
npm run benchmark --nav       # Navigation generation only
npm run benchmark --html      # HTML generation only
npm run benchmark --css       # CSS generation only
npm run benchmark --compare   # Compare with previous results
```

Benchmark results are saved to `.build/benchmark-results.json` and include:
- Build duration for each component
- Memory usage statistics
- Performance recommendations
- Historical comparisons

## CI/CD Pipeline

The project includes a comprehensive CI/CD pipeline (`.github/workflows/ci.yml`) that:
- Runs tests on Node.js 22.x
- Performs linting and security audits
- Builds the project and uploads artifacts
- Deploys to production on main branch pushes
- Includes smoke tests for deployment validation

## Deployment

1. Run `npm run build`
2. Deploy the `site/` directory contents
3. Serve with a static web server

## sitemap.yml Format

Format: `Title [URL, file.md, { layout: 'path/to/layout'}]` (layout is optional)
- URL: Absolute (`/`) or relative to parent
- Path: Relative to `external/voyahchat-content/`
- Hierarchy: 2-space indentation

Example:
```yaml
sitemap:
  - VoyahChat [/, index.md]
  - Free [/free, free/index.md]
    - Models [models, free/models.md]
```

## Template & File Processing

- Use `page` object for current page data and `sitemap` for all other pages
- Only process markdown files listed in `config/sitemap.yml` by using collection filtering
- Markdown links must be relative paths (e.g., `../free/tyres.md#section`) for GitHub compatibility
- The build system converts relative markdown links to proper URLs in HTML output

## Build Statistics

All build scripts generate statistics files in `.build/` directory using a unified format for debugging and optimization.

### Statistics Format

```json
{
    "files": [
        {
            "source": "relative/path/to/source.ext",
            "size": 1234,
            "metadata": {
                // Script-specific metadata
            }
        }
    ],
    "metadata": {
        "generated": "2025-10-08T09:00:00.000Z"
    }
}
```

### Statistics Files

- `.build/build-css.json` - CSS files with hash and bundle info
- `.build/build-js.json` - JavaScript files with hash and bundle info
- `.build/build-assets.json` - Asset files (PDF, ZIP) with URLs and types
- `.build/build-images.json` - Image files with content hashes
- `.build/build-nav.json` - Navigation structure and sitemap.xml
- `.build/build-templates.json` - Optimized templates with size reduction stats
- `.build/build-compression.json` - Compressed files (gzip, brotli, and zstd)
- `.build/build-html.json` - Generated HTML files with URLs

Each file entry contains `source`, `size`, and script-specific `metadata`. Build-level metadata includes generation timestamp.
