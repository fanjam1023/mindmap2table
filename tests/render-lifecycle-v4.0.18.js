const assert=require('assert');
const {h}=require('./performance-v4.0.18');
const c=h.context, api=h.api;
let timers=[], views=[], messages=[];
class View {
  constructor(frame){this.frame=frame;this.children=[];views.push(this);}
  addSubview(v){v.superview=this;this.children.push(v);}
  bringSubviewToFront(){}
  removeFromSuperview(){this.removed=true;}
  stopLoading(){}
  setTitleForState(t){this.title=t;}
  setTitleColorForState(){}
  addTargetActionForControlEvents(){}
  loadHTMLStringBaseURL(html){this.html=html;}
  evaluateJavaScript(js,cb){ if(js.includes('mnRenderCancelled'))return cb(); this.reply=cb; }
}
c.UIView=View;c.UILabel=View;c.UIWebView=View;
c.UIButton={buttonWithType:()=>new View({})};
c.UIFont={systemFontOfSize:()=>0};
c.UIColor={colorWithWhiteAlpha:()=>0,colorWithRedGreenBlueAlpha:()=>0,darkGrayColor:()=>0};
c.Application.sharedInstance().showHUD=(m)=>messages.push(m);
c.NSTimer.scheduledTimerWithTimeInterval=(seconds,repeat,fn)=>{
  const timer={repeat,fn,invalid:false,invalidate(){this.invalid=true;}};timers.push(timer);return timer;
};
function drainBuild(){let guard=0;while(timers.some(t=>!t.repeat&&!t.invalid)){const t=timers.find(t=>!t.repeat&&!t.invalid);t.invalid=true;t.fn();assert(++guard<10000);}}
function panel(){const pe={panel:new View({width:800,height:600}),webView:new View({x:0,y:44,width:800,height:556}),tableMode:'merge',fontScale:1,rootNotes:[],savedRootNoteIds:[],currentHtml:'OLD',savedWidthMap:{},savedImgHash:{}};pe.committedRenderState={tableMode:'merge',currentHtml:'OLD'};return pe;}
const roots=[{noteId:'LIFECYCLE',noteTitle:'标题',excerptText:'正文',childNotes:[],comments:[]}];
// Immediate native progress before the first timer, cancellation leaves old DOM.
let pe=panel(),old=pe.webView;
let t=api.startPanelRender(pe,roots);
assert(t.overlay && !old.removed);assert(pe.renderTask===t);
api.cancelPanelRender(pe);assert.strictEqual(pe.webView,old);assert.strictEqual(pe.currentHtml,'OLD');
drainBuild();assert(!old.removed);
// Superseded staging replies cannot commit to the new task.
t=api.startPanelRender(pe,roots);drainBuild();
let staleStage=t.staging;t.pageTimer.fn();let staleReply=staleStage.reply;
let next=api.startPanelRender(pe,roots);staleReply(JSON.stringify({complete:true,phase:'完成',done:0,total:0}));
assert.strictEqual(pe.webView,old);assert.strictEqual(pe.renderTask,next);assert(staleStage.removed);
drainBuild();next.pageTimer.fn();
next.staging.reply(JSON.stringify({complete:true,phase:'完成',done:0,total:0,errors:0,mathMs:0}));
assert(old.removed);assert(pe.webView.html.includes('正文'));assert(!pe.renderTask);assert(pe.lastRenderMetrics.totalMs>=0);
// Failed web page never replaces an already committed table.
old=pe.webView;t=api.startPanelRender(pe,roots);drainBuild();t.pageTimer.fn();
t.staging.reply(JSON.stringify({error:'fixture error',phase:'排版公式',done:0,total:1}));
assert.strictEqual(pe.webView,old);assert(!old.removed);assert(!pe.renderTask);assert(messages.some(m=>m.includes('fixture error')));
// Cancellation rolls back mode changes with the previous complete DOM.
pe.tableMode='titlecontent';t=api.startPanelRender(pe,roots);api.cancelPanelRender(pe);
assert.strictEqual(pe.tableMode,'merge');assert.strictEqual(pe.webView,old);
// Unexpected native read failure is reported and stops scheduling.
let failed=false;const bad={get noteTitle(){throw Error('broken native card');},noteId:'bad'};
api.createTableTask([bad],'merge',false,{},()=>{},()=>assert.fail('invalid native note committed'),()=>{failed=true;});
drainBuild();assert(failed);
console.log('4.0.18 native lifecycle: PASS (immediate progress, cancel, supersede, stale callbacks, commit, rollback, errors)');

// Browser bootstrap: no engine for plain text; ordered formulas, recoverable
// formula/image failures and cancellation cannot leave a false completion.
function mathPage(sources, brokenImage=false, cancelled=false) {
  const callbacks=[],order=[];
  const els=sources.map(src=>({
    getAttribute:key=>key==='data-math'?src:null,
    classList:{contains:()=>false,add(){}},
    setAttribute(key,value){this[key]=value;},appendChild(){},innerHTML:''
  }));
  const win={mnRenderCancelled:cancelled};
  const mj={tex2svg(src){order.push(src);if(src==='bad')throw Error('invalid formula');return {firstChild:null,querySelector:()=>null};}};
  new Function('window','document','MathJax','setTimeout',
    '('+api.tableMathRenderBootstrap.toString()+')();')(
      Object.assign(win,{MathJax:mj}),
      {querySelectorAll:selector=>selector==='img'?(brokenImage?[{complete:true,naturalWidth:0}]:[]):els},
      mj,fn=>callbacks.push(fn));
  while(callbacks.length)callbacks.shift()();
  return {state:win.mnRenderStatus,order,els};
}
assert(mathPage([]).state.complete);
let math=mathPage(['first','bad','last'],true);
assert.deepStrictEqual(math.order,['first','bad','last']);
assert(math.state.complete);assert.strictEqual(math.state.errors,2);
assert.strictEqual(math.els[1].textContent,'bad');
math=mathPage(['first'],false,true);assert(!math.state.complete);assert(!math.order.length);
console.log('4.0.18 math lifecycle: PASS (no math, document order, errors, cancellation)');
