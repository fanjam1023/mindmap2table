const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, '.mnaddon-work', 'main.js');
const vendorPath = path.join(root, 'vendor', 'mathjax-3.2.2-tex-svg-full.js');
const start = '/* BUNDLED_MATHJAX_3_2_2_START */';
const end = '/* BUNDLED_MATHJAX_3_2_2_END */';
const markedEnd = '/* BUNDLED_MARKED_4_3_0_END */';

let source = fs.readFileSync(mainPath, 'utf8');
source = source.replace(/\/\* BUNDLED_MATHJAX_[A-Z0-9_]+_START \*\/[\s\S]*?\/\* BUNDLED_MATHJAX_[A-Z0-9_]+_END \*\/\s*/, '');

const vendor = fs.readFileSync(vendorPath, 'utf8').trim().replace(/<\/script/gi, '<\\/script');
const embedded = `${start}\nvar MomoMathJaxSource = ${JSON.stringify(vendor)};\n${end}`;
const markerIndex = source.indexOf(markedEnd);
if (markerIndex < 0) throw new Error('Marked bundle marker not found');
const insertAt = markerIndex + markedEnd.length;
source = source.slice(0, insertAt) + `\n${embedded}` + source.slice(insertAt);

fs.writeFileSync(mainPath, source);
console.log(`embedded MathJax 3.2.2 tex-svg-full into ${mainPath}`);
