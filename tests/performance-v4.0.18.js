const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {performance} = require('perf_hooks');
function harness(baseline = false) {
  let text = fs.readFileSync(path.join(__dirname, 'regression-v3.9.0.js'), 'utf8');
  if (baseline) text = text.replace("../.mnaddon-work/main.js", "./fixtures/performance-baseline.js");
  const m = {exports: {}};
  new Function('require', '__dirname', 'module', text + '\nmodule.exports = {api, context, notes, media, fakePng, db, sketchFixtures, setSketchList: value => {sketchListFixtures=value;}};')(require, __dirname, m);
  return m.exports;
}
function timerQueue(h) {
  const queue = [];
  h.context.NSTimer.scheduledTimerWithTimeInterval = (delay, repeat, fn) => {
    const t = {cancelled: false, invalidate() { this.cancelled = true; }};
    queue.push(() => { if (!t.cancelled) fn(t); });
    return t;
  };
  return queue;
}
const settings = {isSyncWidth: true, showBreadcrumb: false, savedWidthMap: {}, savedNodeWidthMap: {}, savedImgHash: {}, savedImageMap: {}};
function build(h, roots, mode, custom = settings) {
  const q = timerQueue(h), statuses = [];
  let html, failure;
  const t = h.api.createTableTask(roots, mode, false, custom, t => statuses.push({phase:t.phase, done:t.done,total:t.total}), result => { html = result; }, e => { failure = e; });
  let ticks = 0;
  while(q.length) { q.shift()(); if (++ticks > 100000) throw Error('stuck task'); }
  if(failure) throw failure;
  assert(html, 'task did not complete');
  assert(!html.includes('\u0001MNTASK'), 'fragment references leaked');
  return {html, ticks, metrics: t.metrics, statuses};
}
function body(html) { return html.slice(html.indexOf('<body'), html.indexOf('<script', html.indexOf('<body'))); }
function equalBody(actual, expected, label) {
  const a=body(actual), b=body(expected);
  if(a===b) return;
  let i=0; while(a[i]===b[i] && i<Math.min(a.length,b.length)) i++;
  assert.fail(label+' at '+i+' actual: '+a.slice(i-80,i+180)+' expected: '+b.slice(i-80,i+180));
}
const h = harness();
const old = harness(true);

// Title ownership regression: type-7 and type-256 records can both be
// present for one brain-map card.  The native MNNote.title projection is
// authoritative; a Sketch-only title must never replace it, and a type-7
// image title without that projection remains protected as possible OCR.
{
  const type7Visible = {noteId:'TYPE7_VISIBLE',type:7,noteTitle:'有益的困难',textFirst:true,excerptText:'正文',excerptPic:{paint:'IMAGE_MAIN_123'},comments:[],childNotes:[],__mnWrapper:{title:'有益的困难',isOCR:true}};
  const type7Hidden = {noteId:'TYPE7_HIDDEN',type:7,noteTitle:'伪造OCR标题',textFirst:true,excerptText:'识别正文',excerptPic:{paint:'IMAGE_MAIN_123'},comments:[],childNotes:[]};
  const type256Visible = {noteId:'TYPE256_VISIBLE',type:256,noteTitle:'脑图结构标题',textFirst:true,excerptText:'正文',excerptPic:{paint:'IMAGE_MAIN_123'},comments:[],childNotes:[]};
  const nativeWithSketchTitle = {noteId:'NATIVE_TITLE_OWNER',type:7,noteTitle:'原卡标题',textFirst:false,excerptText:'正文',excerptPic:{paint:'IMAGE_MAIN_123'},comments:[],childNotes:[],__mnWrapper:{title:'原卡标题',isOCR:true},__sketchSource:{noteId:'SKETCH_TITLE',noteTitle:'草图标题',excerptPicData:h.fakePng('SKETCH_TITLE')}};
  assert.strictEqual(h.api.getExplicitNoteTitle(type7Visible),'有益的困难');
  assert.strictEqual(h.api.getExplicitNoteTitle(type7Hidden),'');
  assert.strictEqual(h.api.getExplicitNoteTitle(type256Visible),'脑图结构标题');
  assert.strictEqual(h.api.getExplicitNoteTitle(nativeWithSketchTitle),'原卡标题');
  h.context.self.titleDiagnosticsEnabled=true; h.context.self.lastTitleDiagnostics=[];
  h.api.getExplicitNoteTitle(type7Hidden);
  const diagnostic=h.context.self.lastTitleDiagnostics.slice(-1)[0];
  assert(diagnostic && diagnostic.noteId==='TYPE7_HIDDEN' && diagnostic.reason==='insufficient-title-evidence');
  assert(!Object.keys(diagnostic).some(key=>/text|data|media|hash|ocr/i.test(key)));
  h.context.self.titleDiagnosticsEnabled=false;
}
// The full card regression fixtures run through both resumable render modes.
// The legacy suite mutates its Sketch list between cases. Freeze its resolved
// fixtures before the new task intentionally invalidates old global caches.
// Blank-highlight comments are stored as q_hblank/q_htext/q_hpic.  They must
// use text first, recover text from the linked native note when q_htext is
// empty, and retain the old image-first behavior for ordinary image links.
{
  h.media.BLANK_IMAGE = h.fakePng('BLANK_IMAGE');
  h.notes.BLANK_ORIGINAL = {noteId:'BLANK_ORIGINAL',noteTitle:'',excerptText:'关联原卡正文',comments:[],childNotes:[]};
  const blank7 = {noteId:'BLANK_TYPE7',type:7,noteTitle:'留白文字卡',excerptText:'',comments:[{type:'LinkNote',q_hblank:true,q_htext:'刷题看解析觉得都懂，但自己重做就卡住了。',q_hpic:{paint:'BLANK_IMAGE'},noteid:'BLANK_ORIGINAL'}],childNotes:[]};
  const blank256 = {noteId:'BLANK_TYPE256',type:256,noteTitle:'留白文字卡2',excerptText:'',comments:[{type:'LinkNote',q_hblank:'true',q_htext:'',q_hpic:{paint:'BLANK_IMAGE'},noteid:'BLANK_ORIGINAL'}],childNotes:[]};
  const blankDirect = {noteId:'BLANK_DIRECT',noteTitle:'直接留白原卡',excerptText:'直接读取的留白正文',options:'{"blankHighlight":{"blankHeight":200}}',textFirst:false,excerptPic:{paint:'BLANK_IMAGE'},comments:[],childNotes:[]};
  const ordinaryImageComment = {noteId:'ORDINARY_IMAGE_COMMENT',noteTitle:'普通图片评论',excerptText:'',comments:[{type:'LinkNote',q_hblank:false,q_htext:'不应覆盖图片的 OCR',q_hpic:{paint:'BLANK_IMAGE'}}],childNotes:[]};
  const missingImageComment = {noteId:'MISSING_IMAGE_COMMENT',noteTitle:'媒体失败回退',excerptText:'',comments:[{type:'LinkNote',q_htext:'媒体不可用时仍应显示的文字',q_hpic:{paint:'MISSING_IMAGE'}}],childNotes:[]};
  const emptyBlankComment = {noteId:'EMPTY_BLANK_COMMENT',noteTitle:'空白内容提示',excerptText:'',comments:[{type:'LinkNote',q_hblank:true,q_htext:'',q_hpic:{paint:'MISSING_IMAGE'}}],childNotes:[]};
  for (const mode of ['titlecontent','merge']) {
    const buildFn = mode === 'titlecontent' ? h.api.buildTitleContentTable : h.api.buildHtmlTable;
    const html7 = buildFn([blank7],false);
    assert.strictEqual((html7.match(/刷题看解析觉得都懂/g)||[]).length,1,mode+' type-7 blank text missing/duplicated');
    assert(!html7.includes('data-paint="BLANK_IMAGE"'),mode+' blank text was replaced by image');
    const html256 = buildFn([blank256],false);
    assert.strictEqual((html256.match(/关联原卡正文/g)||[]).length,1,mode+' linked blank fallback missing');
    const direct = buildFn([blankDirect],false);
    assert(direct.includes('直接读取的留白正文') && !direct.includes('data-paint="BLANK_IMAGE"'),mode+' direct blank card did not prefer text');
    const ordinary = buildFn([ordinaryImageComment],false);
    assert(ordinary.includes('data-paint="BLANK_IMAGE"') && !ordinary.includes('不应覆盖图片的 OCR'),mode+' ordinary image comment changed priority');
    const missing = buildFn([missingImageComment],false);
    assert(missing.includes('媒体不可用时仍应显示的文字'),mode+' failed image did not fall back to text');
    const empty = buildFn([emptyBlankComment],false);
    assert(empty.includes('留白卡片内容无法读取'),mode+' empty blank comment did not report failure');
    const asyncBlank = build(h,[blank7],mode).html;
    assert.strictEqual((asyncBlank.match(/刷题看解析觉得都懂/g)||[]).length,1,mode+' async blank text missing/duplicated');
  }
  const childParent = {noteId:'BLANK_PARENT',noteTitle:'父节点',comments:[],childNotes:[blank7]};
  for (const mode of ['titlecontent','merge']) {
    const buildFn = mode === 'titlecontent' ? h.api.buildTitleContentTable : h.api.buildHtmlTable;
    const html = buildFn([childParent],false);
    assert.strictEqual((html.match(/刷题看解析觉得都懂/g)||[]).length,1,mode+' child blank text missing/duplicated');
  }
}
const fixtureRoots = Object.values(h.notes).map(n => h.api.resolveSketchNote(n));
for (const mode of ['titlecontent','merge']) {
  const expected = (mode === 'titlecontent' ? h.api.buildTitleContentTable : h.api.buildHtmlTable)(fixtureRoots, false);
  const actual = build(h, fixtureRoots, mode);
  equalBody(actual.html, expected, `${mode}: async changed card content/layout`);
}
// Cancel before first slice and while active; no completion/error callback allowed.
for (const afterFirst of [false,true]) {
  const q = timerQueue(h);
  const task = h.api.createTableTask(fixtureRoots, 'merge', false, settings, t => { if(afterFirst) t.cancel(); }, () => assert.fail('cancel completed'), e => { throw e; });
  if(afterFirst) q.shift()();
  task.cancel(); while(q.length) q.shift()();
}
// Interleave two builds with different widths to catch shared self contamination.
{
  const q = timerQueue(h); let a, b;
  h.api.createTableTask(fixtureRoots, 'merge', false, {...settings,savedWidthMap:{1:'23%'}}, () => {}, html => a=html, e=>{throw e;});
  h.api.createTableTask(fixtureRoots, 'merge', false, {...settings,savedWidthMap:{1:'67%'}}, () => {}, html => b=html, e=>{throw e;});
  while(q.length) q.shift()();
  assert(a.includes('width: 23%')); assert(b.includes('width: 67%'));
  assert.strictEqual(h.context.self.savedWidthMap[1], undefined);
}
// Cache failures only within one build; a later refresh must see new sketches.
{
  const n={noteId:'LATE_SKETCH',notebookId:'TOPIC',noteTitle:'手写',comments:[],childNotes:[],getStrokesCount:()=>4};
  h.setSketchList([]);
  const first=build(h,[n],'merge');assert(!first.html.includes('iVBORw0KGgoLATE'));
  h.setSketchList([{note:{noteId:'LATE_SKETCH'},excerptPicData:h.fakePng('LATE'),comments:[],childNotes:[]}]);
  const second=build(h,[n],'merge');assert(second.html.includes('iVBORw0KGgoLATE'));
  let calls=0;const original=h.db.getSketchNotesForMindMap;
  h.db.getSketchNotesForMindMap=()=>{calls++;return [];};
  build(h,Array.from({length:200},(_,i)=>({noteId:'EMPTY_'+i,notebookId:'TOPIC',noteTitle:'结构',comments:[],childNotes:[]})),'merge');
  assert.strictEqual(calls,1,'Sketch list repeatedly fetched');h.db.getSketchNotesForMindMap=original;
}
// Preserve cycle/depth protection while traversal and HTML assembly use stacks.
for(const mode of ['titlecontent','merge']) {
  const n={noteId:'CYCLE',noteTitle:'循环',excerptText:'正文',comments:[],childNotes:[]};n.childNotes=[n];
  equalBody(build(h,[n],mode).html,(mode==='merge'?h.api.buildHtmlTable:h.api.buildTitleContentTable)([n],false),'cycle guard');
}
function dataset(count, type, target) {
  const children = [];
  const sample = target.fakePng('PERF');
  target.media.PERF_IMAGE = sample;
  for(let i=0;i<count;i++) children.push({noteId:'PERF_'+i,noteTitle:'卡片 '+i, excerptText: type==='math' ? '公式 $\\frac{a_i}{b_i}\\Rightarrow x^2$' : '完整的正文 **Markdown** 与 English words。', excerptPic: type==='mixed' && i%3===0 ? 'PERF_IMAGE' : undefined, comments:[{type:'TextNote',text:'有序评论 '+i}],childNotes:[]});
  return [{noteId:'PERF_ROOT',noteTitle:'性能测试',excerptText:'根内容',comments:[],childNotes:children}];
}
const results = [];
for(const type of ['text','mixed','math']) for(const count of [100,1000,3000]) {
  const roots = dataset(count,type,h), oldRoots = dataset(count,type,old);
  let start = performance.now(); const oldHtml = old.api.buildTitleContentTable(oldRoots,false); const beforeMs = performance.now()-start;
  start = performance.now(); const result=build(h,roots,'titlecontent'); const afterCpuMs = performance.now()-start;
  // 4.2 corrects content/layout decisions; require async/sync parity and complete ordered data, not old HTML bytes.
  const rewritten = fs.readFileSync(path.join(__dirname,'../.mnaddon-work/main.js'),'utf8').includes('BUNDLED_CARD_CONTENT_4_2_0');
  equalBody(result.html, rewritten ? h.api.buildTitleContentTable(roots,false) : oldHtml, `${type}/${count} output mismatch`);
  for (let i=0;i<count;i++) assert(result.html.includes('有序评论 '+i+'<'), 'comment omitted: '+i);
  if(type!=='math') assert(!result.html.includes('<script id="MathJax-script">'), 'math engine loaded without formulas');
  results.push({type,count,beforeMs:Math.round(beforeMs),afterCpuMs:Math.round(afterCpuMs),slices:result.ticks,maxSliceMs:result.metrics.maxSliceMs,htmlBytes:Buffer.byteLength(result.html)});
}
console.log(JSON.stringify(results,null,2));
console.log('4.0.18 resumable rendering: PASS (fixture parity, cancellation, concurrent layout isolation, 9 benchmarks)');
if (process.env.MN_PERF_FIXTURE) {
  const roots=dataset(1000,'mixed',h);
  roots[0].childNotes.forEach((n,i)=>{ if(i%3!==0)n.excerptText='公式 $\\begin{aligned}a&=b\\\\\\Rightarrow c&=d\\end{aligned}$ 与 $\\sum_{i=1}^n i$'; });
  let html=build(h,roots,'titlecontent').html;
  html=html.replace(/iVBORw0KGgoPERF/g,'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==');
  html=html.replace('<head>','<head><script>window.perfBeats=0;window.perfMaxGap=0;var last=performance.now();var heartbeat=setInterval(function(){var now=performance.now();window.perfMaxGap=Math.max(window.perfMaxGap,now-last);last=now;window.perfBeats++;if(document.body){var box=document.getElementById("perf-summary");if(!box){box=document.createElement("pre");box.id="perf-summary";box.style.cssText="position:fixed;right:0;top:0;background:white;z-index:99999;font-size:12px";document.body.appendChild(box);}box.textContent=JSON.stringify({status:window.mnRenderStatus,beats:window.perfBeats,maxGap:window.perfMaxGap});if(window.mnRenderStatus&&window.mnRenderStatus.complete)clearInterval(heartbeat);}},16);</script>');
  fs.writeFileSync(process.env.MN_PERF_FIXTURE,html);
  let baselineHtml=old.api.buildTitleContentTable(roots,false).replace(/iVBORw0KGgoPERF/g,'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==');
  const probe=html.match(/<head>(<script>[\s\S]*?<\/script>)/)[1];
  const detect='<script>document.addEventListener("DOMContentLoaded",function(){var started=Date.now();var check=setInterval(function(){var total=document.querySelectorAll("[data-math]").length;var done=document.querySelectorAll("[data-math-rendered]").length;if(total===done){window.mnRenderStatus={complete:true,done:done,total:total,mathMs:Date.now()-started};clearInterval(check);}},16);});</script>';
  baselineHtml=baselineHtml.replace('<head>','<head>'+probe+detect);
  fs.writeFileSync(path.join(path.dirname(process.env.MN_PERF_FIXTURE),'performance-baseline.html'),baselineHtml);
}
module.exports = {h, build, results, harness};
