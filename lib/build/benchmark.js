#!/usr/bin/env node

// Development utility for benchmarking build performance
// This file is not covered by tests as it's only used for manual performance analysis

/**
 * Build Performance Benchmark Script
 *
 * Measures and reports performance metrics for the build system.
 * Identifies bottlenecks and tracks performance over time.
 *
 * Usage:
 *   node scripts/benchmark.js              # Full benchmark
 *   node scripts/benchmark.js --nav       # Navigation generation only
 *   node scripts/benchmark.js --html      # HTML generation only
 *   node scripts/benchmark.js --css       # CSS generation only
 *   node scripts/benchmark.js --compare   # Compare with previous results
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

// Import build modules
const { SitemapBuilder } = require('./build-sitemap');
const { HTMLBuilder } = require('./build-html');
const CSSBuilder = require('./build-css');

/**
 * Benchmark result structure
 */
class BenchmarkResult {
    constructor(name) {
        this.name = name;
        this.startTime = 0;
        this.endTime = 0;
        this.memoryBefore = 0;
        this.memoryAfter = 0;
        this.metadata = {};
    }

    start() {
        this.startTime = performance.now();
        this.memoryBefore = process.memoryUsage();
    }

    end(metadata = {}) {
        this.endTime = performance.now();
        this.memoryAfter = process.memoryUsage();
        this.metadata = metadata;
    }

    get duration() {
        return this.endTime - this.startTime;
    }

    get memoryDelta() {
        const after = this.memoryAfter;
        const before = this.memoryBefore;

        return {
            rss: after.rss - before.rss,
            heapUsed: after.heapUsed - before.heapUsed,
            heapTotal: after.heapTotal - before.heapTotal,
            external: after.external - before.external,
        };
    }

    toJSON() {
        return {
            name: this.name,
            duration: Math.round(this.duration * 100) / 100,
            memory: {
                before: this.memoryBefore,
                after: this.memoryAfter,
                delta: this.memoryDelta,
            },
            metadata: this.metadata,
        };
    }
}

/**
 * Benchmark navigation generation
 */
async function benchmarkNavigation() {
    const result = new BenchmarkResult('Navigation Generation');
    result.start();

    const builder = new SitemapBuilder({ skipWrite: true });
    const navResult = await builder.build();

    result.end({
        pagesCount: Object.keys(navResult.pages).length,
        sitemapSize: navResult.sitemap.length,
    });

    return result;
}

/**
 * Benchmark HTML generation
 */
async function benchmarkHtml() {
    const result = new BenchmarkResult('HTML Generation');
    result.start();

    // First generate navigation for HTML build
    const sitemapBuilder = new SitemapBuilder({ skipWrite: true });
    const navResult = await sitemapBuilder.build();

    // Then benchmark HTML generation using HTMLBuilder
    const htmlBuilder = new HTMLBuilder({
        sitemap: navResult,
        skipWrite: true,
    });
    const htmlResult = await htmlBuilder.build();

    result.end({
        pagesProcessed: htmlResult.pagesProcessed || 0,
        fileSize: htmlResult.totalSize || 0,
    });

    return result;
}

/**
 * Benchmark CSS generation
 */
async function benchmarkCss() {
    const result = new BenchmarkResult('CSS Generation');
    result.start();

    const builder = new CSSBuilder('page');
    const cssResult = await builder.build();

    result.end({
        filesProcessed: 1, // CSSBuilder processes one bundle
        fileSize: cssResult.css ? cssResult.css.length : 0,
        hash: cssResult.hash,
    });

    return result;
}

/**
 * Run full benchmark suite
 */
async function runFullBenchmark() {
    console.log('Starting build performance benchmark...\n');

    const results = [];

    // Benchmark navigation generation
    console.log('Benchmarking navigation generation...');
    const navResult = await benchmarkNavigation();
    results.push(navResult);
    console.log(`   Completed in ${navResult.duration.toFixed(2)}ms\n`);

    // Benchmark CSS generation
    console.log('Benchmarking CSS generation...');
    const cssResult = await benchmarkCss();
    results.push(cssResult);
    console.log(`   Completed in ${cssResult.duration.toFixed(2)}ms\n`);

    // Benchmark HTML generation
    console.log('Benchmarking HTML generation...');
    const htmlResult = await benchmarkHtml();
    results.push(htmlResult);
    console.log(`   Completed in ${htmlResult.duration.toFixed(2)}ms\n`);

    return results;
}

/**
 * Save benchmark results to file
 */
async function saveResults(results, filename = 'benchmark-results.json') {
    const resultsPath = path.join(process.cwd(), '.build', filename);

    // Ensure .build directory exists
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });

    const data = {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        results: results.map(r => r.toJSON()),
        summary: {
            totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
            averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
            slowest: results.reduce((max, r) => r.duration > max.duration ? r : max, results[0]),
            fastest: results.reduce((min, r) => r.duration < min.duration ? r : min, results[0]),
        },
    };

    await fs.writeFile(resultsPath, JSON.stringify(data, null, 2));
    return resultsPath;
}

/**
 * Load previous benchmark results for comparison
 */
async function loadPreviousResults(filename = 'benchmark-results.json') {
    try {
        const resultsPath = path.join(process.cwd(), '.build', filename);
        const data = await fs.readFile(resultsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

/**
 * Compare current results with previous results
 */
function compareResults(current, previous) {
    console.log('Performance Comparison:\n');

    const currentMap = new Map(current.results.map(r => [r.name, r]));
    const previousMap = new Map(previous.results.map(r => [r.name, r]));

    for (const [name, currentResult] of currentMap) {
        const previousResult = previousMap.get(name);

        if (previousResult) {
            const diff = currentResult.duration - previousResult.duration;
            const percentChange = (diff / previousResult.duration) * 100;
            const arrow = diff > 0 ? '📈' : '📉';

            console.log(`${name}:`);
            console.log(`  Current:  ${currentResult.duration.toFixed(2)}ms`);
            console.log(`  Previous: ${previousResult.duration.toFixed(2)}ms`);
            const sign = diff > 0 ? '+' : '';
            const percentSign = percentChange > 0 ? '+' : '';
            const changeStr = `${arrow} ${sign}${diff.toFixed(2)}ms (${percentSign}${percentChange.toFixed(1)}%)`;
            console.log(`  Change:   ${changeStr}\n`);
        } else {
            console.log(`${name}: New benchmark (${currentResult.duration.toFixed(2)}ms)\n`);
        }
    }
}

/**
 * Print benchmark results
 */
function printResults(results) {
    console.log('Benchmark Results:\n');

    results.forEach(result => {
        console.log(`${result.name}:`);
        console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
        console.log(`  Memory: +${(result.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB heap`);

        if (Object.keys(result.metadata).length > 0) {
            console.log('  Metadata:');
            Object.entries(result.metadata).forEach(([key, value]) => {
                console.log(`    ${key}: ${value}`);
            });
        }
        console.log();
    });

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`Total build time: ${totalDuration.toFixed(2)}ms`);
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    const compareMode = args.includes('--compare');
    const specificBenchmark = args.find(arg => arg.startsWith('--'))?.replace('--', '');

    let results = [];

    try {
        switch (specificBenchmark) {
        case 'nav':
            results.push(await benchmarkNavigation());
            break;
        case 'html':
            results.push(await benchmarkHtml());
            break;
        case 'css':
            results.push(await benchmarkCss());
            break;
        default:
            results = await runFullBenchmark();
        }

        printResults(results);

        // Save current results
        const resultsPath = await saveResults(results);
        console.log(`Results saved to: ${resultsPath}\n`);

        // Compare with previous results if requested
        if (compareMode) {
            const previousResults = await loadPreviousResults();
            if (previousResults) {
                compareResults({ results }, previousResults);
            } else {
                console.log('  No previous results found for comparison');
            }
        }

        // Performance recommendations
        console.log('💡 Performance Recommendations:');

        const slowest = results.reduce((max, r) => r.duration > max.duration ? r : max, results[0]);
        if (slowest.duration > 1000) {
            console.log(`    ${slowest.name} is slow (${slowest.duration.toFixed(2)}ms) - consider optimization`);
        }

        const totalMemory = results.reduce((sum, r) => sum + r.memoryDelta.heapUsed, 0);
        if (totalMemory > 100 * 1024 * 1024) { // 100MB
            console.log(`    High memory usage (${(totalMemory / 1024 / 1024).toFixed(2)}MB) - check for memory leaks`);
        }

        console.log('\n Benchmark completed successfully!');

    } catch (error) {
        console.error(' Benchmark failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    BenchmarkResult,
    benchmarkNavigation,
    benchmarkHtml,
    benchmarkCss,
    runFullBenchmark,
    saveResults,
    loadPreviousResults,
    compareResults,
};
