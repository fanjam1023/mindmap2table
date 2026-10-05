const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, '.mnaddon-work', 'main.js');
const vendorPath = path.join(root, 'vendor', 'marked-4.3.0.min.js');
const start = '/* BUNDLED_MARKED_4_3_0_START */';
const end = '/* BUNDLED_MARKED_4_3_0_END */';

let source = fs.readFileSync(mainPath, 'utf8');
source = source.replace(/^\/\* BUNDLED_MARKED_[A-Z0-9_]+_START \*\/[\s\S]*?\/\* BUNDLED_MARKED_[A-Z0-9_]+_END \*\/\s*/, '');

const vendor = fs.readFileSync(vendorPath, 'utf8').trim();
fs.writeFileSync(mainPath, `${start}\n${vendor}\n${end}\n${source}`);
console.log(`embedded Marked 4.3.0 into ${mainPath}`);
