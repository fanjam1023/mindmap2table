const assert = require('assert');
const {harness} = require('./performance-v4.0.18');

const h = harness();
const {api, context: c} = h;
c.UIColor = {
  colorWithRedGreenBlueAlpha() { return {}; },
  colorWithWhiteAlpha() { return {}; }
};

function button() {
  return {
    layer: {},
    setTitleForState(title) { this.title = title; },
    setTitleColorForState() {}
  };
}

// Switching to independent widths must update the panel entry, because
// refresh renders from panel settings rather than the global addon object.
const panel = {};
const webView = {
  evaluateJavaScript(script, callback) {
    this.lastScript = script;
    if (callback) callback(null, null);
  }
};
const pe = {
  panel,
  webView,
  isSyncWidth: true,
  savedWidthMap: {},
  savedNodeWidthMap: {},
  savedImgHash: {},
  savedImageMap: {},
  rootNotes: [],
  savedRootNoteIds: []
};
const syncButton = button();
syncButton.superview = panel;
c.self.panels = [pe];
c.self.isSyncWidth = true;
api.Mindmap2Table.instanceMethods.onToggleWidthSync.call(c.self, syncButton);
assert.strictEqual(c.self.isSyncWidth, false, 'global width mode did not switch to independent');
assert.strictEqual(pe.isSyncWidth, false, 'panel width mode was not persisted');
assert.strictEqual(syncButton.title, '宽独', 'independent width label missing');
assert(webView.lastScript.includes('window.isSyncWidth = false'), 'browser independent mode was not enabled');

// Refresh must capture both depth-level and node-level widths, then keep the
// node-level map available to the next standalone render.
webView.evaluateJavaScript = function (script, callback) {
  this.lastScript = script;
  callback(JSON.stringify({
    td: {'1': '180px'},
    nodeTd: {WIDTH_NODE: {w: '321px', depth: '1'}},
    img: {}
  }), null);
};
const refreshButton = {superview: panel};
api.Mindmap2Table.instanceMethods.onRefresh.call(c.self, refreshButton);
assert.strictEqual(pe.savedWidthMap['1'], '180px', 'refresh did not retain depth width');
assert.strictEqual(pe.savedNodeWidthMap.WIDTH_NODE.w, '321px', 'refresh did not retain independent node width');

// The saved independent width must be used by both table builders.
c.self.isSyncWidth = pe.isSyncWidth;
c.self.savedWidthMap = pe.savedWidthMap;
c.self.savedNodeWidthMap = pe.savedNodeWidthMap;
const note = {noteId: 'WIDTH_NODE', noteTitle: '宽度测试', excerptText: '正文', comments: [], childNotes: []};
const parent = {noteId: 'WIDTH_PARENT', noteTitle: '父节点', excerptText: '', comments: [], childNotes: [note]};
for (const [name, build] of [['titlecontent', api.buildTitleContentTable], ['merge', api.buildHtmlTable]]) {
  const html = build([parent], false);
  assert(html.includes('width: 321px !important'), `${name}: independent width was not applied after refresh`);
}

console.log('4.1.0 width refresh memory: PASS (panel mode and node widths persist)');
