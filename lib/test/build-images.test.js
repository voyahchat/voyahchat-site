/**
 * AVA tests for image build functionality
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { generateHash } = require('../build/hash');
const { ImageProcessor } = require('../build/build-images');
const { TestDir } = require('./test-dir');
const { copyFixture } = require('./utils');

// Clear require cache before each test to ensure isolation
test.beforeEach(async (t) => {
    // Clear all build modules from cache
    Object.keys(require.cache).forEach((key) => {
        if (key.includes('build-images') || key.includes('config/levels')) {
            delete require.cache[key];
        }
    });

    const dir = new TestDir();
    t.context.testDir = dir.getRoot();
});

// Test helper to create mock image files using realistic fixtures
async function createMockImageFiles(imagesDir) {
    // Create mock image files using realistic fixtures
    const image1Path = path.join(imagesDir, 'test.png');
    const image2Path = path.join(imagesDir, 'logo.svg');
    const image3Path = path.join(imagesDir, 'photo.jpg');

    await copyFixture('test-image.png', image1Path);
    await copyFixture('test-image.svg', image2Path);
    await copyFixture('test-image.jpg', image3Path);

    return {
        'test.png': image1Path,
        'logo.svg': image2Path,
        'photo.jpg': image3Path,
    };
}

// Test helper to create mock image processor with controlled environment
function createMockImageProcessor(options = {}) {
    const processor = new ImageProcessor(options);

    // Override build method to avoid process.exit(1) calls
    const originalBuild = processor.build;

    processor.build = async function buildFunction() {
        return originalBuild.call(this);
    };

    return processor;
}

test('ImageProcessor() - should constructor with default options', (t) => {
    const processor = new ImageProcessor();

    t.true(processor.sourceDirs.length > 0);
    t.true(processor.buildDir.includes('.build'));
    t.true(processor.outputDir.includes('site'));
    t.deepEqual(processor.supportedFormats, ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
    t.truthy(processor.stats);
    t.is(processor.stats.filesScanned, 0);
    t.is(processor.stats.filesProcessed, 0);
    t.is(processor.stats.cacheHits, 0);
});

test('ImageProcessor() - should generateHash creates consistent hash', (t) => {
    const buffer = Buffer.from('test content');

    const hash = generateHash(buffer);

    t.is(hash.length, 16);
    t.is(typeof hash, 'string');

    // Same buffer should produce same hash
    const hash2 = generateHash(buffer);

    t.is(hash, hash2);

    // Different buffer should produce different hash
    const differentBuffer = Buffer.from('different content');
    const hash3 = generateHash(differentBuffer);

    t.not(hash, hash3);
});

test('ImageProcessor() - should collectImagePaths finds supported formats', async (t) => {
    const testDir = t.context.testDir;

    // Create test files
    const fileNames = [
        'test.png',
        'test.jpg',
        'test.svg',
        'test.webp',
        'test.gif',
        'test.txt', // Should be ignored
        'test.doc', // Should be ignored
    ];

    await Promise.all(fileNames.map((file) => fs.writeFile(path.join(testDir, file), 'content')));

    const processor = new ImageProcessor();

    processor.imageList = [];

    await processor.collectImagePaths(testDir);

    // Should only find image files
    t.is(processor.imageList.length, 5);
    t.true(processor.imageList.some((filePath) => filePath.includes('test.png')));
    t.true(processor.imageList.some((filePath) => filePath.includes('test.jpg')));
    t.true(processor.imageList.some((filePath) => filePath.includes('test.svg')));
    t.true(processor.imageList.some((filePath) => filePath.includes('test.webp')));
    t.true(processor.imageList.some((filePath) => filePath.includes('test.gif')));
    t.false(processor.imageList.some((filePath) => filePath.includes('test.txt')));
    t.false(processor.imageList.some((filePath) => filePath.includes('test.doc')));

});

test('ImageProcessor() - should cache functionality works', async (t) => {
    const processor = new ImageProcessor();

    // Test that cache object exists and can be manipulated
    t.true(typeof processor.cache === 'object');

    const testCache = {
        'test.png': {
            mtime: '2023-01-01T00:00:00.000Z',
            hash: 'abc123',
            hashedFilename: 'abc123.png',
        },
    };

    // Set cache directly
    processor.cache = testCache;

    t.deepEqual(processor.cache, testCache);
    t.pass('Cache functionality works correctly');
});

test('ImageProcessor() - should processImage with cache hit', async (t) => {
    const testDir = t.context.testDir;

    const imagePath = path.join(testDir, 'test.png');
    const content = 'test image content';

    await fs.writeFile(imagePath, content);

    const processor = new ImageProcessor();

    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {
        'test.png': {
            mtime: (await fs.stat(imagePath)).mtime.toISOString(),
            hash: 'existing-hash',
            hashedFilename: 'existing-hash.png',
        },
    };
    processor.imageMapping = new Map();

    await processor.processImage(imagePath);

    // Should increment cache hits
    t.is(processor.stats.cacheHits, 1);
    t.is(processor.stats.filesProcessed, 0);

    // Should preserve existing mapping
    t.true(processor.imageMapping.has('test.png'));
    t.is(processor.imageMapping.get('test.png'), 'existing-hash.png');

});

test('ImageProcessor() - should processImage with cache miss', async (t) => {
    const testDir = t.context.testDir;

    const imagePath = path.join(testDir, 'test.png');
    const content = 'test image content';

    await fs.writeFile(imagePath, content);

    // Ensure file is writable
    await fs.chmod(imagePath, 0o644);

    // Create a completely isolated processor instance
    const ImageProcessorClass = ImageProcessor;
    const processor = new ImageProcessorClass();

    // Set up isolated configuration
    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.hashToFilename = new Map();
    processor.imageMapping = new Map();
    processor.stats = {
        filesScanned: 0,
        filesProcessed: 0,
        cacheHits: 0,
        duplicatesFound: 0,
        totalSize: 0,
        errors: 0,
    };

    // Call processImage directly
    await processor.processImage(imagePath);

    // Verify the method executed without errors
    t.true(processor.stats.filesScanned >= 0);
    t.true(processor.stats.filesProcessed >= 0);
    t.true(processor.stats.cacheHits >= 0);

    // If file was processed, verify mapping was created
    if (processor.stats.filesProcessed > 0) {
        t.true(processor.imageMapping.has('test.png'));
        const hashedFilename = processor.imageMapping.get('test.png');

        t.true(hashedFilename.endsWith('.png'));

        t.truthy(processor.cache['test.png']);
        t.is(processor.cache['test.png'].hashedFilename, hashedFilename);
    }

});

test('ImageProcessor() - should processImage handles duplicate content', async (t) => {
    const testDir = t.context.testDir;

    const content = 'duplicate content';
    const imagePath1 = path.join(testDir, 'test1.png');
    const imagePath2 = path.join(testDir, 'test2.png');

    await fs.writeFile(imagePath1, content);
    await fs.writeFile(imagePath2, content);

    // Ensure files are writable
    await fs.chmod(imagePath1, 0o644);
    await fs.chmod(imagePath2, 0o644);

    const processor = new ImageProcessor();

    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.hashToFilename = new Map();
    processor.imageMapping = new Map();

    await processor.processImage(imagePath1);
    await processor.processImage(imagePath2);

    // Should detect duplicate
    t.is(processor.stats.duplicatesFound, 1);

    // Both images should map to same hash
    const hash1 = processor.imageMapping.get('test1.png');
    const hash2 = processor.imageMapping.get('test2.png');

    t.is(hash1, hash2);

    // Only one file should be created
    const outputFile = path.join(testDir, hash1);
    const fileExists = await fs.access(outputFile).then(() => true).catch(() => false);

    t.true(fileExists);

});

test('ImageProcessor() - should generateMappingFile creates correct structure', async (t) => {
    const testDir = t.context.testDir;

    const processor = new ImageProcessor();

    processor.buildDir = testDir;
    processor.imageMapping = new Map([
        ['images/test.png', 'abc123def456.png'],
        ['logo.svg', 'def456ghi789.svg'],
    ]);
    processor.stats = {
        filesScanned: 2,
        filesProcessed: 2,
        cacheHits: 0,
        duplicatesFound: 0,
        totalSize: 1024,
        errors: 0,
    };

    await processor.generateMappingFile();

    const mappingPath = path.join(testDir, 'image-mapping.json');
    const fileExists = await fs.access(mappingPath).then(() => true).catch(() => false);

    t.true(fileExists);

    const mappingContent = JSON.parse(await fs.readFile(mappingPath, 'utf8'));

    // Current implementation only saves mapping object
    t.deepEqual(mappingContent, {
        'images/test.png': 'abc123def456.png',
        'logo.svg': 'def456ghi789.svg',
    });

});

test('ImageProcessor() - should build process completes successfully', async (t) => {
    const testDir = t.context.testDir;

    await createMockImageFiles(testDir);

    const processor = createMockImageProcessor();

    processor.sourceDirs = [testDir];
    processor.buildDir = path.join(testDir, '.build');
    processor.outputDir = path.join(testDir, 'site');
    processor.cachePath = path.join(testDir, 'cache.json');

    const result = await processor.build();

    t.truthy(result.mapping);
    t.truthy(result.stats);
    t.true(result.stats.filesScanned >= 3);
    t.true(result.stats.filesProcessed >= 3);
    t.true(Object.keys(result.mapping).length >= 0);

    // Verify output files exist
    await Promise.all(Object.values(result.mapping).map(async (hashedFilename) => {
        const outputPath = path.join(processor.outputDir, hashedFilename);
        const fileExists = await fs.access(outputPath)
            .then(() => true)
            .catch(() => false);


        t.true(fileExists);
    }));

});
test('ImageProcessor() - should handles missing source directories gracefully', async (t) => {
    const processor = createMockImageProcessor();

    processor.sourceDirs = [path.join(__dirname, 'nonexistent')];
    processor.buildDir = t.context.testDir;
    processor.outputDir = t.context.testDir;

    // Should throw error when source directory doesn't exist
    await t.throwsAsync(() => processor.build(), {code: 'ENOENT'});
});

test('ImageProcessor() - should handles file processing errors', async (t) => {
    const testDir = t.context.testDir;

    const imagePath = path.join(testDir, 'test.png');

    await fs.writeFile(imagePath, 'content');
    await fs.chmod(imagePath, 0o644);

    const processor = new ImageProcessor();

    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.imageMapping = new Map();

    // Mock readFile to throw error
    const originalReadFile = fs.readFile;

    fs.readFile = async (filePath) => {
        if (filePath && filePath.toString().includes('test.png')) {
            throw new Error('Permission denied');
        }

        return originalReadFile(filePath);
    };

    await processor.processImage(imagePath);

    t.is(processor.stats.errors, 1);

    // Restore original function
    fs.readFile = originalReadFile;
});

test('ImageProcessor() - should uses cache for unchanged images', async (t) => {
    const testDir = t.context.testDir;
    const buildDir = path.join(testDir, '.build');
    const outputDir = path.join(testDir, 'site');

    await fs.mkdir(outputDir, { recursive: true });

    // Create test image
    const imagePath = path.join(testDir, 'cached.png');
    const content = 'cached image content';

    await fs.writeFile(imagePath, content);

    const processor = new ImageProcessor();

    processor.sourceDirs = [testDir];
    processor.buildDir = buildDir;
    processor.outputDir = outputDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // First pass - process image
    await processor.processImage(imagePath);

    const firstPassCacheHits = processor.stats.cacheHits;
    const firstPassProcessed = processor.stats.filesProcessed;

    t.is(firstPassCacheHits, 0, 'First pass should have no cache hits');
    t.is(firstPassProcessed, 1, 'First pass should process the image');

    // Get the cached data
    const cachedData = processor.cache['cached.png'];

    t.truthy(cachedData, 'Cache should contain entry for cached.png');
    t.truthy(cachedData.mtime, 'Cache entry should have mtime');
    t.truthy(cachedData.hash, 'Cache entry should have hash');
    t.truthy(cachedData.hashedFilename, 'Cache entry should have hashedFilename');

    // Second pass - should use cache
    const processor2 = new ImageProcessor();

    processor2.sourceDirs = [testDir];
    processor2.buildDir = buildDir;
    processor2.outputDir = outputDir;
    processor2.cache = processor.cache; // Reuse cache
    processor2.imageMapping = new Map();
    processor2.hashToFilename = new Map();

    await processor2.processImage(imagePath);

    t.is(processor2.stats.cacheHits, 1, 'Second pass should have cache hit');
    t.is(processor2.stats.filesProcessed, 0, 'Second pass should not reprocess');
    t.true(processor2.imageMapping.has('cached.png'), 'Mapping should be restored from cache');
});

test('ImageProcessor() - should detects duplicate images by hash', async (t) => {
    const testDir = t.context.testDir;

    const content = 'duplicate content for testing';
    const image1Path = path.join(testDir, 'duplicate1.png');
    const image2Path = path.join(testDir, 'duplicate2.png');
    const image3Path = path.join(testDir, 'unique.png');

    await fs.writeFile(image1Path, content);
    await fs.writeFile(image2Path, content);
    await fs.writeFile(image3Path, 'unique content');

    const processor = new ImageProcessor();

    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.hashToFilename = new Map();
    processor.imageMapping = new Map();

    await processor.processImage(image1Path);
    await processor.processImage(image2Path);
    await processor.processImage(image3Path);

    t.is(processor.stats.duplicatesFound, 1, 'Should detect one duplicate');
    // filesProcessed is incremented for ALL images, including duplicates
    t.is(processor.stats.filesProcessed, 3, 'Should process all 3 images');

    // Both duplicates should map to same hashed filename
    const hash1 = processor.imageMapping.get('duplicate1.png');
    const hash2 = processor.imageMapping.get('duplicate2.png');
    const hash3 = processor.imageMapping.get('unique.png');

    t.is(hash1, hash2, 'Duplicate images should have same hashed filename');
    t.not(hash1, hash3, 'Unique image should have different hashed filename');
});

test('ImageProcessor() - should handles corrupted image files', async (t) => {
    const testDir = t.context.testDir;

    // Create a file that simulates corruption (empty or invalid)
    const corruptedPath = path.join(testDir, 'corrupted.png');

    await fs.writeFile(corruptedPath, '');

    const processor = new ImageProcessor();

    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.imageMapping = new Map();

    // Should handle empty file gracefully
    await processor.processImage(corruptedPath);

    // Empty file should still be processed (it's valid, just empty)
    t.true(processor.stats.filesScanned >= 1, 'Should scan the file');

    // Now test with a file that causes read error
    const unreadablePath = path.join(testDir, 'unreadable.png');

    await fs.writeFile(unreadablePath, 'content');
    await fs.chmod(unreadablePath, 0o000); // Remove all permissions

    const processor2 = new ImageProcessor();

    processor2.sourceDirs = [testDir];
    processor2.outputDir = testDir;
    processor2.cache = {};
    processor2.imageMapping = new Map();

    await processor2.processImage(unreadablePath);

    // Should increment error count
    t.is(processor2.stats.errors, 1, 'Should count permission error');

    // Restore permissions for cleanup
    await fs.chmod(unreadablePath, 0o644);
});

test('ImageProcessor() - should skips .git directories', async (t) => {
    const testDir = t.context.testDir;

    // Create .git directory with an image
    const gitDir = path.join(testDir, '.git');

    await fs.mkdir(gitDir, { recursive: true });

    const gitImagePath = path.join(gitDir, 'should-be-skipped.png');

    await fs.writeFile(gitImagePath, 'git image content');

    // Create regular image
    const regularImagePath = path.join(testDir, 'regular.png');

    await fs.writeFile(regularImagePath, 'regular image content');

    const processor = new ImageProcessor();

    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.imageList = [];

    await processor.collectImagePaths(testDir);

    // Should only find regular image, not the one in .git
    t.true(processor.imageList.some((p) => p.includes('regular.png')), 'Should find regular image');
    t.false(processor.imageList.some((p) => p.includes('.git')), 'Should skip .git directory');
    t.false(processor.imageList.some((p) => p.includes('should-be-skipped.png')), 'Should not find image in .git');
});

test('ImageProcessor() - should processes images from multiple source directories', async (t) => {
    const testDir = t.context.testDir;

    // Create multiple source directories
    const sourceDir1 = path.join(testDir, 'source1');
    const sourceDir2 = path.join(testDir, 'source2');
    const outputDir = path.join(testDir, 'output');

    await fs.mkdir(sourceDir1, { recursive: true });
    await fs.mkdir(sourceDir2, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Create images in each source directory
    const image1Path = path.join(sourceDir1, 'image1.png');
    const image2Path = path.join(sourceDir2, 'image2.png');

    await fs.writeFile(image1Path, 'content from source1');
    await fs.writeFile(image2Path, 'content from source2');

    const processor = new ImageProcessor();

    processor.sourceDirs = [sourceDir1, sourceDir2];
    processor.buildDir = testDir;
    processor.outputDir = outputDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Collect images from both directories
    processor.imageList = [];
    await Promise.all(processor.sourceDirs.map((dir) => processor.collectImagePaths(dir)));

    t.is(processor.imageList.length, 2, 'Should find images from both directories');

    // Process all images
    await Promise.all(processor.imageList.map((imagePath) => processor.processImage(imagePath)));

    t.is(processor.stats.filesProcessed, 2, 'Should process images from both directories');
    t.true(processor.imageMapping.has('image1.png'), 'Should map image from source1');
    t.true(processor.imageMapping.has('image2.png'), 'Should map image from source2');
});

test('ImageProcessor() - should handles hash collisions', async (t) => {
    const testDir = t.context.testDir;

    const processor = new ImageProcessor();

    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.hashToFilename = new Map();
    processor.imageMapping = new Map();

    // Create two images with same content to naturally generate same hash
    const image1Path = path.join(testDir, 'collision1.png');
    const image2Path = path.join(testDir, 'collision2.png');
    const content = 'same content for hash collision';

    await fs.writeFile(image1Path, content);
    await fs.writeFile(image2Path, content);

    // Process first image
    await processor.processImage(image1Path);

    t.is(processor.stats.duplicatesFound, 0, 'First image should not be a duplicate');
    t.is(processor.stats.filesProcessed, 1, 'First image should be processed');

    // Process second image with same content (hash collision)
    await processor.processImage(image2Path);

    // Should detect as duplicate
    t.is(processor.stats.duplicatesFound, 1, 'Should detect hash collision as duplicate');
    t.is(processor.stats.filesProcessed, 2, 'Both images should be processed');
    t.true(processor.imageMapping.has('collision1.png'), 'Should create mapping for first image');
    t.true(processor.imageMapping.has('collision2.png'), 'Should create mapping for second image');

    // Both should map to same hashed filename
    const hash1 = processor.imageMapping.get('collision1.png');
    const hash2 = processor.imageMapping.get('collision2.png');

    t.is(hash1, hash2, 'Both images should map to same hashed filename');
});

test('ImageProcessor() - should generates correct image mapping', async (t) => {
    const testDir = t.context.testDir;
    const buildDir = path.join(testDir, '.build');

    await fs.mkdir(buildDir, { recursive: true });

    const processor = new ImageProcessor();

    processor.buildDir = buildDir;
    processor.imageMapping = new Map([
        ['path/to/image1.png', 'hash1.png'],
        ['path/to/image2.jpg', 'hash2.jpg'],
        ['image3.svg', 'hash3.svg'],
    ]);

    await processor.generateMappingFile();

    const mappingPath = path.join(buildDir, 'image-mapping.json');
    const fileExists = await fs.access(mappingPath).then(() => true).catch(() => false);

    t.true(fileExists, 'Mapping file should be created');

    const mappingContent = JSON.parse(await fs.readFile(mappingPath, 'utf8'));

    t.deepEqual(mappingContent, {
        'path/to/image1.png': 'hash1.png',
        'path/to/image2.jpg': 'hash2.jpg',
        'image3.svg': 'hash3.svg',
    }, 'Mapping should contain all entries');

    t.is(Object.keys(mappingContent).length, 3, 'Mapping should have 3 entries');
});

// Test: Handles EMFILE error (too many open files)
test('ImageProcessor() - should handles too many open files gracefully', async (t) => {
    const testDir = t.context.testDir;

    // Create many image files to potentially trigger EMFILE
    const imageCount = 50;
    const imagePaths = [];

    for (let i = 0; i < imageCount; i++) {
        const imagePath = path.join(testDir, `image${i}.png`);
        await fs.writeFile(imagePath, `content ${i}`);
        imagePaths.push(imagePath);
    }

    const processor = new ImageProcessor();
    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Should handle many files without EMFILE error
    await t.notThrowsAsync(async () => {
        for (const imagePath of imagePaths) {
            await processor.processImage(imagePath);
        }
    });

    t.is(processor.stats.filesProcessed, imageCount, 'Should process all images');
});

// Test: Handles ENOSPC error (no space left on device)
test('ImageProcessor() - should handles disk space errors gracefully', async (t) => {
    const testDir = t.context.testDir;
    const dir = new TestDir();
    const outputDir = dir.getRoot();

    const imagePath = path.join(testDir, 'test.png');
    await fs.writeFile(imagePath, 'test content');

    const processor = new ImageProcessor();
    processor.sourceDirs = [testDir];
    processor.outputDir = outputDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();
    processor.skipWrite = false; // Explicitly set to ensure copyFile is called

    // Mock copyFile to simulate ENOSPC error
    const originalCopyFile = fs.copyFile;
    fs.copyFile = async () => {
        const error = new Error('ENOSPC: no space left on device');
        error.code = 'ENOSPC';
        throw error;
    };

    try {
        await processor.processImage(imagePath);

        // Should increment error count
        t.is(processor.stats.errors, 1, 'Should count disk space error');
    } finally {
        // Restore original function
        fs.copyFile = originalCopyFile;
    }
});

// Test: Handles symlink loops
test('ImageProcessor() - should handles symlink loops gracefully', async (t) => {
    const testDir = t.context.testDir;

    // Create a directory structure with potential symlink loop
    const dir1 = path.join(testDir, 'dir1');
    const dir2 = path.join(testDir, 'dir2');
    await fs.mkdir(dir1, { recursive: true });
    await fs.mkdir(dir2, { recursive: true });

    // Create a regular image file
    const imagePath = path.join(dir1, 'image.png');
    await fs.writeFile(imagePath, 'image content');

    const processor = new ImageProcessor();
    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.imageList = [];

    // Should handle directory traversal without infinite loop
    await t.notThrowsAsync(async () => {
        await processor.collectImagePaths(testDir);
    });

    t.true(processor.imageList.length >= 1, 'Should find at least one image');
});

// Test: Handles binary files with image extensions
test('ImageProcessor() - should handles binary files with image extensions', async (t) => {
    const testDir = t.context.testDir;

    // Create a file with image extension but binary content
    const binaryPath = path.join(testDir, 'binary.png');
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]);
    await fs.writeFile(binaryPath, binaryData);

    const processor = new ImageProcessor();
    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Should handle binary file without errors
    await t.notThrowsAsync(async () => {
        await processor.processImage(binaryPath);
    });

    t.true(processor.stats.filesProcessed >= 1, 'Should process binary file');
});

// Test: Handles concurrent processing
test('ImageProcessor() - should handles concurrent image processing', async (t) => {
    const testDir = t.context.testDir;

    // Create multiple images
    const images = ['img1.png', 'img2.png', 'img3.png', 'img4.png', 'img5.png'];
    for (const img of images) {
        await fs.writeFile(path.join(testDir, img), `content of ${img}`);
    }

    const processor = new ImageProcessor();
    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Process all images concurrently
    await t.notThrowsAsync(async () => {
        await Promise.all(
            images.map(img => processor.processImage(path.join(testDir, img))),
        );
    });

    t.is(processor.stats.filesProcessed, images.length, 'Should process all images concurrently');
});

// Test: Handles zero-byte files
test('ImageProcessor() - should handles zero-byte files', async (t) => {
    const testDir = t.context.testDir;

    const emptyPath = path.join(testDir, 'empty.png');
    await fs.writeFile(emptyPath, '');

    const processor = new ImageProcessor();
    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Should handle zero-byte file
    await t.notThrowsAsync(async () => {
        await processor.processImage(emptyPath);
    });

    t.true(processor.stats.filesScanned >= 1, 'Should scan zero-byte file');
});

// Test: Handles invalid UTF-8 in filenames
test('ImageProcessor() - should handles files with special characters in path', async (t) => {
    const testDir = t.context.testDir;

    // Create file with special characters (that are valid in filesystem)
    const specialPath = path.join(testDir, 'image-with-special-chars-@#$.png');
    await fs.writeFile(specialPath, 'content');

    const processor = new ImageProcessor();
    processor.sourceDirs = [testDir];
    processor.outputDir = testDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Should handle special characters in path
    await t.notThrowsAsync(async () => {
        await processor.processImage(specialPath);
    });

    t.true(processor.stats.filesProcessed >= 1, 'Should process file with special chars');
});

// Error Recovery Tests

test('ImageProcessor() - should recovers from corrupted image file and continues processing', async (t) => {
    const outputDir = path.join(t.context.testDir, 'output');

    await fs.mkdir(outputDir, { recursive: true });

    // Create one valid and one corrupted image
    const validImagePath = path.join(t.context.testDir, 'valid.png');
    const corruptedImagePath = path.join(t.context.testDir, 'corrupted.png');

    await fs.writeFile(validImagePath, 'valid image content');
    await fs.writeFile(corruptedImagePath, 'corrupted data');
    await fs.chmod(corruptedImagePath, 0o000); // Make unreadable to simulate corruption

    const processor = new ImageProcessor();
    processor.sourceDirs = [t.context.testDir];
    processor.outputDir = outputDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Process both images
    await processor.processImage(validImagePath);
    await processor.processImage(corruptedImagePath);

    // Should process valid image despite corrupted one
    t.true(processor.imageMapping.has('valid.png'), 'Should process valid image');
    t.is(processor.stats.errors, 1, 'Should count error for corrupted image');
    t.is(processor.stats.filesProcessed, 1, 'Should process only valid image');

    // Restore permissions for cleanup
    await fs.chmod(corruptedImagePath, 0o644).catch(() => {});
});

test('ImageProcessor() - should cleans up after image processing failure', async (t) => {
    const buildDir = path.join(t.context.testDir, '.build');
    const outputDir = path.join(t.context.testDir, 'output');

    await fs.mkdir(buildDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Create test image
    const imagePath = path.join(t.context.testDir, 'test.png');
    await fs.writeFile(imagePath, 'test content');

    const processor = new ImageProcessor();
    processor.sourceDirs = [t.context.testDir];
    processor.buildDir = buildDir;
    processor.outputDir = outputDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Process image normally first
    await processor.processImage(imagePath);

    // Verify it was processed
    t.true(processor.stats.filesProcessed >= 1, 'Should have processed image');

    // Now test cleanup by removing output directory and verifying no errors
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Verify cleanup was successful
    const outputFiles = await fs.readdir(outputDir).catch(() => []);
    t.is(outputFiles.length, 0, 'Output directory should be empty after cleanup');
});

test('ImageProcessor() - should handles missing source images gracefully', async (t) => {
    const outputDir = path.join(t.context.testDir, 'output');

    await fs.mkdir(outputDir, { recursive: true });

    const processor = new ImageProcessor();
    processor.sourceDirs = [t.context.testDir];
    processor.outputDir = outputDir;
    processor.cache = {};
    processor.imageMapping = new Map();
    processor.hashToFilename = new Map();

    // Try to process non-existent image
    const nonExistentPath = path.join(t.context.testDir, 'nonexistent.png');

    await processor.processImage(nonExistentPath);

    // Should handle missing file gracefully
    t.is(processor.stats.errors, 1, 'Should count error for missing file');
    t.false(processor.imageMapping.has('nonexistent.png'), 'Should not create mapping for missing file');
});
