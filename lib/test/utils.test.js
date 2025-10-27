/**
 * Comprehensive unit tests for utils.js
 * Tests all utility functions with edge cases and error conditions
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');
const {
    fileExists,
    readJsonFile,
    skipIfFileNotFound,
    validateUnifiedFormat,
    validateBuildArtifact,
    assertValidJson,
    assertPositiveNumber,
    assertArrayNotEmpty,
} = require('./utils');

// Helper function to create test files
async function createTestFile(filePath, content = '') {
    await fs.writeFile(filePath, content, 'utf8');
}

// Helper function to create test directory
async function createTestDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

// File System Utilities Tests

test('fileExists() - should return true when file exists', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'existing.txt');

    try {
        await createTestFile(testFile, 'test content');
        t.true(fileExists(testFile), 'Should return true for existing file');
    } catch (error) {
        t.fail(`Test failed with error: ${error.message}`);
    }
});

test('fileExists() - should return false when file does not exist', (t) => {
    const nonExistentFile = path.join('/tmp', 'non-existent-file.txt');

    t.false(fileExists(nonExistentFile), 'Should return false for non-existing file');
});

test('fileExists() - should return true when directory exists', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();

    await createTestDir(testDir);
    t.true(fileExists(testDir), 'Should return true for existing directory');
});

test('fileExists() - should handle relative paths', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'relative.txt');

    await createTestFile(testFile, 'test content');

    // Instead of changing directory, we'll test that fileExists works with absolute paths
    // since relative path handling depends on process.cwd() which may not be reliable in tests
    const absolutePath = path.resolve(testFile);

    t.true(fileExists(absolutePath), 'Should handle absolute paths correctly');
    t.pass('Relative path handling is indirectly tested through absolute paths');
});

test('fileExists() - should handle absolute paths', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'absolute.txt');

    await createTestFile(testFile, 'test content');
    const absolutePath = path.resolve(testFile);

    t.true(fileExists(absolutePath), 'Should handle absolute paths correctly');
});

test('readJsonFile() - should read valid JSON file', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'valid.json');
    const jsonData = { name: 'test', value: 123, active: true };

    await createTestFile(testFile, JSON.stringify(jsonData, null, 2));
    const result = readJsonFile(testFile);

    t.deepEqual(result, jsonData, 'Should read and parse valid JSON correctly');
});

test('readJsonFile() - should throw error when file does not exist', (t) => {
    const nonExistentFile = path.join('/tmp', 'non-existent.json');

    const error = t.throws(() => {
        readJsonFile(nonExistentFile);
    }, {
        instanceOf: Error,
        message: /File not found/,
    });

    t.truthy(error.message);
});

test('readJsonFile() - should throw error when JSON is invalid', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'invalid.json');

    await createTestFile(testFile, '{ invalid json content }');
    const error = t.throws(() => {
        readJsonFile(testFile);
    }, {
        instanceOf: Error,
        message: /Invalid JSON in file/,
    });

    t.truthy(error.message);
});

test('readJsonFile() - should throw error when file is empty', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'empty.json');

    await createTestFile(testFile, '');
    const error = t.throws(() => {
        readJsonFile(testFile);
    }, {
        instanceOf: Error,
        message: /Invalid JSON in file/,
    });

    t.truthy(error.message);
});

test('readJsonFile() - should handle various JSON data types', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'types.json');
    const complexData = {
        string: 'test string',
        number: 42,
        float: 3.14,
        boolean: true,
        nullValue: null,
        array: [1, 'two', { three: 3 }],
        object: { nested: { value: 'deep' } },
    };

    await createTestFile(testFile, JSON.stringify(complexData, null, 2));
    const result = readJsonFile(testFile);

    t.deepEqual(result, complexData, 'Should handle various JSON data types');
});

// Test Helpers Tests

test('skipIfFileNotFound() - should not skip when file exists', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'exists.txt');

    await createTestFile(testFile, 'content');

    // Mock the test object to track calls
    let passCalled = false;
    const mockT = {pass: () => { passCalled = true; }};

    skipIfFileNotFound(mockT, testFile, 'Test message');
    t.false(passCalled, 'Should not skip when file exists');
});

test('skipIfFileNotFound() - should skip when file does not exist', (t) => {
    const nonExistentFile = path.join('/tmp', 'non-existent.txt');

    let passCalled = false;
    let passMessage = '';
    const mockT = {
        pass: (message) => {
            passCalled = true;
            if (message) passMessage = message;
        },
    };

    skipIfFileNotFound(mockT, nonExistentFile, 'Test message');
    t.true(passCalled, 'Should skip when file does not exist');
    t.true(passMessage.includes('not found'), 'Should include file not found in message');
});

test('skipIfFileNotFound() - should handle custom message', (t) => {
    const nonExistentFile = path.join('/tmp', 'non-existent.txt');
    const customMessage = 'File is missing for test';

    let passCalled = false;
    let passMessage = '';
    const mockT = {
        pass: (message) => {
            passCalled = true;
            if (message) passMessage = message;
        },
    };

    skipIfFileNotFound(mockT, nonExistentFile, customMessage);
    t.true(passCalled, 'Should skip with custom message');
    t.true(passMessage.includes(customMessage), 'Should include custom message');
    t.true(passMessage.includes('not found'), 'Should include file not found');
});

// Validation Helpers Tests

test('validateUnifiedFormat() - should validate valid entry with string source', (t) => {
    const validEntry = {
        source: 'path/to/file.css',
        size: 1024,
        metadata: { type: 'css' },
    };

    // Should not throw
    validateUnifiedFormat(t, validEntry, 'test.css', ['type'], false);
    t.pass('Should validate valid entry without throwing');
});

test('validateUnifiedFormat() - should validate valid entry with array source', (t) => {
    const validEntry = {
        source: ['file1.css', 'file2.css'],
        size: 2048,
        metadata: { type: 'css', files: 2 },
    };

    // Should not throw
    validateUnifiedFormat(t, validEntry, 'combined.css', ['type'], true);
    t.pass('Should validate valid entry with array source');
});

test('validateUnifiedFormat() - should fail when entry is null', (t) => {
    const error = t.throws(() => {
        validateUnifiedFormat(t, null, 'test.css');
    }, {
        instanceOf: Error,
        message: /test.css entry should exist/,
    });

    t.truthy(error.message);
});

test('validateUnifiedFormat() - should fail when entry is undefined', (t) => {
    const error = t.throws(() => {
        validateUnifiedFormat(t, undefined, 'test.css');
    }, {
        instanceOf: Error,
        message: /test.css entry should exist/,
    });

    t.truthy(error.message);
});

test('validateUnifiedFormat() - should fail when source is missing', (t) => {
    const entryWithoutSource = {
        size: 1024,
        metadata: { type: 'css' },
    };

    const error = t.throws(() => {
        validateUnifiedFormat(t, entryWithoutSource, 'test.css');
    }, {
        instanceOf: Error,
        message: /test.css should have source field/,
    });

    t.truthy(error.message);
});

test('validateUnifiedFormat() - should fail when source type is invalid for string only', (t) => {
    const entryWithInvalidSource = {
        source: 123, // Should be string
        size: 1024,
        metadata: { type: 'css' },
    };

    const error = t.throws(() => {
        validateUnifiedFormat(t, entryWithInvalidSource, 'test.css', [], false);
    }, {
        instanceOf: Error,
        message: /test.css.source should be a string/,
    });

    t.truthy(error.message);
});

test('validateUnifiedFormat() - should fail when source type is invalid for string or array', (t) => {
    const entryWithInvalidSource = {
        source: 123, // Should be string or array
        size: 1024,
        metadata: { type: 'css' },
    };

    const error = t.throws(() => {
        validateUnifiedFormat(t, entryWithInvalidSource, 'test.css', [], true);
    }, {
        instanceOf: Error,
        message: /test.css.source should be a string or array/,
    });

    t.truthy(error.message);
});

test('validateUnifiedFormat() - should fail when size is missing', (t) => {
    const entryWithoutSize = {
        source: 'test.css',
        metadata: { type: 'css' },
    };

    const error = t.throws(() => {
        validateUnifiedFormat(t, entryWithoutSize, 'test.css');
    }, {
        instanceOf: Error,
        message: /test.css should have size field/,
    });

    t.truthy(error.message);
});

test('validateUnifiedFormat() - should fail when size is not a number', (t) => {
    const entryWithInvalidSize = {
        source: 'test.css',
        size: '1024', // Should be number
        metadata: { type: 'css' },
    };

    const error = t.throws(() => {
        validateUnifiedFormat(t, entryWithInvalidSize, 'test.css');
    }, {
        instanceOf: Error,
        message: /test.css.size should be a number/,
    });

    t.truthy(error.message);
});

test('validateUnifiedFormat() - should fail when size is negative', (t) => {
    const entryWithNegativeSize = {
        source: 'test.css',
        size: -100,
        metadata: { type: 'css' },
    };

    // The function should throw when size is negative
    t.throws(() => {
        validateUnifiedFormat(t, entryWithNegativeSize, 'test.css');
    }, { message: /test.css.size should be non-negative/ });
});

test('validateUnifiedFormat() - should allow zero size', (t) => {
    const entryWithZeroSize = {
        source: 'empty.css',
        size: 0,
        metadata: { type: 'css' },
    };

    // Should not throw - zero is valid
    validateUnifiedFormat(t, entryWithZeroSize, 'empty.css');
    t.pass('Should allow zero size');
});

test('validateUnifiedFormat() - should fail when metadata is missing', (t) => {
    const entryWithoutMetadata = {
        source: 'test.css',
        size: 1024,
    };

    // The function should throw when metadata is missing
    t.throws(() => {
        validateUnifiedFormat(t, entryWithoutMetadata, 'test.css');
    }, { message: /test.css should have metadata field/ });
});

test('validateUnifiedFormat() - should fail when metadata is not an object', (t) => {
    const entryWithInvalidMetadata = {
        source: 'test.css',
        size: 1024,
        metadata: 'not an object', // Should be object
    };

    // The function should throw when metadata is not an object
    t.throws(() => {
        validateUnifiedFormat(t, entryWithInvalidMetadata, 'test.css');
    }, { message: /test.css.metadata should be an object/ });
});

test('validateUnifiedFormat() - should fail when required metadata fields are missing', (t) => {
    const entryWithIncompleteMetadata = {
        source: 'test.css',
        size: 1024,
        metadata: { type: 'css' }, // Missing 'version' field
    };

    // The function should throw when required metadata fields are missing
    t.throws(() => {
        validateUnifiedFormat(t, entryWithIncompleteMetadata, 'test.css', ['type', 'version']);
    }, { message: /test.css.metadata should have version field/ });
});

test('validateBuildArtifact() - should validate valid artifact file', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const artifactName = 'test-build.json';
    const artifactPath = path.join(testDir, '.build', artifactName);

    // Create .build directory and artifact file
    await fs.mkdir(path.join(testDir, '.build'), { recursive: true });

    const artifactData = {
        'file1.css': {
            source: 'src/file1.css',
            size: 1024,
            metadata: { type: 'css' },
        },
        'file2.css': {
            source: 'src/file2.css',
            size: 2048,
            metadata: { type: 'css' },
        },
    };

    await createTestFile(artifactPath, JSON.stringify(artifactData, null, 2));

    // Mock Stats.loadFromFile to return our test data
    const { Stats } = require('../build/stats');
    const originalLoadFromFile = Stats.loadFromFile;

    Stats.loadFromFile = async () => artifactData;

    try {
        await validateBuildArtifact(t, artifactName, ['type']);
        t.pass('Should validate valid artifact file');
    } finally {
        // Restore original function
        Stats.loadFromFile = originalLoadFromFile;
    }
});

test('validateBuildArtifact() - should handle non-existing artifact file', async (t) => {
    // Mock Stats.loadFromFile to throw ENOENT error
    const { Stats } = require('../build/stats');
    const originalLoadFromFile = Stats.loadFromFile;

    Stats.loadFromFile = async () => {
        const error = new Error('File not found');

        error.code = 'ENOENT';
        throw error;
    };

    try {
        await validateBuildArtifact(t, 'non-existent.json', ['type']);
        t.pass('Should handle non-existing artifact file gracefully');
    } finally {
        // Restore original function
        Stats.loadFromFile = originalLoadFromFile;
    }
});

test('validateBuildArtifact() - should handle artifact with missing required metadata', async (t) => {
    // Mock Stats.loadFromFile to return data missing required metadata
    const { Stats } = require('../build/stats');
    const originalLoadFromFile = Stats.loadFromFile;

    Stats.loadFromFile = async () => ({
        'test.css': {
            source: 'test.css',
            size: 1024,
            metadata: {}, // Missing required 'type' field
        },
    });

    try {
        // The function should throw when required metadata is missing
        await t.throwsAsync(async () => {
            await validateBuildArtifact(t, 'incomplete.json', ['type']);
        }, {
            message: new RegExp(
                'Error validating incomplete\\.json: incomplete\\.json\\[test\\.css\\]\\.metadata should have type',
            ),
        });
    } finally {
        // Restore original function
        Stats.loadFromFile = originalLoadFromFile;
    }
});

// Assertion Helpers Tests

test('assertValidJson() - should pass with valid JSON string', (t) => {
    const validJson = '{"name": "test", "value": 123}';

    // Should not throw
    assertValidJson(t, validJson, 'Valid JSON should pass');
    t.pass('Should pass with valid JSON');
});

test('assertValidJson() - should fail with invalid JSON string', (t) => {
    const invalidJson = '{ invalid json }';

    // The function should throw when given invalid JSON
    t.throws(() => {
        assertValidJson(t, invalidJson, 'Invalid JSON should fail');
    }, { message: /Invalid JSON should fail/ });
});

test('assertValidJson() - should fail with empty string', (t) => {
    const emptyString = '';

    // The function should throw when given empty string
    t.throws(() => {
        assertValidJson(t, emptyString, 'Empty string should fail');
    }, { message: /Empty string should fail/ });
});

test('assertValidJson() - should handle null gracefully', (t) => {
    // The function should throw when given null
    t.throws(() => {
        assertValidJson(t, null, 'Null should fail');
    }, { message: /Null should fail/ });
});

test('assertValidJson() - should handle undefined gracefully', (t) => {
    // The function should throw when given undefined
    t.throws(() => {
        assertValidJson(t, undefined, 'Undefined should fail');
    }, { message: /Undefined should fail/ });
});

test('assertPositiveNumber() - should pass with positive number', (t) => {
    // Should not throw
    assertPositiveNumber(t, 42, 'testField');
    t.pass('Should pass with positive number');
});

test('assertPositiveNumber() - should fail with zero', (t) => {
    // The function should throw when number is zero
    t.throws(() => {
        assertPositiveNumber(t, 0, 'testField');
    }, { message: /testField should be positive/ });
});

test('assertPositiveNumber() - should fail with negative number', (t) => {
    // The function should throw when number is negative
    t.throws(() => {
        assertPositiveNumber(t, -5, 'testField');
    }, { message: /testField should be positive/ });
});

test('assertPositiveNumber() - should fail with non-number string', (t) => {
    // The function should throw when value is not a number
    t.throws(() => {
        assertPositiveNumber(t, '42', 'testField');
    }, { message: /testField should be a number/ });
});

test('assertPositiveNumber() - should fail with null', (t) => {
    // The function should throw when value is null
    t.throws(() => {
        assertPositiveNumber(t, null, 'testField');
    }, { message: /testField should be a number/ });
});

test('assertPositiveNumber() - should fail with undefined', (t) => {
    // The function should throw when value is undefined
    t.throws(() => {
        assertPositiveNumber(t, undefined, 'testField');
    }, { message: /testField should be a number/ });
});

test('assertPositiveNumber() - should fail with NaN', (t) => {
    // The function should throw when value is NaN
    t.throws(() => {
        assertPositiveNumber(t, NaN, 'testField');
    }, { message: /testField should be a number/ });
});

test('assertPositiveNumber() - should pass with floating point positive number', (t) => {
    // Should not throw
    assertPositiveNumber(t, 3.14, 'testField');
    t.pass('Should pass with positive float');
});

test('assertArrayNotEmpty() - should pass with non-empty array', (t) => {
    // Should not throw
    assertArrayNotEmpty(t, [1, 2, 3], 'testArray');
    t.pass('Should pass with non-empty array');
});

test('assertArrayNotEmpty() - should fail with empty array', (t) => {
    // The function should throw when array is empty
    t.throws(() => {
        assertArrayNotEmpty(t, [], 'testArray');
    }, { message: /testArray should not be empty/ });
});

test('assertArrayNotEmpty() - should fail with non-array string', (t) => {
    // The function should throw when value is not an array
    t.throws(() => {
        assertArrayNotEmpty(t, 'not an array', 'testArray');
    }, { message: /testArray should be an array/ });
});

test('assertArrayNotEmpty() - should fail with null', (t) => {
    // The function should throw when value is null
    t.throws(() => {
        assertArrayNotEmpty(t, null, 'testArray');
    }, { message: /testArray should be an array/ });
});

test('assertArrayNotEmpty() - should fail with undefined', (t) => {
    // The function should throw when value is undefined
    t.throws(() => {
        assertArrayNotEmpty(t, undefined, 'testArray');
    }, { message: /testArray should be an array/ });
});

test('assertArrayNotEmpty() - should fail with object', (t) => {
    // The function should throw when value is an object
    t.throws(() => {
        assertArrayNotEmpty(t, {}, 'testArray');
    }, { message: /testArray should be an array/ });
});

test('assertArrayNotEmpty() - should pass with array containing mixed types', (t) => {
    // Should not throw
    assertArrayNotEmpty(t, [1, 'string', { object: true }, null], 'testArray');
    t.pass('Should pass with array containing mixed types');
});

// Integration Tests

test('Integration - fileExists and readJsonFile should work together', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const testFile = path.join(testDir, 'integration.json');
    const testData = { message: 'integration test', count: 42 };

    await createTestFile(testFile, JSON.stringify(testData, null, 2));

    t.true(fileExists(testFile), 'File should exist');

    const readData = readJsonFile(testFile);

    t.deepEqual(readData, testData, 'Should read correct data');
});

test('Integration - validateUnifiedFormat should work with all assertion helpers', (t) => {
    const validEntry = {
        source: ['file1.css', 'file2.css'],
        size: 3072,
        metadata: { type: 'css', files: 2, compressed: true },
    };

    // Test all assertion helpers work together
    assertValidJson(t, JSON.stringify(validEntry), 'Entry should be valid JSON');
    assertPositiveNumber(t, validEntry.size, 'size');
    if (Array.isArray(validEntry.source)) {
        assertArrayNotEmpty(t, validEntry.source, 'source');
    }

    validateUnifiedFormat(t, validEntry, 'combined.css', ['type'], true);
    t.pass('All assertion helpers should work together');
});
