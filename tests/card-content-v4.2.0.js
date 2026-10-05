const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
// Reuse native API fakes without rerunning benchmarks or changing production globals.
let harness = fs.readFileSync(path.join(__dirname,'regression-v3.9.0.js'),'utf8').split('const opaqueNativeArray')[0];
harness = harness.replace("' renderExcerpt: renderExcerpt,'", "' getCardContentModel:getCardContentModel, prepareCardRoots:prepareCardRoots, requireCardReader:requireCardReader, renderCardText:renderCardText, renderExcerpt: renderExcerpt,'");
const moduleHarness = {exports:{}};
new Function('require','__dirname','module', harness+'\nmodule.exports={api,context,db,notes,media,fakePng};')(require,__dirname,moduleHarness);
const {api,context,db,notes,media,fakePng} = moduleHarness.exports;
const source=fs.readFileSync(path.join(__dirname,'../.mnaddon-work/main.js'),'utf8');
const standalone = {Map,Set,console}; vm.createContext(standalone);
for(const name of ['structure','model','html']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/card-content',name+'.js'),'utf8'),standalone);
const field=(obj,key)=> obj && obj[key];
const array=value=>Array.isArray(value)?value: value && value.objectAtIndex ? Array.from({length:value.count},(_,i)=>value.objectAtIndex(i)) : [];
function collect(roots) { const c=standalone.MomoCardStructure.create(roots,{array,field,maxDepth:256});while(c.step()){}return c.finish(); }
const note=(id,title=id)=>({noteId:id,noteTitle:title,comments:[],childNotes:[]});
const node=(n,children=[])=>{const p={note:n,childNodes:children};array(children).forEach(c=>{if(c)c.parentNode=p;});return p;};
function ids(roots){return Array.from(roots,r=>r.noteId);}
// Native array order wins over title/ID/coordinate/selection order.
const a=node(note('Z','A'),[]),b=node(note('A','Z'),[]);a.frame={x:0,y:999};b.frame={x:0,y:0};
const parent=node(note('P'),[a,b]);
assert.deepStrictEqual(ids(collect([parent])[0].childNotes),['Z','A']);
assert.deepStrictEqual(ids(collect([b,a])),['Z','A']);
assert.deepStrictEqual(ids(collect([b,parent,a])),['P']);
const repeated=note('SAME','共用卡片'),p1=node(repeated),p2=node(repeated),pRoot=node(note('MULTI'),[p1,p2,p1]);
const multi=collect([pRoot]);assert.strictEqual(multi[0].childNotes.length,2);assert.notStrictEqual(multi[0].childNotes[0].__positionId,multi[0].childNotes[1].__positionId);
// Same note ID can appear along a real native path; only position cycles truncate.
const p3=node(repeated,[node(repeated)]);assert.strictEqual(collect([p3])[0].childNotes[0].__sourceNote,repeated);
p2.childNodes=[pRoot]; assert(collect([pRoot])[0].childNotes[1].childNotes[0].__structureWarnings[0].includes('截断'));p2.childNodes=[];
const bad=node(note('BAD'),[null,{get note(){throw Error('bad bridge');}}]);assert.strictEqual(collect([bad])[0].childNotes.length,2);
const rawParent=note('RAW_PARENT'),rawChild=note('RAW_CHILD');rawParent.childNotes=[rawChild];assert.deepStrictEqual(ids(collect([rawChild,rawParent])),['RAW_PARENT']);
const ns={count:2,objectAtIndex:i=>[b,a][i]};assert.deepStrictEqual(ids(collect([node(note('NS'),ns)] )[0].childNotes),['A','Z']);
// Blocks retain explicit repeated sources and never deduplicate equal text.
media.ORDER_IMG=fakePng('ORDER_IMG');
const mixed={...note('MIXED','1. 好，优秀'),notesText:'聚合正文不要提前输出',comments:[{type:'LinkNote',q_hpic:{paint:'ORDER_IMG'}},{type:'TextNote',text:'后面的正文'},{type:'TextNote',text:'后面的正文'},{type:'LinkNote',q_hpic:{paint:'ORDER_IMG'}}]};
for(const build of [api.buildHtmlTable,api.buildTitleContentTable]) {
 const html=build([mixed],false);assert(!html.includes('聚合正文不要提前输出'));assert.strictEqual((html.match(/后面的正文/g)||[]).length,2);assert.strictEqual((html.match(/iVBORw0KGgoORDER_IMG/g)||[]).length,2);
 assert(html.indexOf('iVBORw0KGgoORDER_IMG')<html.indexOf('后面的正文'));assert(html.includes('1. 好，优秀'));
 const child=build([{...note('MIXED_PARENT'),childNotes:[mixed]}],false);assert(child.includes('1. 好，优秀'));
 const title=build([note('TITLE','summary/123 实际编号')],false);assert(title.includes('summary/123 实际编号'));
 const mainRepeated=build([{...note('SAME_TEXT'),excerptText:'明确重复正文',comments:[{type:'TextNote',text:'明确重复正文'}]}],false);assert.strictEqual((mainRepeated.match(/明确重复正文/g)||[]).length,2);
}
// Required nine-card matrix: every type as its own root and ordinary child in both modes.
const matrix=[
 {card:{...note('MATRIX_OCR',''),textFirst:true,excerptText:'连续OCR完整正文',excerptPic:{paint:'ORDER_IMG'}},text:'连续OCR完整正文',noImage:true},
 {card:{...note('MATRIX_IMAGE','隐藏OCR标题'),excerptText:'隐藏OCR正文',excerptPic:{paint:'ORDER_IMG'}},image:true,absent:['隐藏OCR标题','隐藏OCR正文']},
 {card:{...note('MATRIX_TITLE_IMAGE','真实图片标题'),options:{toggleTitleDate:1},excerptPic:{paint:'ORDER_IMG'},comments:[{type:'TextNote',text:'图文评论正文'}]},image:true,text:'图文评论正文',title:'真实图片标题'},
 {card:{...note('MATRIX_NO_TITLE','伪OCR标题'),excerptPic:{paint:'ORDER_IMG'}},image:true,absent:['伪OCR标题']},
 {card:{...note('MATRIX_WORD','therapeutic'),excerptText:'/ˌθerəˈpjuːtɪk/ 治疗的',__mnWrapper:{imageData:fakePng('UNRELATED')},comments:[{type:'TextNote',text:'A therapeutic example.'}]},title:'therapeutic',text:'A therapeutic example.',noImage:true},
 {card:{...mixed,noteId:'MATRIX_MIXED'},title:'1. 好，优秀',text:'后面的正文',image:true},
 {card:{...note('MATRIX_DRAW','手写标题'),type:256,excerptPicData:fakePng('MATRIXDRAW'),getStrokesCount:()=>4},title:'手写标题',image:true},
 {card:{...note('MATRIX_TEXT','纯文字'),excerptText:'全部文本第一段\n\n第二段\n- 列表内容\n公式 $x^2$',comments:[{type:'TextNote',text:'完整纯文字评论'}]},title:'纯文字',text:'完整纯文字评论',noImage:true},
 {card:note('MATRIX_TITLE_ONLY','只有完整标题'),title:'只有完整标题',noImage:true},
 {card:{...note('MATRIX_CONTENT_ONLY',''),excerptText:'只有正文不造标题'},text:'只有正文不造标题',noImage:true}
];
for(const build of [api.buildHtmlTable,api.buildTitleContentTable]) for(const entry of matrix) for(const child of [false,true]) {
 const html=build(child?[{...note('MATRIX_PARENT','测试父节点'),childNotes:[entry.card]}]:[entry.card],false).split('<script')[0];
 assert(html.includes('data-nodeid="'+entry.card.noteId+'"'),entry.card.noteId+' link');
 if(entry.text)assert(html.includes(entry.text),entry.card.noteId+' body');if(entry.title)assert(html.includes(entry.title),entry.card.noteId+' title');
 if(entry.image)assert(html.includes('<img'),entry.card.noteId+' image');if(entry.noImage)assert(!html.includes('<img'),entry.card.noteId+' unrelated image');
 for(const absent of entry.absent||[])assert(!html.includes(absent),entry.card.noteId+' false title/body');
 if(entry.card.noteId==='MATRIX_MIXED')assert(html.indexOf('iVBORw0KGgoORDER_IMG')<html.indexOf('后面的正文'),'matrix comment order');
 if(entry.card.noteId==='MATRIX_TEXT')assert(html.includes('全部文本第一段')&&html.includes('第二段')&&html.includes('列表内容')&&html.includes('class="math-inline"'),'plain card completeness');
 if(entry.card.noteId==='MATRIX_TITLE_ONLY'&&!child)assert(html.includes('<div class="section-header">'),'root title-only target');
}

// Editor highlighter, Markdown mixed HTML, entities and code are preserved.
const rich=api.renderCommentText({type:'HtmlNote',text:'<div><mark style="background-color: #FFFF00">高亮</mark><span style="color:red;font-weight:bold;font-style:italic">彩色</span><br>换行<ul><li>条目</li></ul><table><tr><td>单元格</td></tr></table></div>'});
for(const value of ['background-color:#FFFF00','color:red','font-weight:bold','font-style:italic','<br>','<ul>','<td>单元格</td>']) assert(rich.includes(value),value);
const md=api.renderCommentText({type:'TextNote',text:'**粗体** <mark style="background-color:yellow">内联高亮</mark> &amp; ==扩展==\n\n`==代码== $x$`\n\n```js\n==块代码==\n$x$\n```\n\n公式 $a<b$'});
assert(md.includes('<strong>粗体</strong>'));assert(md.includes('background-color:yellow'));assert(md.includes('<code>==代码== $x$</code>'));assert(md.includes('==块代码=='));assert.strictEqual((md.match(/class="math-inline"/g)||[]).length,1);assert(md.includes('data-math="a&lt;b"'));
const sanitized=standalone.MomoCardHtml.sanitize('<html><head><style>body {color:blue} .yellow {background-color:yellow} .yellow strong {font-style:italic}</style></head><body><p class="yellow" onclick="alert(1)"><strong>格式</strong><img src="x" onerror="alert(1)"><a href="java&#x73;cript:alert(1)">坏链接</a><script>alert(1)</script></p></body></html>').html;
assert(sanitized.includes('color:blue'));assert(sanitized.includes('background-color:yellow'));assert(sanitized.includes('font-style:italic'));assert(!/onclick|onerror|javascript|<script/.test(sanitized));assert(!sanitized.includes('<style'));
media.MDIMG=fakePng('MDIMAGE');
const mnImage = api.renderCommentText({type:'TextNote',text:'![原图](marginnote4app://markdownimg/png/MDIMG)\n`marginnote4app://markdownimg/png/MDIMG`'});
assert(mnImage.includes('src="data:image/png;base64,iVBORw0KGgoMDIMAGE"'));
assert(mnImage.includes('<code>marginnote4app://markdownimg/png/MDIMG</code>'));
const nestedFont=standalone.MomoCardHtml.sanitize('<div style="font-size:30px"><span style="font-size:15px">比例</span></div>').html;
assert(nestedFont.includes('font-size:2em')&&nestedFont.includes('font-size:0.5em'));
assert(standalone.MomoCardHtml.sanitize('<div style="font-size:200%"><span style="font-size:15px!important">字</span></div>').html.includes('font-size:0.5em!important'));
const unsafeTitle=api.buildHtmlTable([note('TITLE_SAFE','<img src="https://example.com/a.png" onerror="alert(1)">')],false);assert(!unsafeTitle.includes('onerror="alert(1)"'));
// Single block failures preserve surrounding blocks and attach readable warning.
const isolated=standalone.MomoCardHtml.render({blocks:[{kind:'text',value:'前',source:'excerpt'},{kind:'text',value:'坏',source:'excerpt2'},{kind:'text',value:'后',source:'excerpt3'}],warnings:[]},{text:t=>{if(t==='坏')throw Error('fail');return t;},imageStyle:()=>''},false,'');assert(isolated.includes('前')&&isolated.includes('坏')&&isolated.includes('后')&&isolated.includes('排版失败'));
const unsupported=api.buildHtmlTable([{...note('AUDIO'),comments:[{type:'AudioNote',attachment:'sound'}]}],false);assert(unsupported.includes('audionote')&&unsupported.includes('data-nodeid="AUDIO"'));
// An image comment failure retains readable text in its original position.
const failing=api.getCardContentModel({...note('FAIL'),comments:[{type:'LinkNote',q_hpic:{paint:'MISSING'},q_htext:'图片失败的文字'},{type:'TextNote',text:'下一条'}]});assert.deepStrictEqual(Array.from(failing.blocks,b=>b.value),['图片失败的文字','下一条']);
// Each note is read once per task, but repeated true placements all render.
const queue=[];context.NSTimer.scheduledTimerWithTimeInterval=(delay,repeat,fn)=>{const t={invalidate(){this.cancelled=true;}};queue.push(()=>{if(!t.cancelled)fn();});return t;};
let count=0;const shared={...note('READ_ONCE'),get excerptText(){count++;return '重复位置正文';}};
const all=node(note('READ_ROOT'),[node(shared),node(shared)]);let taskHtml='';const task=api.createTableTask([all],'merge',false,{isSyncWidth:true,savedWidthMap:{},savedNodeWidthMap:{},savedImgHash:{},savedImageMap:{},showBreadcrumb:false},()=>{},html=>taskHtml=html,error=>{throw error;});while(queue.length)queue.shift()();
assert.strictEqual((taskHtml.match(/重复位置正文/g)||[]).length,2);assert.strictEqual(task.metrics.lookupCounts.cardModel,2);assert(task.metrics.cacheHitsByName.cardModel>=1);
// The reader exposes one comment per step, so large single cards remain cancellable.
const incremental=standalone.MomoCardModel.create({noteId:'INCREMENTAL',comments:Array.from({length:5000},(_,i)=>({type:'TextNote',text:'正文 '+i}))}, {field,title:()=>'',comments:n=>n.comments,blank:()=>false,textFirst:()=>false,hash:()=>'',drawing:()=>false,hasMedia:()=>false,sketch:n=>n,html:()=>'',aggregate:()=>'',commentHash:()=>'',lookup:()=>null,image:()=>null});
assert.strictEqual(incremental.model.blocks.length,0);assert.strictEqual(incremental.step(),true);assert.strictEqual(incremental.model.blocks.length,1);
const mediaFailure=standalone.MomoCardModel.read({noteId:'FAILIMAGE',comments:[{type:'LinkNote',q_hpic:'hash',q_htext:'可读回退'}]}, {field,title:()=>'',comments:n=>n.comments,blank:()=>false,textFirst:()=>false,hash:()=>'',drawing:()=>false,hasMedia:()=>false,sketch:n=>n,html:()=>'',aggregate:()=>'',commentHash:()=> 'hash',lookup:()=>null,image:()=>{throw Error('media');}});
assert.strictEqual(mediaFailure.blocks[0].value,'可读回退');assert(mediaFailure.warnings.length);
// Missing MNUtils must leave the existing page intact before any staging begins.
const savedUtils=context.MNNote;context.MNNote=undefined;assert.strictEqual(api.requireCardReader(),false);context.MNNote=savedUtils;
// Compare all interaction boundaries byte-for-byte to the 4.1.1 backup.
const base=fs.readFileSync(path.join(__dirname,'./fixtures/interaction-v4.1.1.js'),'utf8');
for(const [start,end] of [["'// A. Jump logic","'// B. Column Resizer"],["'// C. Img Resizer","'// D. Section Fold/Unfold"],['function scrollPanelToNote(', 'function startGlobalPollTimer('],['function startGlobalPollTimer()','// Library webView polling'],['"onNoteFocusChanged:": function','"exportTable:": function'],['"onDrag": function','addonDidConnect: function']]){
 function region(s){let a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a,start);return s.slice(a,b);}assert.strictEqual(region(source),region(base),start+' changed');
}
console.log('4.2.0 structure → model → HTML: PASS (native order, overlap, multiple placements, cycles, source identity, HTML/Markdown, cache, dependency gate, interaction preservation)');
