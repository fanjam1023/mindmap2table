const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let harness = fs.readFileSync(path.join(__dirname, 'regression-v3.9.0.js'), 'utf8').split('const opaqueNativeArray')[0];
harness = harness.replace("' renderExcerpt: renderExcerpt,'", "' getCardContentModel:getCardContentModel, renderExcerpt: renderExcerpt,'");
const exported = {exports: {}};
new Function('require', '__dirname', 'module', harness + '\nmodule.exports={api,context,notes,media,fakePng};')(require, __dirname, exported);
const {api, context, notes, media, fakePng} = exported.exports;
const png = 'MERGED_TEXT_FIRST';
media[png] = fakePng(png);
const link = (textFirst, text) => ({type:'LinkNote', textFirst, q_htext:text, q_hpic:{paint:png}, noteid:'UNNEEDED_TARGET'});
const dictionary = value => ({objectForKey:key => value[key]});
const card = {noteId:'MERGED_OCR', noteTitle:'', textFirst:true, excerptText:'首段文字', excerptPic:{paint:png}, childNotes:[], comments:[
  link(true,'第二段文字'), link(1,'第三段文字'), dictionary(link('1','第四段文字')),
  {type:'TextNote', text:'最后的评论'}
]};
// All merged excerpts honor their own saved preference, including native dictionaries.
assert.deepStrictEqual(Array.from(api.getCardContentModel(card).blocks, b => [b.kind,b.value]),
  ['首段文字','第二段文字','第三段文字','第四段文字','最后的评论'].map(text => ['text',text]));
// JSON comment lists use the same path as native/ordinary arrays.
const jsonCard = {...card, comments:JSON.stringify([link(true,'JSON评论文字')])};
assert.deepStrictEqual(Array.from(api.getCardContentModel(jsonCard).blocks, b => b.kind), ['text','text']);
// Do not infer text-first from q_htext or inherit it from the primary excerpt.
for (const preference of [false,0,'0',undefined]) {
  const model = api.getCardContentModel({...card, comments:[link(preference,'隐藏OCR文字')]});
  assert.strictEqual(model.blocks[1].kind,'image');
  assert(!model.blocks.some(b => b.value === '隐藏OCR文字'));
}
// An explicitly text-first comment with no cached text reads its own source text.
notes.ASSOCIATED_TEXT = {noteId:'ASSOCIATED_TEXT', excerptText:'关联摘录完整文字', textFirst:false};
const uncached = {...link(true,'  '), noteid:'ASSOCIATED_TEXT'};
assert.strictEqual(api.getCardContentModel({...card, comments:[uncached]}).blocks[1].value,'关联摘录完整文字');
// If no readable text exists, retain the image rather than emit an empty block.
notes.NO_TEXT = {noteId:'NO_TEXT', excerptText:'  '};
assert.strictEqual(api.getCardContentModel({...card, comments:[{...link(true,''),noteid:'NO_TEXT'}]}).blocks[1].kind,'image');
// Explicit equal sources remain ordered, and the surrounding image remains an image.
const mixed = {...card, comments:[link(true,'重复文字'),link(false,'隐藏OCR文字'),link(true,'重复文字'),{type:'TextNote',text:'末尾'}]};
for (const mode of ['merge','titlecontent']) for (const child of [false,true]) {
  const roots = child ? [{noteId:'PARENT',noteTitle:'父节点',childNotes:[mixed],comments:[]}] : [mixed];
  const build = mode === 'merge' ? api.buildHtmlTable : api.buildTitleContentTable;
  const html = build(roots,false).split('<script')[0];
  assert.strictEqual((html.match(/重复文字/g)||[]).length,2);
  assert.strictEqual((html.match(/<img/g)||[]).length,1);
  assert(html.indexOf('重复文字') < html.indexOf('iVBORw0KGgo'+png));
  assert(html.lastIndexOf('重复文字') > html.indexOf('iVBORw0KGgo'+png));
  assert(html.indexOf('末尾') > html.lastIndexOf('重复文字'));
  assert(!html.includes('隐藏OCR文字'));
  // Batched generation follows the same preference and order as synchronous output.
  const queue=[];
  context.NSTimer.scheduledTimerWithTimeInterval=(delay,repeat,fn)=>{
    const timer={invalidate(){this.cancelled=true;}};
    queue.push(()=>{if(!timer.cancelled)fn();});return timer;
  };
  let result='';
  const task=api.createTableTask(roots,mode,false,{isSyncWidth:true,showBreadcrumb:false,savedWidthMap:{},savedNodeWidthMap:{},savedImgHash:{},savedImageMap:{}},()=>{},value=>{result=value;},error=>{throw error;});
  while(queue.length)queue.shift()();
  assert.strictEqual(result.split('<script')[0],html);
  assert.strictEqual(task.metrics.associatedNoteQueries,0,'cached text queried its source');
  assert.strictEqual(task.metrics.imageReads,1,'text excerpts read image caches');
  assert.strictEqual(task.metrics.encodeCalls,1,'text excerpts encoded images');
}
// Colour CSS/builders and the toolbar preference were explicitly added in 4.2.3/4.2.4; retain a fixed guard for all other production code.
const current=fs.readFileSync(path.join(__dirname,'../.mnaddon-work/main.js'),'utf8');
function outsideContent(source) {
  return source.replace(/\/\/ BUNDLED_CARD_CONTENT_4_2_0_START[\s\S]*?\/\/ BUNDLED_CARD_CONTENT_4_2_0_END/,'CONTENT')
    .replace(/\/\/ BUNDLED_CARD_NATIVE_ADAPTER_START[\s\S]*?\/\/ BUNDLED_CARD_NATIVE_ADAPTER_END/,'ADAPTER');
}
const baselineOutsideHash='4f86b0e941fa0771490138463a6dd64e388ae2fc7208c1422284a87921430e5a';
assert.strictEqual(crypto.createHash('sha256').update(outsideContent(current)).digest('hex'),baselineOutsideHash,'unrelated production code changed');
console.log('4.2.1 merged excerpt text preference: PASS (per-comment flags, native/JSON, text fallback, image preservation, order, both modes/root/child, batched output, zero needless image work, unchanged interaction/export)');
