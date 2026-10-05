const assert = require('assert');
const {harness} = require('./performance-v4.0.18');

const h = harness();
const c = h.context;
const api = h.api;
const timers = [];

class View {
  constructor(frame) {
    this.frame = frame || {x: 0, y: 0, width: 0, height: 0};
    this.children = [];
    this.hidden = false;
  }
  addSubview(child) { child.superview = this; this.children.push(child); }
  bringSubviewToFront(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    this.children.push(child);
  }
  removeFromSuperview() {
    if (this.superview) {
      const index = this.superview.children.indexOf(this);
      if (index >= 0) this.superview.children.splice(index, 1);
    }
    this.removed = true;
  }
  stopLoading() {}
  loadHTMLStringBaseURL() {}
  addTargetActionForControlEvents() {}
  setTitleForState() {}
  setTitleColorForState() {}
  evaluateJavaScript(script, callback) {
    if (script.includes('mnRenderCancelled')) return callback();
    this.reply = callback;
  }
}

c.UIView = View;
c.UILabel = View;
c.UIWebView = View;
c.UIButton = {buttonWithType: () => new View()};
c.UIFont = {systemFontOfSize: () => 0};
c.UIColor = {
  colorWithWhiteAlpha: () => 0,
  colorWithRedGreenBlueAlpha: () => 0,
  darkGrayColor: () => 0
};
c.Application.sharedInstance().showHUD = () => {};
c.NSTimer.scheduledTimerWithTimeInterval = (delay, repeat, fn) => {
  const timer = {repeat, fn, cancelled: false, invalidate() { this.cancelled = true; }};
  timers.push(timer);
  if (!repeat) timer.run = () => { if (!timer.cancelled) { timer.cancelled = true; fn(timer); } };
  return timer;
};

const panel = new View({x: 0, y: 0, width: 800, height: 600});
const webView = new View({x: 0, y: 44, width: 650, height: 506});
const resizeHandle = new View({x: 610, y: 510, width: 40, height: 40});
panel.addSubview(webView);
panel.addSubview(resizeHandle);
const pe = {
  panel, webView, resizeHandle, rootNotes: [{noteId: 'RESIZE_ROOT', noteTitle: '根', excerptText: '正文', comments: [], childNotes: []}],
  tableMode: 'merge', isCompactMode: false, isSyncWidth: true, showBreadcrumb: false,
  fontScale: 1, savedRootNoteIds: [], savedWidthMap: {}, savedNodeWidthMap: {}, savedImgHash: {}, savedImageMap: [],
  isLinked: true, committedRenderState: {webView, currentHtml: 'OLD', tableMode: 'merge'}
};
c.self.panels = [pe];

const task = api.startPanelRender(pe, pe.rootNotes);
while (timers.some(t => !t.repeat && !t.cancelled)) {
  const timer = timers.find(t => !t.repeat && !t.cancelled);
  timer.run();
}
assert(task.staging, 'staging WebView was not created');
assert.strictEqual(panel.children[panel.children.length - 1], resizeHandle, 'resize handle is behind staging WebView');
const recognizer = {view: resizeHandle, state: 1, translationInView: () => ({x: 0, y: 0})};
api.Mindmap2Table.instanceMethods.onResize.call(c.self, recognizer);
recognizer.state = 2; recognizer.translationInView = () => ({x: 55, y: 65});
api.Mindmap2Table.instanceMethods.onResize.call(c.self, recognizer);
assert.strictEqual(panel.frame.width, 855, 'resize width did not follow bottom-right drag');
assert.strictEqual(panel.frame.height, 665, 'resize height did not follow bottom-right drag');
recognizer.state = 3;
api.Mindmap2Table.instanceMethods.onResize.call(c.self, recognizer);

const pageTimer = timers.find(t => t.repeat && !t.cancelled);
assert(pageTimer, 'page lifecycle timer was not created');
pageTimer.fn(pageTimer);
task.staging.reply(JSON.stringify({complete: true, phase: '完成', done: 0, total: 0, errors: 0, mathMs: 0}));
assert.strictEqual(panel.children[panel.children.length - 1], resizeHandle, 'resize handle is behind committed WebView');
console.log('4.0.21 resize handle z-order: PASS (staging and committed WebView keep handle interactive)');
