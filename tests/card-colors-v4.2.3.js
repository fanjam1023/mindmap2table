const assert=require('assert'),fs=require('fs'),path=require('path');
let harness=fs.readFileSync(path.join(__dirname,'regression-v3.9.0.js'),'utf8').split('const opaqueNativeArray')[0];
harness=harness.replace("' renderExcerpt: renderExcerpt,'","' cardMutedColor:cardMutedColor, cardColorStyle:cardColorStyle, cleanExportHtml:cleanExportHtml, renderExcerpt: renderExcerpt,'");
const out={exports:{}};new Function('require','__dirname','module',harness+'\nmodule.exports={api,context};')(require,__dirname,out);
const {api,context}=out.exports;
const defaults=['#ffffb4','#ccfdc4','#b4d1fb','#f3aebe','#ffff54','#75fb4c','#55bbf9','#ea3323','#ef8733','#377e47','#173dac','#be3223','#ffffff','#dadada','#b4b4b4','#bd9fdc'];
let calls=0;
context.MNUtil.defaultNoteColors=defaults;
context.MNUtil.noteColorByNotebookIdAndColorIndex=(book,index)=>{calls++;return book==='CUSTOM' ? '#8040c0ff' : defaults[index];};
const note=(id,index,title='题型 '+id)=>({noteId:id,notebookId:'DEFAULT',colorIndex:index,noteTitle:title,excerptText:'完整正文 '+id,comments:[],childNotes:[]});
const color=index=>api.cardMutedColor(defaults[index]);
function hsl(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),hi=Math.max(...c),lo=Math.min(...c),d=hi-lo,l=(hi+lo)/2;let h=0;if(d)h=hi===c[0]?((c[1]-c[2])/d+6)%6:hi===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4;return [h*60,d?d/(1-Math.abs(2*l-1)):0,l];}
function luminance(hex){return [1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);}
for(const hex of defaults){const actual=api.cardMutedColor(hex),before=hsl(hex),after=hsl(actual);assert(/^#[a-f0-9]{6}$/.test(actual));assert(after[2]>=.948);if(before[1]>.1){const diff=Math.abs(before[0]-after[0]);assert(Math.min(diff,360-diff)<8,'colour family changed');assert(Math.abs(after[1]-before[1]*.5)<.09,'nonuniform saturation');}assert((luminance(actual)+.05)/(luminance('#656d76')+.05)>=4.5,'body text contrast');}
assert.strictEqual(api.cardMutedColor('#00000000'),'#ffffff');
for(const bad of ['red','url(x)','#123','#123456;display:none',''])assert.strictEqual(api.cardMutedColor(bad),'');
for(const index of [undefined,null,-1,16,NaN,1.2,''])assert.strictEqual(api.cardColorStyle(note('BAD',index)),'--card-background:initial;');
assert(api.cardColorStyle(note('ZERO',0)).includes(color(0)),'index zero lost');
assert(api.cardColorStyle({objectForKey:key=>note('DICT',2)[key]}).includes(color(2)),'native fields lost');
assert(api.cardColorStyle({__sourceNote:note('OWN',7),colorIndex:2}).includes(color(7)),'wrapper changed colour ownership');
assert(api.cardColorStyle({...note('CUSTOM',2),notebookId:'CUSTOM'}).includes(api.cardMutedColor('#8040c0ff')),'custom palette lost');
const settings={isSyncWidth:true,showBreadcrumb:false,savedWidthMap:{},savedNodeWidthMap:{},savedImgHash:{},savedImageMap:{}};
for(const mode of ['merge','titlecontent'])for(const child of [false,true])for(const variant of ['titlecontent','titleonly','contentonly']){
 const card=note('COLOURED',7);if(variant==='titleonly')card.excerptText='';if(variant==='contentonly')card.noteTitle='';
 const roots=child?[{...note('PARENT',2),childNotes:[card,note('UNCOLOURED',undefined)]}]:[card];
 const build=mode==='merge'?api.buildHtmlTable:api.buildTitleContentTable;
 const html=build(roots,false),body=html.split('<script')[0];
 assert(body.includes('--card-background:'+color(7)+';background-color:var(--card-background);'),'colour missing '+[mode,child,variant]);
 assert(body.includes('data-nodeid="COLOURED"'),'card link lost');
 if(variant!=='contentonly')assert(body.includes('题型 COLOURED'));if(variant!=='titleonly')assert(body.includes('完整正文 COLOURED'));
 const exported=api.cleanExportHtml(html);assert(exported.includes('--card-background:'+color(7)));assert(exported.includes('print-color-adjust: exact'));assert(!exported.includes('<script'));
 const q=[];context.NSTimer.scheduledTimerWithTimeInterval=(delay,repeat,fn)=>{const t={invalidate(){this.cancelled=true;}};q.push(()=>{if(!t.cancelled)fn();});return t;};
 calls=0;let result='';api.createTableTask(roots,mode,false,settings,()=>{},value=>result=value,error=>{throw error;});while(q.length)q.shift()();
 assert.strictEqual(result.split('<script')[0],body);assert(calls<=2,'palette read repeated');
}
// Each generation rereads colour: refreshing after a colour change cannot retain stale output.
const changing=note('CHANGE',2);const old=api.buildHtmlTable([changing],false);changing.colorIndex=7;assert.notStrictEqual(api.buildHtmlTable([changing],false),old);
// A colour lookup failure does not prevent content rendering.
context.MNUtil.noteColorByNotebookIdAndColorIndex=()=>{throw Error('unavailable palette');};assert(api.buildHtmlTable([note('FALLBACK',2)],false).includes('完整正文 FALLBACK'));
context.MNUtil.noteColorByNotebookIdAndColorIndex=(book,index)=>defaults[index];
const preview=[{...note('彩色知识点',2,'按题型整理知识点'),childNotes:[note('概念题',0),note('计算题',1),note('应用题',2),note('易错题',7),note('拓展题',15)]}];
fs.writeFileSync(path.join(__dirname,'card-colors-v4.2.3-preview.html'),api.cleanExportHtml(api.buildTitleContentTable(preview,false)));
console.log('4.2.3 colours: PASS (all palette colours, uniform saturation, readable contrast, custom/native/zero/missing fields, ownership, root/child/both modes, title/content variants, export/print, batched parity/cache, refresh, failure fallback)');
