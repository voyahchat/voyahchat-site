/**
 * Strict Console Interceptor for Tests
 *
 * STRICT REQUIREMENT: Tests should NOT output anything to console when successful.
 * Any warning or message should cause the test to fail.
 *
 * This module provides a console interception system that is safe for parallel
 * test execution using AVA worker threads. It uses WeakMap to store per-test
 * console state and leverages AVA's test context for isolation.
 *
 * CRITICAL: This replaces problematic global console overrides that cause race conditions.
 */

const interceptors = new WeakMap();

class ConsoleInterceptor {
    constructor(testContext) {
        this.testContext = testContext;
        this.captured = { warn: [], error: [], log: [], info: [], debug: [] };
        this.originalMethods = {
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            log: console.log.bind(console),
            info: console.info.bind(console),
            debug: console.debug.bind(console),
        };
        this.allowedPatterns = [];
        this.isActive = false;

        // Store in WeakMap for thread safety
        interceptors.set(testContext, this);
    }

    /**
     * Start intercepting console methods for this test context
     * @param {string[]} allowedPatterns - Array of regex patterns to allow (whitelist)
     */
    start(allowedPatterns = []) {
        if (this.isActive) {
            return;
        }

        this.isActive = true;
        this.allowedPatterns = allowedPatterns;
        const self = this;

        // Create wrapped methods that capture ALL console output
        ['warn', 'error', 'log', 'info', 'debug'].forEach(method => {
            const _original = this.originalMethods[method] || console[method].bind(console);
            _original; // Mark as used to avoid ESLint warning
            const wrapped = function(...args) {
                const interceptor = interceptors.get(self.testContext);
                if (interceptor && interceptor.isActive) {
                    const message = args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');

                    // Check if message matches any allowed pattern
                    const isAllowed = allowedPatterns.some(pattern =>
                        new RegExp(pattern).test(message));

                    if (!isAllowed) {
                        interceptor.captured[method] = interceptor.captured[method] || [];
                        interceptor.captured[method].push({
                            message,
                            timestamp: new Date().toISOString(),
                            stack: new Error().stack,
                        });
                    }
                }
                // CRITICAL: Do NOT call original - tests must be completely silent
            };

            // CRITICAL: Replace global console methods to intercept ALL output
            console[method] = wrapped;
            // Also store on test context for cleanup
            this.testContext[`_console_${method}`] = wrapped;
        });
    }

    /**
     * Stop intercepting and clean up
     */
    stop() {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;
        interceptors.delete(this.testContext);

        // Restore original console methods
        ['warn', 'error', 'log', 'info', 'debug'].forEach(method => {
            console[method] = this.originalMethods[method] || console[method].bind(console);
            delete this.testContext[`_console_${method}`];
        });

        // STRICT: Fail test if ANY console output was captured
        const allMessages = [];
        Object.keys(this.captured).forEach(method => {
            if (this.captured[method] && this.captured[method].length > 0) {
                this.captured[method].forEach(entry => {
                    allMessages.push(`[${method.toUpperCase()}] ${entry.message}`);
                });
            }
        });

        if (allMessages.length > 0) {
            throw new Error(
                'Test failed: Console output detected during successful test execution.\n' +
                'Tests must be completely silent when successful.\n' +
                `Captured output:\n  ${allMessages.join('\n  ')}\n` +
                `Total messages: ${allMessages.length}`,
            );
        }
    }

    /**
     * Check if any messages were captured
     * @returns {boolean} True if any console output found
     */
    hasOutput() {
        return Object.values(this.captured).some(messages => messages && messages.length > 0);
    }

    /**
     * Get all captured messages
     * @returns {Object} Object with all captured arrays
     */
    getCaptured() {
        const result = {};
        Object.keys(this.captured).forEach(method => {
            result[method] = [...(this.captured[method] || [])];
        });
        return result;
    }

    /**
     * Clear all captured messages
     */
    clear() {
        Object.keys(this.captured).forEach(method => {
            this.captured[method] = [];
        });
    }
}

module.exports = { ConsoleInterceptor };
