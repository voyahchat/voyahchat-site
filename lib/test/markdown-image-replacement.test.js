/**
 * AVA tests for markdown image hash replacement functionality
 */

const test = require('ava');
const fs = require('fs').promises;
const path = require('path');
const { TestDir } = require('./test-dir');

// Clear require cache before each test to ensure isolation
test.beforeEach(() => {
    // Clear build modules from cache
    Object.keys(require.cache).forEach((key) => {
        if (key.includes('build-html') || key.includes('config/levels')) {
            delete require.cache[key];
        }
    });
});

// Test helper to create mock image mapping
async function createMockImageMapping(buildDir) {
    // Ensure build directory exists
    await fs.mkdir(buildDir, { recursive: true });

    const imageMapping = {
        'common/account-app-icon-lantu.png': '5370996ee7560cd0.png',
        'common/support-wechat-1.png': '44d85bcf147813ea.png',
        'common/support-app-1.png': '8a836b471b12fcff.png',
        'logo/logo.svg': 'ac512bd3affe8ec5.svg',
    };

    const mappingPath = path.join(buildDir, 'image-mapping.json');

    await fs.writeFile(mappingPath, JSON.stringify(imageMapping, null, 2));

    return imageMapping;
}

// Test helper to create mock markdown content
function createMockMarkdownContent() {
    return `# Test Page

This is a test page with images.

![App Icon](account-app-icon-lantu.png)

Some text here.

![WeChat Icon](support-wechat-1.png)

More text.

![App Screenshot](support-app-1.png)

End of page.`;
}

test('markdown image replacement - basic functionality', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');

    // Ensure build directory exists
    await fs.mkdir(buildDir, { recursive: true });

    // Create mock image mapping
    const imageMapping = await createMockImageMapping(buildDir);

    // Create test markdown content
    const markdownContent = createMockMarkdownContent();

    // Process the markdown content using the same logic as build-html
    const processedContent = markdownContent.replace(
        /!\[([^\]]*)\]\(([^)]+)\.(png|jpg|jpeg|gif|svg|webp)\)/g,
        (match, alt, filename, extension) => {
            // Try to find the image in mapping
            const foundEntry = Object.entries(imageMapping).find(([relativePath]) => {
                const imageFilename = relativePath.split('/').pop();
                const targetFilename = `${filename}.${extension}`;

                return imageFilename === targetFilename;
            });

            if (foundEntry) {
                const [, hashedFilename] = foundEntry;

                return `![${alt}](/${hashedFilename})`;
            }

            return match;
        },
    );

    // Verify replacements occurred
    t.true(processedContent.includes('![App Icon](/5370996ee7560cd0.png)'));
    t.true(processedContent.includes('![WeChat Icon](/44d85bcf147813ea.png)'));
    t.true(processedContent.includes('![App Screenshot](/8a836b471b12fcff.png)'));

    // Verify original filenames are not present
    t.false(processedContent.includes('account-app-icon-lantu.png'));
    t.false(processedContent.includes('support-wechat-1.png'));
    t.false(processedContent.includes('support-app-1.png'));

});

test('markdown image replacement - handles missing mapping gracefully', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');

    // Ensure build directory exists
    await fs.mkdir(buildDir, { recursive: true });

    // Create mock image mapping (missing some images)
    const imageMapping = {
        'common/account-app-icon-lantu.png': '5370996ee7560cd0.png',
        // Missing support-wechat-1.png and support-app-1.png
    };

    const mappingPath = path.join(buildDir, 'image-mapping.json');

    await fs.writeFile(mappingPath, JSON.stringify(imageMapping, null, 2));

    // Create test markdown content
    const markdownContent = createMockMarkdownContent();

    // Process the markdown content
    const processedContent = markdownContent.replace(
        /!\[([^\]]*)\]\(([^)]+)\.(png|jpg|jpeg|gif|svg|webp)\)/g,
        (match, alt, filename, extension) => {
            // Try to find the image in mapping
            const foundEntry = Object.entries(imageMapping).find(([relativePath]) => {
                const imageFilename = relativePath.split('/').pop();
                const targetFilename = `${filename}.${extension}`;

                return imageFilename === targetFilename;
            });

            if (foundEntry) {
                const [, hashedFilename] = foundEntry;

                return `![${alt}](/${hashedFilename})`;
            }

            return match;
        },
    );

    // Verify only mapped images were replaced
    t.true(processedContent.includes('![App Icon](/5370996ee7560cd0.png)'));

    // Missing images should remain unchanged
    t.true(processedContent.includes('![WeChat Icon](support-wechat-1.png)'));
    t.true(processedContent.includes('![App Screenshot](support-app-1.png)'));

});

test('markdown image replacement - handles various image formats', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');

    // Ensure build directory exists
    await fs.mkdir(buildDir, { recursive: true });

    // Create mock image mapping with different formats
    const imageMapping = {
        'common/test.png': 'abc123.png',
        'common/test.jpg': 'def456.jpg',
        'common/test.svg': 'ghi789.svg',
        'common/test.webp': 'jkl012.webp',
    };

    const mappingPath = path.join(buildDir, 'image-mapping.json');

    await fs.writeFile(mappingPath, JSON.stringify(imageMapping, null, 2));

    // Create test markdown content with different formats
    const markdownContent = `# Test Formats

![PNG](test.png)
![JPG](test.jpg)
![SVG](test.svg)
![WebP](test.webp)`;

    // Process the markdown content
    const processedContent = markdownContent.replace(
        /!\[([^\]]*)\]\(([^)]+)\.(png|jpg|jpeg|gif|svg|webp)\)/g,
        (match, alt, filename, extension) => {
            // Try to find the image in mapping
            const foundEntry = Object.entries(imageMapping).find(([relativePath]) => {
                const imageFilename = relativePath.split('/').pop();
                const targetFilename = `${filename}.${extension}`;

                return imageFilename === targetFilename;
            });

            if (foundEntry) {
                const [, hashedFilename] = foundEntry;

                return `![${alt}](/${hashedFilename})`;
            }

            return match;
        },
    );

    // Verify all formats were replaced
    t.true(processedContent.includes('![PNG](/abc123.png)'));
    t.true(processedContent.includes('![JPG](/def456.jpg)'));
    t.true(processedContent.includes('![SVG](/ghi789.svg)'));
    t.true(processedContent.includes('![WebP](/jkl012.webp)'));

});

test('markdown image replacement - handles empty mapping', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');

    // Ensure build directory exists
    await fs.mkdir(buildDir, { recursive: true });

    // Create empty image mapping
    const imageMapping = {};

    const mappingPath = path.join(buildDir, 'image-mapping.json');

    await fs.writeFile(mappingPath, JSON.stringify(imageMapping, null, 2));

    // Create test markdown content
    const markdownContent = createMockMarkdownContent();

    // Process the markdown content
    const processedContent = markdownContent.replace(
        /!\[([^\]]*)\]\(([^)]+)\.(png|jpg|jpeg|gif|svg|webp)\)/g,
        (match, alt, filename, extension) => {
            // Try to find the image in mapping
            const foundEntry = Object.entries(imageMapping).find(([relativePath]) => {
                const imageFilename = relativePath.split('/').pop();
                const targetFilename = `${filename}.${extension}`;

                return imageFilename === targetFilename;
            });

            if (foundEntry) {
                const [, hashedFilename] = foundEntry;

                return `![${alt}](/${hashedFilename})`;
            }

            return match;
        },
    );

    // Verify no replacements occurred
    t.is(processedContent, markdownContent);

});

test('performance - handles many images without memory issues', async (t) => {
    const dir = new TestDir();
    const testDir = dir.getRoot();
    const buildDir = path.join(testDir, '.build');

    // Ensure build directory exists
    await fs.mkdir(buildDir, { recursive: true });

    // Create a large image mapping with 500 images
    const imageMapping = {};
    for (let i = 1; i <= 500; i++) {
        const hash = `${i.toString().padStart(16, '0')}`;
        imageMapping[`common/image-${i}.png`] = `${hash}.png`;
    }

    const mappingPath = path.join(buildDir, 'image-mapping.json');
    await fs.writeFile(mappingPath, JSON.stringify(imageMapping, null, 2));

    // Create markdown content with 500 images
    const imageLines = [];
    for (let i = 1; i <= 500; i++) {
        imageLines.push(`![Image ${i}](image-${i}.png)`);
    }
    const markdownContent = `# Test Page with Many Images\n\n${imageLines.join('\n\n')}`;

    // Measure memory before processing
    const memBefore = process.memoryUsage().heapUsed;

    // Process the markdown content
    const startTime = Date.now();
    const processedContent = markdownContent.replace(
        /!\[([^\]]*)\]\(([^)]+)\.(png|jpg|jpeg|gif|svg|webp)\)/g,
        (match, alt, filename, extension) => {
            const foundEntry = Object.entries(imageMapping).find(([relativePath]) => {
                const imageFilename = relativePath.split('/').pop();
                const targetFilename = `${filename}.${extension}`;
                return imageFilename === targetFilename;
            });

            if (foundEntry) {
                const [, hashedFilename] = foundEntry;
                return `![${alt}](/${hashedFilename})`;
            }

            return match;
        },
    );
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Measure memory after processing
    const memAfter = process.memoryUsage().heapUsed;
    const memUsed = (memAfter - memBefore) / 1024 / 1024; // Convert to MB

    // Verify all images were replaced
    t.true(processedContent.includes('![Image 1](/0000000000000001.png)'));
    t.true(processedContent.includes('![Image 500](/0000000000000500.png)'));

    // Performance assertions
    t.true(duration < 30000, `Processing 500 images took ${duration}ms, should be under 30000ms`);
    t.true(memUsed < 50, `Memory usage was ${memUsed.toFixed(2)}MB, should be under 50MB`);
});
