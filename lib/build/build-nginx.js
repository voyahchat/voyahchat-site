/**
 * Build Script: Nginx Configuration Generation
 *
 * Responsibilities:
 * - Generate nginx.conf from Nunjucks template
 * - Configure nginx for static site serving
 * - Support compression and caching headers
 *
 * Dependencies: nunjucks
 * Output: .build/nginx.conf
 *
 * @module build/build-nginx
 */

const fs = require('fs');
const path = require('path');
const nunjucks = require('nunjucks');
const { Dir } = require('./dir');

/**
 * Nginx Build Script
 *
 * Generates nginx configuration for static site serving
 * - Uses config/ directory for templates
 * - Outputs to .build/ directory
 * - Configures compression, caching, and security headers
 */
class NginxBuilder {
    constructor(options = {}, dir = Dir) {
        this.options = options;
        this.dir = dir;
        this.projectRoot = dir.getRoot();
        this.buildDir = dir.getBuild();
        this.configDir = path.join(this.projectRoot, 'config');
    }

    /**
     * Configure Nunjucks environment for template rendering
     * @returns {Object} Configured Nunjucks environment
     */
    configureNunjucks() {
        return nunjucks.configure(this.configDir, {
            autoescape: false,
            trimBlocks: true,
            lstripBlocks: true,
        });
    }

    /**
     * Render nginx configuration from template
     * @param {Object} env - Nunjucks environment
     * @returns {string} Rendered nginx configuration
     */
    renderTemplate(env) {
        const templatePath = path.join(this.configDir, 'config-nginx.njk');
        const template = fs.readFileSync(templatePath, 'utf8');

        // Determine the correct mime.types path based on the platform
        const isCI = process.env.CI === 'true';
        const isLinux = process.platform === 'linux';
        const mimeTypesPath = (isCI || isLinux) ? '/etc/nginx/mime.types' : '/opt/homebrew/etc/nginx/mime.types';

        return env.renderString(template, {
            ROOT: this.projectRoot,
            MIME_TYPES_PATH: mimeTypesPath,
        });
    }

    /**
     * Write nginx configuration to build directory
     * @param {string} content - Rendered nginx configuration
     * @returns {Promise<string>} Path to written file
     */
    async writeConfig(content) {
        await this.dir.ensure(this.buildDir);
        const outputPath = path.join(this.buildDir, 'nginx.conf');

        if (!this.options.skipWrite) {
            fs.writeFileSync(outputPath, content, 'utf8');
        }

        return outputPath;
    }

    /**
     * Build nginx configuration with the current options
     * @returns {Promise<Object>} Build result with statistics
     */
    async build() {
        try {
            // Configure Nunjucks
            const env = this.configureNunjucks();

            // Read and render template
            const rendered = this.renderTemplate(env);

            // Write to .build directory
            const outputPath = await this.writeConfig(rendered);

            // Return summary for benchmarking
            return {
                configGenerated: 'nginx.conf',
                outputPath,
                size: Buffer.byteLength(rendered, 'utf8'),
            };
        } catch (error) {
            throw new Error(`Error generating nginx configuration: ${error.message}`);
        }
    }

    /**
     * Convert URL to flat filename for nginx configuration
     * @param {string} url - URL to convert
     * @returns {string} Flat filename (e.g., '/free/12v' -> 'free_12v')
     */
    static urlToFilename(url) {
        if (url === '/') {
            return 'index';
        }

        // Remove leading slash and replace remaining slashes with underscores
        return url.slice(1).replace(/\//g, '_');
    }
}

module.exports = {
    NginxBuilder,
    urlToFilename: NginxBuilder.urlToFilename,
};

// Only run if called directly (not when imported for testing)
if (require.main === module) {
    const builder = new NginxBuilder();
    builder.build().catch((error) => {
        console.error('Error in build-nginx:', error.message);
        process.exit(1);
    });
}
