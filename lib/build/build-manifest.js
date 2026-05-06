const { Dir } = require('../utils/dir');
const Manifest = require('../utils/manifest');

class ManifestBuilder {
    constructor(dir = Dir) {
        this.dir = dir;
    }

    async generate() {
        const siteDir = this.dir.getSite();
        return Manifest.generate(siteDir);
    }
}

module.exports = { ManifestBuilder };

if (require.main === module) {
    const builder = new ManifestBuilder();
    builder.generate()
        .then(manifest => {
            const count = Object.keys(manifest).length;
            console.log(`Generated manifest.json with ${count} file hashes`);
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
