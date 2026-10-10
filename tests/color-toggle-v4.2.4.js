const assert=require('assert'),fs=require('fs'),path=require('path');
let harness=fs.readFileSync(path.join(__dirname,'regression-v3.9.0.js'),'utf8').split('const opaqueNativeArray')[0];
harness=harness.replace("' renderExcerpt: renderExcerpt,'","' processLibraryAction:processLibraryAction, renderSettings:renderSettings, panelRenderState:panelRenderState, setRenderControls:setRenderControls, showPanel:showPanel, cleanExportHtml:cleanExportHtml, renderExcerpt: renderExcerpt,'");
const out={exports:{}};new Function('require','__dirname','module',harness+'\nmodule.exports={api,context};')(require,__dirname,out);
const {api,context:c}=out.exports;
c.UIColor={colorWithWhiteAlpha:(...args)=>args,colorWithRedGreenBlueAlpha:(...args)=>args,grayColor:()=>['gray'],darkGrayColor:()=>['dark'],whiteColor:()=>['white'],clearColor:()=>['clear'],lightGrayColor:()=>['light']};
const messages=[];c.Application.sharedInstance().showHUD=(text,window,seconds)=>messages.push({text,seconds});
function button(){return {layer:{},setTitleForState(title){this.title=title;},setTitleColorForState(){}};}
function panel(enabled){const p={},b=button();b.superview=p;const scripts=[];return {panel:p,colorBtn:b,isCardColorEnabled:enabled,committedRenderState:{isCardColorEnabled:enabled},webView:{evaluateJavaScript(script,cb){scripts.push(script);cb();}},scripts};}
const first=panel(true),second=panel(false);c.self.panels=[first,second];
const toggle=api.Mindmap2Table.instanceMethods.onToggleCardColor;
toggle.call(c.self,first.colorBtn);
assert.strictEqual(first.isCardColorEnabled,false);assert.strictEqual(second.isCardColorEnabled,false);assert.strictEqual(first.colorBtn.title,'配色');assert.strictEqual(first.committedRenderState.isCardColorEnabled,false);
assert(first.scripts[0].includes("classList.add('hide-card-colors')"));assert(messages[0].text.includes('配色已关闭')&&messages[0].text.includes('导出和打印'));assert(messages[0].seconds>=3);
const offTint=first.colorBtn.backgroundColor;
toggle.call(c.self,first.colorBtn);assert.strictEqual(first.isCardColorEnabled,true);assert.strictEqual(second.isCardColorEnabled,false);assert.notDeepStrictEqual(first.colorBtn.backgroundColor,offTint);assert(first.scripts[1].includes("classList.remove('hide-card-colors')"));assert(messages[1].text.includes('浅色背景'));
assert(first.scripts.every(s=>!s.includes('scroll')&&!s.includes('innerHTML')),'toggle regenerated/moved table');
assert.strictEqual(api.renderSettings(second).isCardColorEnabled,false);assert.strictEqual(api.panelRenderState(second).isCardColorEnabled,false);
api.setRenderControls(first,false);assert.strictEqual(first.colorBtn.enabled,false);api.setRenderControls(first,true);assert.strictEqual(first.colorBtn.enabled,true);
c.MNUtil.defaultNoteColors=['#ff0000'];
const root={noteId:'COLOR_SWITCH',colorIndex:0,noteTitle:'配色示例',excerptText:'正文保留',comments:[],childNotes:[]};
for(const build of [api.buildHtmlTable,api.buildTitleContentTable]){
 c.self.isCardColorEnabled=false;const off=build([root],false);assert(/<body[^>]*class="[^"]*hide-card-colors/.test(off));assert(api.cleanExportHtml(off).includes('hide-card-colors'));
 c.self.isCardColorEnabled=true;const on=build([root],false);assert(!/<body[^>]*class="[^"]*hide-card-colors/.test(on));assert(on.includes('正文保留'));
 const q=[];c.NSTimer.scheduledTimerWithTimeInterval=(delay,repeat,fn)=>{const t={invalidate(){this.cancelled=true;}};q.push(()=>{if(!t.cancelled)fn();});return t;};
 let result='';api.createTableTask([root],build===api.buildHtmlTable?'merge':'titlecontent',false,{...api.renderSettings(second)},()=>{},html=>result=html,error=>{throw error;});while(q.length)q.shift()();assert(/<body[^>]*class="[^"]*hide-card-colors/.test(result));assert.strictEqual(c.self.isCardColorEnabled,true,'panel settings leaked globally');
}
// Build the actual native toolbar with view fakes: the full label and button hit area fit.
class View {constructor(frame){this.frame=frame;this.bounds=frame;this.children=[];this.layer={};this.titleLabel={};}addSubview(v){v.superview=this;this.children.push(v);}addGestureRecognizer(){}setTitleForState(t){this.title=t;}setTitleColorForState(){}addTargetActionForControlEvents(target,action){this.action=action;}loadHTMLStringBaseURL(html){this.html=html;}bringSubviewToFront(){}evaluateJavaScript(script,cb){if(cb)cb(null,null);}}
c.UIView=View;c.UILabel=View;c.UIWebView=View;c.UIButton={buttonWithType:()=>new View({})};c.UIFont={systemFontOfSize:()=>0,boldSystemFontOfSize:()=>0};c.UIPanGestureRecognizer=function(){};
c.self.window=new View({x:0,y:0,width:1024,height:768});c.self.panels=[];c.self.rootNotes=[];c.self.isCardColorEnabled=true;
const created=api.showPanel(c.self,'<!doctype html><html><body>示例</body></html>');
assert.strictEqual(created.colorBtn.title,'配色');assert.strictEqual(created.colorBtn.action,'onToggleCardColor:');assert.strictEqual(created.isCardColorEnabled,true);
const bar=created.colorBtn.superview;const buttons=bar.children.filter(v=>v.action).sort((a,b)=>a.frame.x-b.frame.x);
assert(buttons.every(b=>b.frame.x>=0&&b.frame.x+b.frame.width<=created.panel.frame.width),'toolbar clipped');
for(let i=1;i<buttons.length;i++)assert(buttons[i].frame.x>=buttons[i-1].frame.x+buttons[i-1].frame.width,'buttons overlap');
// Save the panel's off setting even while the global/new-window setting is on.
const stored={};c.NSUserDefaults.standardUserDefaults=()=>({objectForKey:key=>stored[key],setObjectForKey:(value,key)=>stored[key]=value});
created.rootNotes=[root];created.savedRootNoteIds=[root.noteId];created.isCardColorEnabled=false;c.self.isCardColorEnabled=true;
api.Mindmap2Table.instanceMethods.onSaveToLibrary.call(c.self,created.libSaveBtn);
const library=JSON.parse(stored['momo.mindmap2table.library']);assert.strictEqual(library.rootItems[0].isCardColorEnabled,false,'save read global instead of panel');
c.Database.sharedInstance().getNoteById=()=>root;
const action=api.processLibraryAction('openItem::'+library.rootItems[0].id,c.self);
assert(action&&action.forceNew);assert.strictEqual(c.self.isCardColorEnabled,false,'reopen did not restore saved off state');
const source=fs.readFileSync(path.join(__dirname,'../.mnaddon-work/main.js'),'utf8');
assert(source.includes('addon.isCardColorEnabled = item.isCardColorEnabled !== false;'),'library reopen lost setting');
assert(source.includes('pe.isCardColorEnabled = item.isCardColorEnabled !== false;'),'batch export lost per-item setting');
assert(source.includes("(pe.isCardColorEnabled === false ? 'hide-card-colors' : '')"),'batch HTML lost off state');
assert(source.includes('isCardColorEnabled: pe.isCardColorEnabled !== false,'),'library save lost setting');
c.self.isCardColorEnabled=true;const on=api.cleanExportHtml(api.buildTitleContentTable([root],false));c.self.isCardColorEnabled=false;const off=api.cleanExportHtml(api.buildTitleContentTable([root],false));
fs.writeFileSync(path.join(__dirname,'color-toggle-v4.2.4-on.html'),on);fs.writeFileSync(path.join(__dirname,'color-toggle-v4.2.4-off.html'),off);
console.log('4.2.4 colour toggle: PASS (two-character toolbar button, layout, tint/HUD, instant DOM switch, isolated panels, refresh/task/rollback state, save/reopen/batch/export settings, controls while rendering)');
