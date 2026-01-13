/**
 * Retry utility with exponential backoff and jitter
 * Provides robust retry logic for Telegram API operations
 *
 * @module telegram/retry
 */

/**
 * Error types for categorization
 */
const ErrorTypes = {
    TIMEOUT: 'timeout',
    NETWORK: 'network',
    API: 'api',
    FATAL: 'fatal',
};

/**
 * Categorize error type based on error message and properties
 * @param {Error} error - The error to categorize
 * @returns {string} Error type from ErrorTypes
 */
function categorizeError(error) {
    const message = error.message.toLowerCase();

    // Timeout errors
    if (message.includes('timeout') || message.includes('etimedout')) {
        return ErrorTypes.TIMEOUT;
    }

    // Network errors
    if (message.includes('network') ||
        message.includes('connection') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('enotfound')) {
        return ErrorTypes.NETWORK;
    }

    // API errors that shouldn't be retried
    if (message.includes('message not found') ||
        message.includes('chat not found') ||
        message.includes('unauthorized') ||
        message.includes('forbidden')) {
        return ErrorTypes.FATAL;
    }

    // Default to API error for retry
    return ErrorTypes.API;
}

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelayMs - Base delay in milliseconds
 * @param {number} maxDelayMs - Maximum delay in milliseconds
 * @param {number} jitterMs - Jitter range in milliseconds
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, baseDelayMs, maxDelayMs, jitterMs) {
    // Exponential backoff: delay = baseDelay * 2^attempt
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * jitterMs;

    return Math.floor(cappedDelay + jitter);
}

/**
 * Calculate timeout based on file size
 * @param {number} fileSizeBytes - File size in bytes
 * @param {number} timeoutBaseMs - Base timeout in milliseconds
 * @param {number} timeoutPerMbMs - Additional timeout per MB
 * @param {number} timeoutMaxMs - Maximum timeout in milliseconds
 * @returns {number} Timeout in milliseconds
 */
function calculateTimeout(fileSizeBytes, timeoutBaseMs, timeoutPerMbMs, timeoutMaxMs) {
    if (!fileSizeBytes || fileSizeBytes <= 0) {
        return timeoutBaseMs;
    }

    // Convert bytes to MB
    const fileSizeMb = fileSizeBytes / (1024 * 1024);

    // Calculate timeout: base + (size * perMB)
    const calculatedTimeout = timeoutBaseMs + (fileSizeMb * timeoutPerMbMs);

    // Cap at maximum timeout
    return Math.min(calculatedTimeout, timeoutMaxMs);
}

/**
 * Execute an operation with retry logic
 * @param {Function} operation - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} [options.maxRetries=10] - Maximum number of retries
 * @param {number} [options.baseDelayMs=2000] - Base delay for exponential backoff
 * @param {number} [options.maxDelayMs=60000] - Maximum delay
 * @param {number} [options.jitterMs=1000] - Jitter range
 * @param {Function} [options.shouldRetry] - Custom function to determine if should retry
 * @param {Function} [options.onRetry] - Callback called on each retry
 * @returns {Promise} Result of the operation
 * @throws {Error} The last error if all retries fail
 */
async function executeWithRetry(operation, options = {}) {
    const {
        maxRetries = 10,
        baseDelayMs = 2000,
        maxDelayMs = 60000,
        jitterMs = 1000,
        shouldRetry = null,
        onRetry = null,
    } = options;

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Execute the operation
            const result = await operation();

            // If we get here, operation succeeded
            return result;
        } catch (error) {
            lastError = error;

            // Categorize error
            const errorType = categorizeError(error);

            // Check if we should retry
            if (attempt === maxRetries) {
                // No more retries
                break;
            }

            if (errorType === ErrorTypes.FATAL) {
                // Fatal error, don't retry
                break;
            }

            // Use custom shouldRetry function if provided
            if (shouldRetry && !shouldRetry(error, attempt, errorType)) {
                break;
            }

            // Calculate delay for next attempt
            const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs, jitterMs);

            // Call onRetry callback if provided
            if (onRetry) {
                onRetry(error, attempt, delay, errorType);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // All retries failed, throw the last error
    throw lastError;
}

/**
 * Create a timeout promise
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [message='Operation timeout'] - Timeout error message
 * @returns {Promise} Promise that rejects after timeout
 */
function createTimeout(timeoutMs, message = 'Operation timeout') {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), timeoutMs);
    });
}

/**
 * Execute an operation with timeout and retry
 * @param {Function} operation - Async function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {Object} retryOptions - Retry options (same as executeWithRetry)
 * @returns {Promise} Result of the operation
 */
async function executeWithTimeoutAndRetry(operation, timeoutMs, retryOptions = {}) {
    return executeWithRetry(
        async () => {
            return Promise.race([
                operation(),
                createTimeout(timeoutMs, `Operation timeout after ${timeoutMs}ms`),
            ]);
        },
        retryOptions,
    );
}

module.exports = {
    ErrorTypes,
    categorizeError,
    calculateDelay,
    calculateTimeout,
    executeWithRetry,
    executeWithTimeoutAndRetry,
    createTimeout,
};
