#!/usr/bin/env node

const FTP = require('./ftp');

async function main() {
    const args = process.argv.slice(2);
    const options = {
        force: args.includes('--force'),
        dryRun: args.includes('--dry-run'),
        progress: !args.includes('--quiet'),
    };

    const ftp = new FTP();

    try {
        await ftp.deploy({
            force: options.force,
            dryRun: options.dryRun,
            progress: options.progress,
            verbose: options.verbose,
        });
        process.exit(0);
    } catch (err) {
        console.error('Deployment failed:', err.message);
        process.exit(1);
    }
}

main();
