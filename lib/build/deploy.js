#!/usr/bin/env node

const FTP = require('./ftp');

async function main() {
    const args = process.argv.slice(2);
    const options = {
        force: args.includes('--force'),
        verbose: args.includes('--verbose'),
        dryRun: args.includes('--dry-run'),
        progress: !args.includes('--quiet'),
        compactProgress: args.includes('--compact'),
        batchSize: 30,
    };

    // Parse custom batch size if provided
    const batchSizeIndex = args.indexOf('--batch-size');
    if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
        const size = parseInt(args[batchSizeIndex + 1]);
        if (!isNaN(size) && size > 0) {
            options.batchSize = size;
        }
    }

    const ftp = new FTP();

    try {
        await ftp.deploy(options);
        process.exit(0);
    } catch (err) {
        console.error('Deployment failed:', err.message);
        process.exit(1);
    }
}

main();
