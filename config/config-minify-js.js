/**
 * JavaScript Minification Configuration
 * Terser configuration for production JavaScript builds
 */

module.exports = {
    compress: {
        drop_console: true,        // Remove console.log statements
        drop_debugger: true,       // Remove debugger statements
        pure_funcs: ['console.log', 'console.warn'], // Remove specific function calls
        passes: 2,                  // Double optimization pass
    },
    mangle: {
        toplevel: true,            // Mangle top-level variable names
        properties: {
            regex: /^_$/,          // Mangle private properties starting with _
        },
    },
    format: {
        comments: false,            // Remove all comments
    },
    sourceMap: false,               // Don't generate source maps for production
};
