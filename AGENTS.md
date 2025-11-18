# A MUST RULES
- Use English for code, comments and documentation
- Keep docs brief and technical (NO EMOJI)
- Use temporary files for complex script validation, not `node -c`

# Backward Compatibility & Build Artifacts
- DO NOT maintain backward compatibility - breaking changes are acceptable
- Missing build artifacts (sitemap.json, image-mapping.json, etc.) MUST cause build failures
- Build should fail fast and clearly when required artifacts are missing

# Code Style
- Follow JavaScript Style Guide from config/config-eslint.mjs
- End files with a single empty line
- Run `npm run lint` before commits; never use `eslint-disable`

# Development & Build
- Use NPM scripts exclusively; they should be silent on success
- Use `mv` to move files, not read/write operations
- Test by reading generated HTML, not in a browser
- Avoid reading large generated files (e.g., `.build/sitemap.json`)

# Build Pipeline (Flow: Source → .build/ → site/)
1. `clean`: Remove `.build/` and `site/`
2. `build:css`: Generate hashed CSS from `blocks/`
3. `build:js`: Minify JavaScript
4. `build:nav`: Generate navigation from `config/sitemap.yml`
5. `build:images`: Copy images to `site/`
6. `build:assets`: Copy assets (zip/pdf) and config files to `site/`
7. `build:templates`: Optimize Nunjucks templates to `.build/templates/`
8. `build:html`: Build HTML content to `site/`
9. `build:compression`: Compress assets in `site/`

# Directory Structure
- `.build/`: Intermediate build artifacts (not deployed)
- `site/`: Final deployable artifacts for HTTP serving

# Commands
- `npm run setup`: Initial project setup
- `npm run build`: Full build pipeline
- `npm test`: Run test suite
- `npm start`: Build and serve on `localhost:8080`
- `npm stop`: Stop nginx server

# Project Structure
- Content/assets: `external/voyahchat-{content,docs,install}`
- External blocks: `external/adaptive-layout/blocks/`
- Local blocks: `blocks/`
- Configuration: `config/`
- Library: `lib/`
- Tests: `lib/test/`

# Configuration
- Use `config/levels.js` for source directories; do not hardcode paths

# Debugging
- When debugging, create backup files with a `.backupN` extension
- Keep backups until the fix is verified, then remove them. Do not edit backups

# Testing
- Tests use AVA in `lib/test/` (`*.test.js`), run via `npm test`
- MUST use TestDir for test isolation - creates isolated directories in `.test/`
- **CRITICAL: NO tests should modify `site/` or `.build/` directories**
  - Unit tests: Use TestDir for complete isolation
  - Integration tests: Only READ from `site/` directory, never write
  - `site/` directory is sacred - it contains production build artifacts
- Test naming: `ClassName.method() - should do X when Y`
- Use AAA pattern: Arrange-Act-Assert with clear separation
- Use strict assertions: `t.is()`, `t.deepEqual()` not `t.truthy()`
- Inject Dir class into builders for test isolation (use TestDir instance)
- For detailed testing guidelines, see README.md

# Template & File Processing
- Use `page` object for current page data and `sitemap` for all other pages
- Only process markdown files listed in `config/sitemap.yml` by using collection filtering
- **Markdown links must be relative paths (e.g., `../free/tyres.md#section`) for GitHub compatibility**
- The build system should convert relative markdown links to proper URLs in HTML output
- **STRICT: NEVER apply any HTML transformations after markdown-to-HTML generation**
  - All links and anchors must be generated correctly during markdown-it rendering
  - No post-processing of HTML content is allowed
  - All transformations must happen at the markdown renderer level

# Deployment
1. Run `npm run build`
2. Deploy the `site/` directory contents
3. Serve with a static web server

# Architecture Summary
- **Externals**: Content and layout blocks from GIT repos
- **Build**: Modular NPM build system
- **Caching**: Hash-based CSS/JS for cache busting
- **Navigation**: Hierarchical URLs with section filtering

# config/sitemap.yml Format
- Format: `Title [URL, file.md, { layout: 'path/to/layout'}]` (layout is optional)
- URL: Absolute (`/`) or relative to parent
- Path: Relative to `external/voyahchat-content/`
- Hierarchy: 2-space indentation
- Example:
  ```yaml
  sitemap:
    - VoyahChat [/, index.md]
    - Free [/free, free/index.md]
      - Модели [models, free/models.md]
  ```

# .build/sitemap.json Structure
- A generated file containing `sitemap`, `pages`, `md2url`, and `url2md` mappings for site navigation
