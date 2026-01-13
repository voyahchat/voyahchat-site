const test = require('ava');
const {
    ErrorTypes,
    categorizeError,
    calculateDelay,
    calculateTimeout,
    executeWithRetry,
    executeWithTimeoutAndRetry,
    createTimeout,
} = require('../telegram/retry');

test('categorizeError() - should categorize timeout errors', (t) => {
    const error = new Error('Request timeout');
    t.is(categorizeError(error), ErrorTypes.TIMEOUT);

    const etimedoutError = new Error('ETIMEDOUT');
    t.is(categorizeError(etimedoutError), ErrorTypes.TIMEOUT);
});

test('categorizeError() - should categorize network errors', (t) => {
    const networkError = new Error('Network error occurred');
    t.is(categorizeError(networkError), ErrorTypes.NETWORK);

    const connResetError = new Error('ECONNRESET');
    t.is(categorizeError(connResetError), ErrorTypes.NETWORK);

    const connRefusedError = new Error('ECONNREFUSED');
    t.is(categorizeError(connRefusedError), ErrorTypes.NETWORK);

    const notFoundError = new Error('ENOTFOUND');
    t.is(categorizeError(notFoundError), ErrorTypes.NETWORK);
});

test('categorizeError() - should categorize fatal errors', (t) => {
    const messageNotFoundError = new Error('message not found');
    t.is(categorizeError(messageNotFoundError), ErrorTypes.FATAL);

    const chatNotFoundError = new Error('chat not found');
    t.is(categorizeError(chatNotFoundError), ErrorTypes.FATAL);

    const unauthorizedError = new Error('unauthorized');
    t.is(categorizeError(unauthorizedError), ErrorTypes.FATAL);

    const forbiddenError = new Error('forbidden');
    t.is(categorizeError(forbiddenError), ErrorTypes.FATAL);
});

test('categorizeError() - should default to API error', (t) => {
    const genericError = new Error('Some other error');
    t.is(categorizeError(genericError), ErrorTypes.API);
});

test('calculateDelay() - should calculate exponential backoff with jitter', (t) => {
    const baseDelay = 1000;
    const maxDelay = 10000;
    const jitter = 100;

    // First attempt (0)
    const delay0 = calculateDelay(0, baseDelay, maxDelay, jitter);
    t.true(delay0 >= baseDelay && delay0 < baseDelay + jitter);

    // Second attempt (1)
    const delay1 = calculateDelay(1, baseDelay, maxDelay, jitter);
    t.true(delay1 >= baseDelay * 2 && delay1 < baseDelay * 2 + jitter);

    // Third attempt (2)
    const delay2 = calculateDelay(2, baseDelay, maxDelay, jitter);
    t.true(delay2 >= baseDelay * 4 && delay2 < baseDelay * 4 + jitter);

    // Should cap at maxDelay
    const delayHigh = calculateDelay(20, baseDelay, maxDelay, jitter);
    t.true(delayHigh >= maxDelay && delayHigh < maxDelay + jitter);
});

test('calculateTimeout() - should calculate timeout based on file size', (t) => {
    const baseTimeout = 60000;
    const timeoutPerMb = 30000;
    const maxTimeout = 600000;

    // No file size
    t.is(calculateTimeout(0, baseTimeout, timeoutPerMb, maxTimeout), baseTimeout);

    // 1 MB file
    const timeout1Mb = calculateTimeout(1024 * 1024, baseTimeout, timeoutPerMb, maxTimeout);
    t.is(timeout1Mb, baseTimeout + timeoutPerMb);

    // 5 MB file
    const timeout5Mb = calculateTimeout(5 * 1024 * 1024, baseTimeout, timeoutPerMb, maxTimeout);
    t.is(timeout5Mb, baseTimeout + (5 * timeoutPerMb));

    // Should cap at maxTimeout
    const timeoutLarge = calculateTimeout(100 * 1024 * 1024, baseTimeout, timeoutPerMb, maxTimeout);
    t.is(timeoutLarge, maxTimeout);
});

test('executeWithRetry() - should succeed on first attempt', async (t) => {
    let attempts = 0;
    const operation = async () => {
        attempts++;
        return 'success';
    };

    const result = await executeWithRetry(operation, { maxRetries: 3 });
    t.is(result, 'success');
    t.is(attempts, 1);
});

test('executeWithRetry() - should retry on failure', async (t) => {
    let attempts = 0;
    const operation = async () => {
        attempts++;
        if (attempts < 3) {
            throw new Error('Temporary failure');
        }
        return 'success';
    };

    const result = await executeWithRetry(operation, {
        maxRetries: 5,
        baseDelayMs: 10,
        jitterMs: 0,
    });
    t.is(result, 'success');
    t.is(attempts, 3);
});

test('executeWithRetry() - should fail after max retries', async (t) => {
    let attempts = 0;
    const operation = async () => {
        attempts++;
        throw new Error('Persistent failure');
    };

    await t.throwsAsync(
        executeWithRetry(operation, {
            maxRetries: 2,
            baseDelayMs: 10,
            jitterMs: 0,
        }),
        { message: 'Persistent failure' },
    );
    t.is(attempts, 3); // Initial attempt + 2 retries
});

test('executeWithRetry() - should not retry fatal errors', async (t) => {
    let attempts = 0;
    const operation = async () => {
        attempts++;
        throw new Error('message not found');
    };

    await t.throwsAsync(
        executeWithRetry(operation, { maxRetries: 5 }),
        { message: 'message not found' },
    );
    t.is(attempts, 1); // Should not retry
});

test('executeWithRetry() - should call onRetry callback', async (t) => {
    let attempts = 0;
    let retryCount = 0;
    const operation = async () => {
        attempts++;
        if (attempts < 3) {
            throw new Error('Temporary failure');
        }
        return 'success';
    };

    const onRetry = (error, attempt, delay, errorType) => {
        retryCount++;
        t.is(error.message, 'Temporary failure');
        t.is(attempt, attempts - 1);
        t.true(delay > 0);
        t.is(errorType, ErrorTypes.API);
    };

    await executeWithRetry(operation, {
        maxRetries: 5,
        baseDelayMs: 10,
        jitterMs: 0,
        onRetry,
    });

    t.is(retryCount, 2);
});

test('executeWithTimeoutAndRetry() - should timeout operation', async (t) => {
    const operation = async () => {
        return new Promise((resolve) => {
            setTimeout(() => resolve('success'), 1000);
        });
    };

    await t.throwsAsync(
        executeWithTimeoutAndRetry(operation, 100, { maxRetries: 0 }),
        { message: 'Operation timeout after 100ms' },
    );
});

test('createTimeout() - should reject after timeout', async (t) => {
    await t.throwsAsync(
        createTimeout(50, 'Custom timeout message'),
        { message: 'Custom timeout message' },
    );
});
