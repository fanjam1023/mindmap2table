const assert=require('assert'),fs=require('fs'),path=require('path');
let harness=fs.readFileSync(path.join(__dirname,'regression-v3.9.0.js'),'utf8').split('const opaqueNativeArray')[0];
harness=harness.replace("' renderExcerpt: renderExcerpt,'","' cleanExportHtml:cleanExportHtml, getCardContentModel:getCardContentModel, renderExcerpt: renderExcerpt,'");
const out={exports:{}};new Function('require','__dirname','module',harness+'\nmodule.exports={api,context,notes,media};')(require,__dirname,out);
const {api,context,notes,media}=out.exports;
function png(width,height,tag){const header=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(header);header.writeUInt32BE(width,16);header.writeUInt32BE(height,20);return {base64Encoding:()=>Buffer.concat([header,Buffer.from(tag)]).toString('base64')};}
media.OVERLAY_BASE=png(903,566,'BASE');media.OVERLAY_INK=png(604,379,'BLUE_INK');
const source={noteId:'INK_SOURCE',excerptPic:{paint:'OVERLAY_BASE',drawing:'OVERLAY_INK'},comments:[],childNotes:[]};
notes.INK_SOURCE=source;
const reference={noteId:'INK_REFERENCE',originNoteId:'INK_SOURCE',excerptPic:{paint:'OVERLAY_BASE'},excerptText:'OCR不应覆盖图片',comments:[],childNotes:[]};
for(const card of [source,reference])for(const mode of ['merge','titlecontent'])for(const child of [false,true]){
 const roots=child?[{noteId:'PARENT',noteTitle:'父节点',comments:[],childNotes:[card]}]:[card];
 const build=mode==='merge'?api.buildHtmlTable:api.buildTitleContentTable;
 const html=build(roots,false).split('<script')[0];
 assert.strictEqual((html.match(/<img/g)||[]).length,1,'ink must resize with the base image');
 const svg=decodeURIComponent(/src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/.exec(html)[1]);
 assert(svg.includes('viewBox="0 0 903 566"'));
 assert(svg.indexOf(media.OVERLAY_BASE.base64Encoding())<svg.indexOf(media.OVERLAY_INK.base64Encoding()));
 assert(html.includes('data-paint="OVERLAY_BASE"'));assert(html.includes('class="img-resizer"'));assert(!html.includes('OCR不应覆盖图片'));
 const exported=api.cleanExportHtml(html);
 assert(exported.includes('data:image/svg+xml;charset=utf-8,'));
 assert(!exported.includes('class="img-resizer"'));
 const q=[];context.NSTimer.scheduledTimerWithTimeInterval=(delay,repeat,fn)=>{const t={invalidate(){this.cancelled=true;}};q.push(()=>{if(!t.cancelled)fn();});return t;};
 let generated='';api.createTableTask(roots,mode,false,{isSyncWidth:true,showBreadcrumb:false,savedWidthMap:{},savedNodeWidthMap:{},savedImgHash:{},savedImageMap:{}},()=>{},value=>{generated=value;},error=>{throw error;});while(q.length)q.shift()();assert.strictEqual(generated.split('<script')[0],html);
}
// Native NSDictionary fields and multi-hop references resolve only matching excerpts.
const dictionary=v=>({objectForKey:key=>v[key]});
notes.NATIVE_SOURCE={...source,noteId:'NATIVE_SOURCE',excerptPic:dictionary({paint:'OVERLAY_BASE',drawing:'OVERLAY_INK'})};
assert(api.getCardContentModel({...reference,noteId:'NATIVE_REF',originNoteId:'NATIVE_SOURCE'}).blocks[0].layers);
notes.OTHER_SOURCE={...source,noteId:'OTHER_SOURCE',excerptPic:{paint:'UNRELATED_BASE',drawing:'OVERLAY_INK'}};
assert(!api.getCardContentModel({...reference,noteId:'MISMATCH',originNoteId:'OTHER_SOURCE'}).blocks[0].layers);
notes.CYCLE_A={noteId:'CYCLE_A',originNoteId:'CYCLE_B'};notes.CYCLE_B={noteId:'CYCLE_B',originNoteId:'CYCLE_A'};
assert(!api.getCardContentModel({...reference,noteId:'CYCLE',originNoteId:'CYCLE_A'}).blocks[0].layers);
// Unreadable ink retains the base image with a visible warning.
const missing=api.getCardContentModel({...source,noteId:'MISSING_INK',excerptPic:{paint:'OVERLAY_BASE',drawing:'NO_INK'}});
assert.strictEqual(missing.blocks[0].value,media.OVERLAY_BASE.base64Encoding());assert(missing.warnings.includes('手写笔记无法读取，请回源查看'));
// OCR/text-first still bypasses image and drawing work.
assert.deepStrictEqual(Array.from(api.getCardContentModel({...reference,noteId:'TEXT_FIRST',textFirst:true}).blocks,b=>b.kind),['text']);
console.log('4.2.2 excerpt ink overlay: PASS (source/reference, dictionary, geometry, one resizable image, both modes/root/child, batched parity, mismatch/cycle protection, unreadable-ink fallback, text-first)');
