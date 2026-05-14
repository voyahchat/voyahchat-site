#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Dir } = require('../utils/dir');
const FTP = require('./ftp');

async function fixTimestamps() {
    const siteDir = Dir.getSite();
    const ftp = new FTP();

    ftp.loadConfig();
    await ftp.initClient();
    console.log(`Connected to: ${ftp.config.host}`);

    // Collect local files and their mtimes
    const files = [];
    const walk = (dir, base = '') => {
        for (const item of fs.readdirSync(dir)) {
            const full = path.join(dir, item);
            const rel = path.join(base, item).replace(/\\/g, '/');
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walk(full, rel);
            } else {
                files.push({ local: full, remote: rel, mtime: stat.mtime });
            }
        }
    };
    walk(siteDir);

    console.log(`Processing ${files.length} files...`);

    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const { remote, mtime } = files[i];
        const ts = mtime.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '');

        try {
            await ftp.client.send(`MFMT ${ts} ${remote}`);
            fixed++;
        } catch {
            failed++;
        }

        if ((i + 1) % 100 === 0 || i === files.length - 1) {
            process.stdout.write(`\r${i + 1}/${files.length} (fixed: ${fixed}, failed: ${failed})`);
        }
    }

    console.log(`\n\nDone. Fixed: ${fixed}, Failed: ${failed}`);

    ftp.client.close();
}

fixTimestamps().catch(err => {
    console.error(err.message);
    process.exit(1);
});
