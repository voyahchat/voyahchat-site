module.exports = {
    // CRITICAL: Tests MUST FAIL when they output ANY warnings or errors
    // Enable failFast to stop immediately on first failure (including warnings)
    failFast: true,
    // Show detailed output for debugging warnings/errors
    verbose: true,
    // Enable worker threads for faster test execution
    workerThreads: true,
    // DO NOT suppress console output - we need to see warnings to fail tests
    tap: false,
    // Run files in parallel with reasonable concurrency
    concurrency: 1000,
    // Show all test output including failures
    reporter: 'verbose',

    files: [
        'lib/test/**/*.test.js',
    ],

    // Additional configuration for strict testing
    serial: false, // Allow parallel execution but with warning tracking per test
    babel: false,  // No babel transformation needed
    compileEnhancements: false, // No enhancements needed
};
