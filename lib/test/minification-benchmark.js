/**
 * Benchmark script to measure HTML minification improvements
 * Compares file sizes before and after minification optimizations
 */

const fs = require('fs').promises;
const path = require('path');

async function measureSiteSize() {
    const siteDir = path.join(__dirname, '../../site');

    try {
        const files = await fs.readdir(siteDir);
        const htmlFiles = files.filter(f => f.endsWith('.html'));

        let totalSize = 0;
        let fileCount = 0;
        const fileSizes = [];

        for (const file of htmlFiles) {
            const filePath = path.join(siteDir, file);
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf8');

            // Count optimizations in article content only
            const articleMatch = content.match(/<div class="article[^"]*">(.*?)<\/div>/s);
            const articleContent = articleMatch ? articleMatch[1] : '';
            const hasWhitespace = articleContent.includes('>\n<') || articleContent.includes('>  <');
            const theadClose = (content.match(/<\/thead>/g) || []).length;
            const tbodyClose = (content.match(/<\/tbody>/g) || []).length;
            const trClose = (content.match(/<\/tr>/g) || []).length;
            const thClose = (content.match(/<\/th>/g) || []).length;
            const tdClose = (content.match(/<\/td>/g) || []).length;

            fileSizes.push({
                file,
                size: stats.size,
                hasWhitespace,
                tableOptimizations: {
                    thead: theadClose,
                    tbody: tbodyClose,
                    tr: trClose,
                    th: thClose,
                    td: tdClose,
                },
            });

            totalSize += stats.size;
            fileCount++;
        }

        // Sort by size descending
        fileSizes.sort((a, b) => b.size - a.size);

        console.log('\n=== HTML Minification Benchmark ===\n');
        console.log(`Total HTML files: ${fileCount}`);
        console.log(`Total size: ${(totalSize / 1024).toFixed(2)} KB`);
        console.log(`Average size: ${(totalSize / fileCount / 1024).toFixed(2)} KB\n`);

        console.log('Top 10 largest files:');
        fileSizes.slice(0, 10).forEach((item, idx) => {
            console.log(`${idx + 1}. ${item.file}: ${(item.size / 1024).toFixed(2)} KB`);
            console.log(`   Whitespace: ${item.hasWhitespace ? '❌ Found' : '✅ Removed'}`);
            console.log(`   Table tags: thead=${item.tableOptimizations.thead}, ` +
                `tbody=${item.tableOptimizations.tbody}, tr=${item.tableOptimizations.tr}`);
        });

        // Check optimization coverage
        const filesWithWhitespace = fileSizes.filter(f => f.hasWhitespace).length;
        const filesWithTableTags = fileSizes.filter(f =>
            f.tableOptimizations.thead > 0 || f.tableOptimizations.tbody > 0).length;

        console.log('\n=== Optimization Coverage ===');
        const whitespacePercent = ((fileCount - filesWithWhitespace) / fileCount * 100).toFixed(1);
        console.log(`Files with whitespace removed: ${fileCount - filesWithWhitespace}/` +
            `${fileCount} (${whitespacePercent}%)`);
        const tablePercent = ((fileCount - filesWithTableTags) / fileCount * 100).toFixed(1);
        console.log(`Files with table optimizations: ${fileCount - filesWithTableTags}/` +
            `${fileCount} (${tablePercent}%)`);

        // Estimate savings
        // Assume each whitespace removal saves ~2 bytes per occurrence
        // Assume each table tag removal saves ~8 bytes
        let estimatedWhitespaceSavings = 0;
        let estimatedTableSavings = 0;

        fileSizes.forEach(item => {
            if (!item.hasWhitespace) {
                // Estimate based on file size - larger files likely had more whitespace
                estimatedWhitespaceSavings += Math.floor(item.size * 0.02); // ~2% savings
            }

            // Count removed table tags (assuming most were removed)
            const removedTags =
                (item.tableOptimizations.thead === 0 ? 1 : 0) +
                (item.tableOptimizations.tbody === 0 ? 1 : 0) +
                Math.max(0, 2 - item.tableOptimizations.tr) +
                Math.max(0, 2 - item.tableOptimizations.th) +
                Math.max(0, 2 - item.tableOptimizations.td);

            estimatedTableSavings += removedTags * 8;
        });

        const totalEstimatedSavings = estimatedWhitespaceSavings + estimatedTableSavings;

        console.log('\n=== Estimated Savings ===');
        console.log(`Whitespace removal: ~${(estimatedWhitespaceSavings / 1024).toFixed(2)} KB`);
        console.log(`Table tag removal: ~${(estimatedTableSavings / 1024).toFixed(2)} KB`);
        const savingsPercent = (totalEstimatedSavings / totalSize * 100).toFixed(1);
        console.log(`Total estimated savings: ~${(totalEstimatedSavings / 1024).toFixed(2)} KB ` +
            `(${savingsPercent}%)`);
        const optimizedSize = ((totalSize - totalEstimatedSavings) / 1024).toFixed(2);
        console.log(`\nOptimized total size: ~${optimizedSize} KB\n`);

    } catch (error) {
        console.error('Error measuring site size:', error);
        process.exit(1);
    }
}

// Run benchmark
measureSiteSize().catch(console.error);
