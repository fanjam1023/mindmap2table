const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '../.mnaddon-work/main.js');
let source = fs.readFileSync(sourcePath, 'utf8');
const originalSource = source;
const baselineSource = fs.readFileSync(path.resolve(__dirname, './fixtures/interaction-v3.8.0.js'), 'utf8');

function between(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `missing source markers: ${start}`);
  return text.slice(from, to);
}

for (const [label, start, end] of [
  ['browser click bridge', "'// A. Jump logic", "'// B. Column Resizer"],
  ['image resize protection', "'// C. Img Resizer", "'// D. Section Fold/Unfold"],
  ['mindmap/table poll', 'function startGlobalPollTimer()', '// Library webView polling'],
  ['focus notification', '"onNoteFocusChanged:": function', '"exportTable:": function']
]) {
  assert.strictEqual(between(originalSource, start, end), between(baselineSource, start, end), `${label} changed unexpectedly`);
}
assert(originalSource.includes('public.html'), 'HTML export UTI missing');
assert(originalSource.includes('onExportSafari'), 'HTML export handler missing');
assert(originalSource.includes('批量导出_') && originalSource.includes('.html'), 'batch HTML export missing');
assert(!originalSource.includes('onExportPDF'), 'PDF export handler remains');
assert(!originalSource.includes('takeSnapshotWithWidth'), 'PDF snapshot API remains');
assert(!originalSource.includes('convertImageDataToPdfData'), 'PDF conversion API remains');
assert(!originalSource.includes('com.adobe.pdf'), 'PDF save UTI remains');
assert(!originalSource.includes('pdf-exporting'), 'PDF-only CSS remains');
assert(!/calc\([^)]*\*/.test(originalSource), 'unsupported CSS calc multiplication remains');
assert(!/word-break:\s*break-all/.test(originalSource), 'break-all remains');
assert(originalSource.includes('BUNDLED_MARKED_4_3_0_START'), 'bundled Markdown parser missing');
assert(originalSource.includes('MomoMarkedParser.parse(state.source'), 'full Markdown parser is not active');
assert(originalSource.includes('BUNDLED_MATHJAX_3_2_2_START'), 'bundled offline MathJax missing');
assert(originalSource.includes('MomoMathJaxSource'), 'MathJax source is not embedded');
assert(!/https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)[^"']*mathjax/i.test(originalSource), 'MathJax still depends on a CDN');
assert(!originalSource.includes('if (src) el.innerHTML = miniMath(src)'), 'legacy mini math renderer is still active');
for (const label of ['宽同', '宽独', '路径开', '路径关', '合并模式', '标题模式']) {
  assert(originalSource.includes(`"${label}"`), `toolbar label missing: ${label}`);
}
for (const invalidLabel of ['宽:同', '宽:独', '路径:开', '路径:关', '? "标题" : "合并"']) {
  assert(!originalSource.includes(invalidLabel), `legacy toolbar label remains: ${invalidLabel}`);
}
assert(originalSource.includes('var modeW = 66;'), 'mode button width does not fit full label');
assert(originalSource.includes('var bcW = 54;'), 'breadcrumb button width does not fit full label');

source = source.replace(
  /    return Mindmap2Table;\r?\n};/,
  '    return {' +
    ' createTableTask: typeof createTableTask === "function" ? createTableTask : null,' +
    ' tableMathRenderBootstrap: typeof tableMathRenderBootstrap === "function" ? tableMathRenderBootstrap : null,' +
    ' startPanelRender: typeof startPanelRender === "function" ? startPanelRender : null,' +
    ' cancelPanelRender: typeof cancelPanelRender === "function" ? cancelPanelRender : null,' +
    ' renderExcerpt: renderExcerpt,' +
    ' renderMarkdown: renderMarkdown,' +
    ' renderCommentText: renderCommentText,' +
    ' getNodeMediaResult: getNodeMediaResult,' +
    ' getExplicitNoteTitle: getExplicitNoteTitle,' +
    ' getNativeArrayItems: getNativeArrayItems,' +
    ' getNoteFromMindMapSelection: getNoteFromMindMapSelection,' +
    ' resolveSketchNote: resolveSketchNote,' +
    ' buildTitleContentTable: buildTitleContentTable,' +
    ' buildHtmlTable: buildHtmlTable,' +
    ' normalizeTableFontScale: normalizeTableFontScale,' +
    ' getFontScaleCssVariables: getFontScaleCssVariables,' +
    ' applyFontScaleToHtml: applyFontScaleToHtml,' +
    ' setPanelTableFontScale: setPanelTableFontScale,' +
    ' sortLibraryByLatest: sortLibraryByLatest,' +
    ' Mindmap2Table: Mindmap2Table' +
    ' };\n};'
);
assert(source.includes('Mindmap2Table: Mindmap2Table'), 'test export injection failed');

const media = Object.create(null);
const notes = Object.create(null);
const sketchFixtures = Object.create(null);
let sketchListFixtures = [];
const savedFiles = [];
const writtenFiles = [];
const fakePng = (tag) => ({ base64Encoding: () => 'iVBORw0KGgo' + tag });
media.IMAGE_MAIN_123 = fakePng('MAIN');
media.IMAGE_COMMENT_456 = fakePng('COMMENT');
media.DRAWING_WRD = { base64Encoding: () => 'd3JkLXN0cm9rZS1wYXlsb2Fk' };
media.DRAWING_ALIAS_A = fakePng('SAME_DRAWING_BYTES');
media.DRAWING_ALIAS_B = fakePng('SAME_DRAWING_BYTES');

const db = {
  getMediaByHash(hash) { return media[String(hash)] || null; },
  getNoteById(id) { return notes[String(id)] || null; },
  getSketchNoteForMindMapFocusNoteId(topicid, noteId) { return sketchFixtures[String(noteId)] || null; },
  getSketchNotesForMindMap() { return sketchListFixtures; },
  transArrayToJSCompatible(value) { return value && value.__converted ? value.__converted : value; }
};
const app = {
  tempPath: '/tmp',
  cachePath: '/tmp',
  waitHUDOnView() {},
  stopWaitHUDOnView() {},
  showHUD(message) { if (/失败|不支持/.test(String(message))) throw new Error(String(message)); },
  saveFileWithUti(file, uti) { savedFiles.push({ file, uti }); },
  studyController() { return null; }
};

const context = {
  JSB: {
    require() {},
    defineClass(name, instanceMethods, classMethods) { return { name, instanceMethods, classMethods }; }
  },
  Database: { sharedInstance: () => db },
  Application: { sharedInstance: () => app },
  MNUtil: { init() {} },
  MNNote: { noteFromNote(source) { return source && source.__mnWrapper ? source.__mnWrapper : null; } },
  NSData: {
    dataWithContentsOfFile(file) {
      if (String(file).includes('DRAWING_WRD_1700_0_1')) return fakePng('WRD_CACHE');
      if (String(file).includes('DRAWING_EXTERNAL_1700_0_1')) return fakePng('EXTERNAL_CACHE');
      return null;
    },
    dataWithStringEncoding(value) {
      return { writeToFileAtomically(file) { writtenFiles.push({ file, value }); return true; } };
    }
  },
  NSFileManager: {
    defaultManager() {
      return {
        fileExistsAtPath(file) {
          return String(file).includes('DRAWING_WRD_1700_0_1') || String(file).includes('DRAWING_EXTERNAL_1700_0_1');
        },
        contentsOfDirectoryAtPath() { return []; }
      };
    }
  },
  NSURL: { URLWithString: (v) => v },
  NSTimer: { scheduledTimerWithTimeInterval() {} },
  NSUserDefaults: { standardUserDefaults: () => ({}) },
  self: {
    isSyncWidth: true,
    showBreadcrumb: false,
    savedWidthMap: {},
    savedNodeWidthMap: {},
    savedImgHash: {},
    savedImageMap: {},
    panels: [],
    window: {}
  },
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Boolean,
  RegExp,
  Array,
  Object,
  Promise,
  isFinite,
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
const api = context.JSB.newAddon('/tmp');

const opaqueNativeArray = { __converted: ['converted-item'] };
const convertedOpaque = api.getNativeArrayItems(opaqueNativeArray, 10);
assert.strictEqual(convertedOpaque.length, 1, 'opaque NSArray conversion fallback missing');
assert.strictEqual(String(convertedOpaque[0]), 'converted-item', 'opaque NSArray item conversion missing');

function pic(hash = 'IMAGE_MAIN_123') { return { paint: hash }; }
function register(note) { notes[note.noteId] = note; return note; }

const continuousOcr = register({
  noteId: 'OCR_ROOT', noteTitle: '', textFirst: true,
  excerptText: '中，选择最合适的一个填入问号处，\n使之呈现一定规律',
  excerptPic: pic(), comments: [], childNotes: []
});
const ordinaryImage = register({
  noteId: 'IMAGE_ROOT', noteTitle: '密里图粗0ABCD', textFirst: false,
  excerptText: '不应显示的图片 OCR', excerptPic: pic(), comments: [], childNotes: []
});
const selectedMindMapTextCard = register({
  noteId: 'SELECTED_MINDMAP_TEXT', type: 256, noteTitle: '有益的困难', textFirst: true,
  excerptText: '心理学家 Bjork 把这种现象叫做「有益的困难」。',
  excerptPic: pic(), comments: [], childNotes: []
});
const realTitleImage = register({
  noteId: 'REAL_TITLE_IMAGE', noteTitle: '中兽医学; Traditional Chinese Veterinary Medicine',
  options: { toggleTitleDate: 1 }, excerptPic: pic(), comments: [], childNotes: []
});
const noTitleImage = register({
  noteId: 'NO_TITLE_IMAGE', noteTitle: '伪造OCR标题', excerptPic: pic(), comments: [], childNotes: []
});
const wrapperTitleImage = register({
  noteId: 'WRAPPED_TITLE_IMAGE', noteTitle: 'OCR fallback', excerptPic: pic(), comments: [], childNotes: [],
  __mnWrapper: { title: '真实显示标题', isOCR: false }
});
const wordCard = register({
  noteId: 'WORD_ROOT', noteTitle: 'therapeutic',
  excerptText: '/ˌθerəˈpjuːtɪk/ adj. 治疗的；有益于健康的',
  comments: [{ type: 'TextNote', text: 'Over and above a vastly improved provision of therapeutic mental healthcare.' }],
  childNotes: [],
  // Runtime MNNote.allTextPic is a whole-card snapshot and therefore already
  // contains the comment. The direct excerpt remains the main body; the
  // ordered comment loop adds the example exactly once.
  __mnWrapper: { allTextPic: { html: '<p>/ˌθerəˈpjuːtɪk/ adj. 治疗的；有益于健康的<br>Over and above a vastly improved provision of therapeutic mental healthcare.</p>' } }
});
const snapshotMarkdownCard = register({
  noteId: 'SNAPSHOT_MARKDOWN', noteTitle: '17. 贵', excerptText: '', comments: [], childNotes: [],
  __mnWrapper: { allTextPic: { html: '<p>【近义词辨析】 | 词汇 | 情感色彩 | 使用频率 | 搭配对象 | |---|---|---|---| | exorbitant | 贬义 | 中 | fees/costs/price |</p>' } }
});
const mixedCard = register({
  noteId: 'MIXED_ROOT', noteTitle: '1. 好，优秀', notesText: '【核心同义词辨析】完整正文',
  mediaList: ['IMAGE_COMMENT_456'],
  comments: [
    { type: 'LinkNote', q_hpic: pic('IMAGE_COMMENT_456'), q_htext: '' },
    { type: 'TextNote', text: '【核心同义词辨析】outstanding • perfect • superb' }
  ], childNotes: []
});
const drawingCard = register({
  noteId: 'DRAWING_ROOT', noteTitle: '', excerptPicData: fakePng('DRAWING'),
  getStrokesCount: () => 3,
  // Native NSArray-style comments must not abort table rendering after the
  // drawing image has been resolved.
  comments: { count: 1, objectAtIndex(index) { return index === 0 ? { type: 'TextNote', text: '原生评论' } : null; } },
  childNotes: []
});
const handwrittenCard = register({
  noteId: 'HANDWRITTEN_ROOT', notebookId: 'TOPIC', noteTitle: '多米诺骨牌', comments: [], childNotes: []
});
sketchFixtures.HANDWRITTEN_ROOT = {
  noteId: 'SKETCH_HANDWRITTEN', noteTitle: '', excerptPicData: fakePng('HANDWRITTEN'),
  getStrokesCount: () => 4,
  comments: { count: 1, objectAtIndex(index) { return index === 0 ? { type: 'TextNote', text: '草图评论' } : null; } },
  childNotes: []
};
const nativeListHandwrittenCard = register({
  noteId: 'HANDWRITTEN_NATIVE_LIST', notebookId: 'TOPIC', noteTitle: '原生数组手写卡', comments: [], childNotes: []
});
const nativeListSketch = {
  noteId: 'SKETCH_NATIVE_LIST', note: { noteId: 'HANDWRITTEN_NATIVE_LIST' },
  __mnWrapper: {
    imageDatas: { count: 1, objectAtIndex(index) { return index === 0 ? fakePng('NATIVE_LIST') : null; } }
  },
  getStrokesCount: () => 5,
  comments: [], childNotes: []
};
const mediaMatchedCard = {
  noteId: 'HANDWRITTEN_MEDIA_MATCH', notebookId: 'TOPIC', noteTitle: '',
  mediaList: 'MATCH_HASH-', comments: [], childNotes: [], getStrokesCount: () => 5
};
const mediaMatchedSketch = {
  noteId: 'SKETCH_MEDIA_MATCH', note: { noteId: 'UNRELATED_NOTE_ID' },
  mediaList: 'MATCH_HASH-', excerptPicData: fakePng('MEDIA_MATCH'),
  getStrokesCount: () => 5, comments: [], childNotes: []
};
const handwrittenParent = register({
  noteId: 'HANDWRITTEN_PARENT', noteTitle: '手写卡父节点', comments: [], childNotes: [handwrittenCard]
});
const wrdBaseCard = {
  noteId: 'WRD_BASE', noteTitle: '', comments: [], childNotes: [],
  __mnWrapper: { imageId: 'DRAWING_WRD' }
};
const wrdResolvedCard = {
  noteId: 'WRD_BASE', noteTitle: '', comments: [], childNotes: [],
  __baseNote: wrdBaseCard,
  __sketchSource: { noteId: 'WRD_SKETCH_PLACEHOLDER', getStrokesCount: () => 3 }
};
const externalDrawingCard = {
  noteId: 'DRAWING_EXTERNAL_CARD', noteTitle: '', textFirst: false,
  mediaList: 'DRAWING_EXTERNAL-',
  comments: [{ type: 'PaintNote', drawing: 'DRAWING_EXTERNAL' }], childNotes: [],
  getStrokesCount: () => 6
};
const aliasedDrawingCard = {
  noteId: 'DRAWING_ALIAS_CARD', noteTitle: '', textFirst: false,
  excerptPic: { paint: 'DRAWING_ALIAS_A' }, mediaList: 'DRAWING_ALIAS_A-',
  comments: [{ type: 'PaintNote', drawing: 'DRAWING_ALIAS_B' }], childNotes: [],
  getStrokesCount: () => 6
};
const directDataDrawingCard = {
  noteId: 'DRAWING_DIRECT_DATA', noteTitle: '', textFirst: false,
  mediaList: 'DRAWING_DIRECT_HASH-', excerptPicData: fakePng('DIRECT_DRAWING'),
  comments: [], childNotes: [], getStrokesCount: () => 6
};
const hashlessDuplicateDrawingCard = {
  noteId: 'DRAWING_HASHLESS_DUPLICATE', noteTitle: '', textFirst: false,
  excerptPicData: fakePng('SAME_DRAWING_BYTES'),
  comments: [{ type: 'PaintNote', drawing: 'DRAWING_ALIAS_B' }], childNotes: [],
  getStrokesCount: () => 6
};
const paintCommentCard = register({
  noteId: 'PAINT_COMMENT_CARD', noteTitle: '', comments: {
    count: 2,
    objectAtIndex(index) {
      if (index === 0) return { type: 'PaintNote', drawing: 'DRAWING_EXTERNAL' };
      if (index === 1) return { objectForKey(key) { return key === 'drawing' ? 'DRAWING_EXTERNAL' : null; } };
      return null;
    }
  }, childNotes: []
});
const plainText = register({
  noteId: 'TEXT_ROOT', noteTitle: '普通文本', excerptText: '第一段\n\n第二段\n- 列表项', comments: [], childNotes: []
});
const titleOnly = register({ noteId: 'TITLE_ONLY', noteTitle: '只有标题', comments: [], childNotes: [] });
const contentOnly = register({ noteId: 'CONTENT_ONLY', noteTitle: '', excerptText: '只有正文', comments: [], childNotes: [] });
const markdownCard = register({
  noteId: 'MARKDOWN_CARD', noteTitle: 'Markdown 卡片', excerptText: '',
  comments: [{
    type: 'HtmlNote',
    text: '### 核心同义词\n1. **通用有趣义**：interesting = amusing\n### 用法示例\n· The documentary offers an **absorbing** insight.'
  }],
  childNotes: []
});
const childText = register({ noteId: 'CHILD_TEXT', noteTitle: '子节点标题', excerptText: '子节点正文', comments: [], childNotes: [] });
const rootWithChild = register({ noteId: 'ROOT_WITH_CHILD', noteTitle: '根节点', excerptText: '根正文', comments: [], childNotes: [childText] });
const mixedParent = register({ noteId: 'MIXED_PARENT', noteTitle: '图文混排父节点', comments: [], childNotes: [mixedCard] });

// renderExcerpt routing
let out = api.renderExcerpt(continuousOcr, null, '');
assert(out.html.includes('选择最合适'), 'continuous OCR text missing');
assert(!out.html.includes('<img'), 'continuous OCR incorrectly rendered as image');

out = api.renderExcerpt(ordinaryImage, null, '');
assert(out.html.includes('<img'), 'ordinary image did not render image');
assert(!out.html.includes('不应显示的图片 OCR'), 'ordinary image leaked OCR text');

out = api.renderExcerpt(wordCard, null, '');
assert(out.html.includes('治疗的'), 'word definition missing');
assert(!out.html.includes('<img'), 'word card gained unrelated image');
assert(!out.html.includes('mental healthcare'), 'word main excerpt already contains the comment aggregate');

out = api.renderExcerpt(snapshotMarkdownCard, null, '');
assert(out.html.includes('<table class="md-table">') && out.html.includes('<td>exorbitant</td>'), 'HTML snapshot Markdown table was not parsed');

out = api.renderExcerpt(plainText, null, '');
assert(out.html.includes('第一段') && out.html.includes('第二段'), 'plain text was truncated');

out = api.renderExcerpt(drawingCard, null, '');
assert(out.html.includes('<img'), 'drawing fallback image missing');

const resolvedHandwritten = api.resolveSketchNote(handwrittenCard);
assert.strictEqual(resolvedHandwritten.noteId, handwrittenCard.noteId, 'handwritten card linkage id changed');
out = api.renderExcerpt(resolvedHandwritten, null, '');
assert(out.html.includes('iVBORw0KGgoHANDWRITTEN'), 'handwritten sketch image missing');
assert.strictEqual(resolvedHandwritten.comments.length, 1, 'native Sketch comments were not merged');
assert.strictEqual(resolvedHandwritten.comments[0].text, '草图评论', 'merged Sketch comment changed');

// The selected view is not the MbBookNote. Follow view → node → note and
// reload the real database note before resolving the title-only Sketch card.
const selectedViewWrapper = { note: { note: { noteId: 'HANDWRITTEN_ROOT' } } };
const selectedNativeArray = {
  count: 1,
  objectAtIndex(index) { return index === 0 ? selectedViewWrapper : null; }
};
const unpackedSelections = api.getNativeArrayItems(selectedNativeArray, 10);
assert.strictEqual(unpackedSelections.length, 1, 'native selection NSArray was not read');
assert.strictEqual(api.getNoteFromMindMapSelection(unpackedSelections[0]), handwrittenCard, 'selected view did not unwrap to the real MbBookNote');
const selectedSketch = api.resolveSketchNote(api.getNoteFromMindMapSelection(unpackedSelections[0]));
assert.strictEqual(selectedSketch.noteId, 'HANDWRITTEN_ROOT', 'Sketch merge changed the original linkage noteId');
out = api.renderExcerpt(selectedSketch, null, '');
assert(out.html.includes('iVBORw0KGgoHANDWRITTEN'), 'title-only selected card did not render its Sketch image');

// MarginNote exposes getSketchNotesForMindMap() as NSArray on some builds.
// A failed lookup must also be retried after conversion finishes.
assert.strictEqual(api.resolveSketchNote(nativeListHandwrittenCard), nativeListHandwrittenCard, 'empty sketch lookup changed the card');
sketchListFixtures = {
  count: 1,
  objectAtIndex(index) { return index === 0 ? nativeListSketch : null; }
};
const resolvedNativeList = api.resolveSketchNote(nativeListHandwrittenCard);
assert.strictEqual(resolvedNativeList.noteId, nativeListHandwrittenCard.noteId, 'native-list sketch linkage id changed');
out = api.renderExcerpt(resolvedNativeList, null, '');
assert(out.html.includes('iVBORw0KGgoNATIVE_LIST'), 'native NSArray sketch image missing');

sketchListFixtures = [nativeListSketch, mediaMatchedSketch];
const resolvedMediaMatch = api.resolveSketchNote(mediaMatchedCard);
assert.strictEqual(resolvedMediaMatch.noteId, mediaMatchedCard.noteId, 'mediaList Sketch linkage id changed');
out = api.renderExcerpt(resolvedMediaMatch, null, '');
assert(out.html.includes('iVBORw0KGgoMEDIA_MATCH'), 'Sketch mediaList association did not resolve');

// A singular lookup may return a title-only placeholder. The list fallback
// must still run and choose the matching Sketch that carries image data.
const singularPlaceholderCard = register({
  noteId: 'HANDWRITTEN_SINGULAR_PLACEHOLDER', notebookId: 'TOPIC',
  noteTitle: '草图标题', comments: [], childNotes: [], getStrokesCount: () => 4
});
sketchFixtures.HANDWRITTEN_SINGULAR_PLACEHOLDER = {
  noteId: 'SINGULAR_PLACEHOLDER', noteTitle: '',
  __mnWrapper: { allTextPic: { html: '<p>草图标题</p>' } },
  comments: [], childNotes: []
};
const listPayloadSketch = {
  noteId: 'SKETCH_LIST_PAYLOAD', note: { noteId: 'HANDWRITTEN_SINGULAR_PLACEHOLDER' },
  excerptPicData: fakePng('LIST_PAYLOAD'), getStrokesCount: () => 4,
  comments: [], childNotes: []
};
sketchListFixtures = [listPayloadSketch];
const resolvedPlaceholder = api.resolveSketchNote(singularPlaceholderCard);
assert.strictEqual(resolvedPlaceholder.noteId, singularPlaceholderCard.noteId, 'placeholder fallback changed linkage id');
out = api.renderExcerpt(resolvedPlaceholder, null, '');
assert(out.html.includes('iVBORw0KGgoLIST_PAYLOAD'), 'title-only singular Sketch did not fall back to list payload');

// 3.6.24 rendered proprietary `wrd` strokes through the original card's
// media hash and MarginNote's PNG cache. A Sketch placeholder must not hide
// that base-card media source.
out = api.renderExcerpt(wrdResolvedCard, null, '');
assert(out.html.includes('iVBORw0KGgoWRD_CACHE'), '3.6.24 wrd rendered-cache path regressed');

// Real drawing cards can have an external mediaList hash whose database API
// value is null while MarginNote's rendered PNG cache exists.
out = api.renderExcerpt(externalDrawingCard, null, '');
assert(out.html.includes('iVBORw0KGgoEXTERNAL_CACHE'), 'external drawing mediaList cache was rejected');

// A hashless NSData fallback still belongs to the sole mediaList entry on a
// confirmed drawing card. Preserve that identity for comment de-duplication.
const directDataResult = api.getNodeMediaResult(directDataDrawingCard, '');
assert(directDataResult && directDataResult.data, 'direct drawing NSData fallback missing');
assert.strictEqual(directDataResult.hash, 'DRAWING_DIRECT_HASH', 'drawing fallback did not retain its mediaList hash');

const resolvedMixed = api.resolveSketchNote(mixedCard);
assert.strictEqual(resolvedMixed.__syntheticExcerptText, true, 'mixed aggregate marker missing');
out = api.renderExcerpt(resolvedMixed, null, '');
assert.strictEqual(out.rendered, false, 'mixed synthetic aggregate should be suppressed');

// Explicit title routing
assert.strictEqual(api.getExplicitNoteTitle(ordinaryImage), '', 'hidden OCR title leaked');
assert.strictEqual(api.getExplicitNoteTitle(selectedMindMapTextCard), '有益的困难', 'selected mind-map card title disappeared');
assert.strictEqual(api.getExplicitNoteTitle(noTitleImage), '', 'image fake title leaked');
assert.strictEqual(api.getExplicitNoteTitle(realTitleImage), realTitleImage.noteTitle, 'real toggled title was removed');
assert.strictEqual(api.getExplicitNoteTitle(wrapperTitleImage), '真实显示标题', 'MNNote visible title was not retained');
assert.strictEqual(api.getExplicitNoteTitle(titleOnly), '只有标题', 'ordinary structure title was removed');
assert.strictEqual(api.getExplicitNoteTitle(mixedCard), mixedCard.noteTitle, 'visible mixed-card title was removed by comment media');

// Both table modes, root/child/linkage and ordered comments
for (const [name, build] of [
  ['titlecontent', api.buildTitleContentTable],
  ['merge', api.buildHtmlTable]
]) {
  const html = build([
    continuousOcr, ordinaryImage, realTitleImage, noTitleImage,
    wordCard, mixedCard, drawingCard, paintCommentCard, plainText, titleOnly,
    contentOnly, markdownCard, rootWithChild, mixedParent
  ], true);
  assert(html.includes('data-nodeid="OCR_ROOT"'), `${name}: OCR linkage id missing`);
  assert(html.includes('data-nodeid="CHILD_TEXT"'), `${name}: child linkage id missing`);
  assert(html.includes('只有标题'), `${name}: title-only missing`);
  assert(html.includes('只有正文'), `${name}: content-only missing`);
  assert(html.includes('原生评论'), `${name}: native NSArray comment missing`);
  assert(html.includes('data-nodeid="PAINT_COMMENT_CARD"'), `${name}: PaintNote card linkage missing`);
  assert(html.includes('iVBORw0KGgoEXTERNAL_CACHE'), `${name}: PaintNote drawing field image missing`);
  assert(!html.includes('伪造OCR标题'), `${name}: fake title present`);
  assert(html.includes('therapeutic') && html.includes('mental healthcare'), `${name}: word card incomplete`);
  assert.strictEqual((html.match(/Over and above a vastly improved provision of therapeutic mental healthcare\./g) || []).length, 1, `${name}: word example duplicated`);
  assert(html.includes('1. 好，优秀'), `${name}: mixed-card visible title missing`);
  assert(html.includes('<strong>通用有趣义</strong>'), `${name}: Markdown bold missing`);
  assert(!html.includes('### 核心同义词') && !html.includes('**通用有趣义**'), `${name}: raw Markdown markers remain`);
  const imageIndex = html.indexOf('IMAGE_COMMENT_456');
  const textIndex = html.indexOf('【核心同义词辨析】outstanding');
  assert(imageIndex >= 0 && textIndex > imageIndex, `${name}: mixed image/text order changed`);
  assert(!html.includes('word-break: break-all'), `${name}: break-all reintroduced`);
  assert(html.includes('--table-title-font-size'), `${name}: font scale variables missing`);
  assert(html.includes('window.scrollToNote'), `${name}: reverse linkage bridge missing`);

  const handwrittenRootHtml = build([handwrittenCard], true);
  const handwrittenChildHtml = build([handwrittenParent], true);
  assert(handwrittenRootHtml.includes('iVBORw0KGgoHANDWRITTEN'), `${name}: handwritten root image missing`);
  assert(handwrittenChildHtml.includes('iVBORw0KGgoHANDWRITTEN'), `${name}: handwritten child image missing`);
}

for (const selectedTitleHtml of [
  api.buildTitleContentTable([selectedMindMapTextCard], true),
  api.buildHtmlTable([selectedMindMapTextCard], true)
]) {
  assert(selectedTitleHtml.includes('有益的困难'), 'selected mind-map root title missing in a table mode');
  assert(selectedTitleHtml.includes('data-nodeid="SELECTED_MINDMAP_TEXT"'), 'selected mind-map linkage id missing');
}

// 4.2.0 preserves distinct explicit sources even when bytes match.
// The same drawing may be exposed as both the main mediaList item and a
// PaintNote comment. It must render once, while distinct comment images keep
// their original order.
for (const [name, build] of [
  ['titlecontent', api.buildTitleContentTable],
  ['merge', api.buildHtmlTable]
]) {
  const drawingHtml = build([externalDrawingCard], true);
  const occurrences = (drawingHtml.match(/iVBORw0KGgoEXTERNAL_CACHE/g) || []).length;
  assert.strictEqual(occurrences, 1, `${name}: drawing main image and PaintNote comment were duplicated`);

  const aliasedDrawingHtml = build([aliasedDrawingCard], true);
  const aliasedOccurrences = (aliasedDrawingHtml.match(/iVBORw0KGgoSAME_DRAWING_BYTES/g) || []).length;
  assert.strictEqual(aliasedOccurrences, originalSource.includes('BUNDLED_CARD_CONTENT_4_2_0') ? 2 : 1, `${name}: byte-identical drawing aliases were duplicated`);

  const hashlessDrawingHtml = build([hashlessDuplicateDrawingCard], true);
  const hashlessOccurrences = (hashlessDrawingHtml.match(/iVBORw0KGgoSAME_DRAWING_BYTES/g) || []).length;
  assert.strictEqual(hashlessOccurrences, originalSource.includes('BUNDLED_CARD_CONTENT_4_2_0') ? 2 : 1, `${name}: hashless main drawing and comment image were duplicated`);
}
assert(!/selViewLst\s*&&\s*selViewLst\.length/.test(originalSource), 'table generation still reads selection NSArray via .length');
assert(!/var sel = mmView\.selViewLst;\s*if \(sel && sel\.length/.test(originalSource), 'refresh still reads selection NSArray via .length');
assert(/\.section-header \{[^}]*border: 1px solid #94a3b8/.test(api.buildTitleContentTable([titleOnly], true)), 'title-only root frame is incomplete');

const markdown = api.renderMarkdown('第一段\n\n第二段');
assert(markdown.includes('第一段') && markdown.includes('第二段'), 'blank-line compaction removed text');
assert(markdown.includes('<p>第一段</p>') && markdown.includes('<p>第二段</p>'), 'paragraph boundaries were not parsed');
assert(originalSource.includes('.note-excerpt p { margin:0 0 0.35em 0; }'), 'parsed paragraphs are not compact');

const markdownHtmlNote = api.renderCommentText({
  type: 'HtmlNote',
  text: '### 核心同义词\n1. **通用有趣义**：interesting = amusing\n### 用法示例\n· The documentary offers an **absorbing** insight.'
});
assert(markdownHtmlNote.includes('<h3') && markdownHtmlNote.includes('核心同义词'), 'HtmlNote Markdown heading was not rendered');
assert(markdownHtmlNote.includes('<strong>通用有趣义</strong>'), 'HtmlNote Markdown bold was not rendered');
assert(markdownHtmlNote.includes('<ol') && markdownHtmlNote.includes('<ul'), 'ordered or typographic-bullet Markdown list was not rendered');
assert(!markdownHtmlNote.includes('###') && !markdownHtmlNote.includes('**'), 'raw Markdown markers remain visible');

// Some AI comments arrive with a complete pipe table flattened onto one line
// even though the source card displays normal rows. The parser must restore
// those row boundaries generically instead of adding table-specific regexes.
const collapsedTable = api.renderCommentText({
  type: 'HtmlNote',
  text: '【近义词辨析】 | 词汇 | 情感色彩 | 使用频率 | 搭配对象 | |----------------|------------|------------|------------| | exorbitant | 贬义 | 中 | fees/costs/price | | pricey | 中性 | 高 | products/services |'
});
assert(collapsedTable.includes('<table class="md-table">'), 'flattened Markdown table was not recovered');
assert(collapsedTable.includes('<th>词汇</th>') && collapsedTable.includes('<td>exorbitant</td>'), 'flattened Markdown table cells missing');
assert(!collapsedTable.includes('|----------------|'), 'flattened Markdown table delimiter leaked');
for (const malformedTable of [
  '【近义词辨析】 |\n词汇 | 情感色彩 | 使用频率 | 搭配对象 | |----------------|------------|------------|------------| | exorbitant | 贬义 | 中 | fees/costs/price | | pricey | 中性 | 高 | products/services |',
  '【近义词辨析】 | 词汇 | 情感色彩 | 使用频率 | 搭配对象 |\n|----------------|------------|------------|------------|\n| exorbitant | 贬义 | 中 | fees/costs/price |\n| pricey | 中性 | 高 | products/services |'
]) {
  const repaired = api.renderCommentText({ type: 'HtmlNote', text: malformedTable });
  assert(repaired.includes('<table class="md-table">') && repaired.includes('<th>词汇</th>'), 'mixed-break Markdown table was not recovered');
}
const escapedPipeTable = api.renderMarkdown('词汇 &#124; 含义 &#124; &#124; --- &#124; --- &#124; &#124; rich &#124; wealthy &#124;');
assert(escapedPipeTable.includes('<table class="md-table">') && escapedPipeTable.includes('<td>rich</td>'), 'HTML-escaped Markdown table was not recovered');
const htmlWrappedMarkdownTable = api.renderCommentText({
  type: 'HtmlNote',
  text: '<p>【近义词辨析】 | 词汇 | 情感色彩 | 使用频率 | 搭配对象 | |----------------|------------|------------|------------| | exorbitant | 贬义 | 中 | fees/costs/price | | pricey | 中性 | 高 | products/services |</p>'
});
assert(htmlWrappedMarkdownTable.includes('<table class="md-table">') && htmlWrappedMarkdownTable.includes('<td>pricey</td>'), 'HTML-wrapped Markdown table was not parsed');
const exactSeventeenCard = api.renderMarkdown(`【核心替换词】

- exorbitant: 强调价格高到不合理（e.g. exorbitant tuition fees）
- pricey: 口语化，指价格偏高（e.g. pricey organic vegetables）
- unaffordable: 无法负担的（e.g. unaffordable housing）
- prohibitive: 因价格过高而阻止购买的（e.g. prohibitive cost of medical treatment）
- overpriced: 定价过高的（e.g. overpriced souvenirs）

【搭配示例】
• The exorbitant cost of living in the city forced many to move out.
• Designer brands are often considered pricey but trendy.
• For most young people, buying a house is unaffordable without loans.
• The prohibitive price tag made the new technology inaccessible to average consumers.
• Customers complained that the restaurant's dishes were overpriced for the quality.

【使用场景】

- 学术写作：优先使用 exorbitant/prohibitive（正式语境）
- 口语表达：常用 pricey/overpriced（日常对话）
- 社会议题：讨论住房/医疗时用 unaffordable（强调民生负担）

【近义词辨析】

| 词汇           | 情感色彩 | 使用频率 | 搭配对象              |
| ------------ | ---- | ---- | ----------------- |
| exorbitant   | 贬义   | 中    | fees/costs/price  |
| pricey       | 中性   | 高    | products/services |
| unaffordable | 贬义   | 中    | housing/education |
| prohibitive  | 中性   | 低    | cost/expense      |
| overpriced   | 贬义   | 中    | goods/dishes      |`);
assert(exactSeventeenCard.includes('<table class="md-table">'), 'exact card Markdown table was not rendered');
assert(exactSeventeenCard.includes('<th>词汇</th>') && exactSeventeenCard.includes('<td>overpriced</td>'), 'exact card Markdown table content is incomplete');
const exactCommentCard = api.renderCommentText({ type: 'HtmlNote', text: `【核心替换词】

- exorbitant: 强调价格高到不合理（e.g. exorbitant tuition fees）
- pricey: 口语化，指价格偏高（e.g. pricey organic vegetables）

【近义词辨析】

| 词汇           | 情感色彩 | 使用频率 | 搭配对象              |
| ------------ | ---- | ---- | ----------------- |
| exorbitant   | 贬义   | 中    | fees/costs/price  |
| overpriced   | 贬义   | 中    | goods/dishes      |` });
assert(exactCommentCard.includes('<table class="md-table">') && exactCommentCard.includes('<td>goods/dishes</td>'), 'exact HtmlNote card Markdown table was not rendered');
const trustedHtmlNote = '<div><strong>已格式化 HTML</strong></div>';
assert.strictEqual(api.renderCommentText({ type: 'HtmlNote', text: trustedHtmlNote }), trustedHtmlNote, 'real HtmlNote HTML was altered');
const fullMarkdown = api.renderCommentText({
  type: 'HtmlNote',
  text: '## 二级标题\n**粗体** *斜体* ~~删除~~ ==高亮== `代码` [链接](https://example.com)\n> 引用\n| 词汇 | 含义 |\n| --- | --- |\n| rich | wealthy |'
});
for (const marker of ['<h2', '<strong>粗体</strong>', '<em>斜体</em>', '<del>删除</del>', '<mark>高亮</mark>', '<code', 'href="https://example.com"', '<blockquote', '<table class="md-table"']) {
  assert(fullMarkdown.includes(marker), `full Markdown feature missing: ${marker}`);
}
const gfmMatrix = api.renderCommentText({
  type: 'HtmlNote',
  text: 'Setext 标题\n---\n\n- 父项\n  - 子项\n- [x] 已完成\n- [ ] 未完成\n\n```js\nconst value = **not bold**;\n```\n\n<https://example.com/docs>\n\n\\*转义星号\\*\n\n![替代文字](https://example.com/image.png "图片")'
});
for (const marker of ['<h2>Setext 标题</h2>', '<ul>', '<input checked="" disabled="" type="checkbox">', '<pre><code class="language-js">', 'href="https://example.com/docs"', '*转义星号*', 'src="https://example.com/image.png"']) {
  assert(gfmMatrix.includes(marker), `GFM matrix feature missing: ${marker}`);
}
assert(gfmMatrix.includes('const value = **not bold**;'), 'fenced code content was incorrectly parsed as emphasis');
const mathMarkdown = api.renderCommentText({ type: 'HtmlNote', text: '公式：$x_{n+1}$ 与 $$\\frac{a}{b}$$' });
assert(mathMarkdown.includes('class="math-inline"') && mathMarkdown.includes('class="math-block"'), 'math extensions were lost after GFM parsing');
const exactArrowFormula = api.renderMarkdown('$\\begin{aligned}&a_i,b_i\\in\\mathbb{C},i=1,2,\\ldots,n\\\\\\Rightarrow&\\left|\\sum_{i=1}^na_ib_i\\right|\\leq\\left(\\sum_{i=1}^n|a_i|^2\\right)^{\\frac12}\\end{aligned}$');
assert(!exactArrowFormula.includes('MNMATHBLOCKTOKEN'), 'nested math placeholder leaked from inline aligned environment');
assert(exactArrowFormula.includes('\\begin{aligned}') && exactArrowFormula.includes('\\Rightarrow'), 'aligned derivation or arrow was altered before MathJax');
const fullLatexMarkdown = api.renderCommentText({
  type: 'HtmlNote',
  text: [
    '行内：\\(\\boldsymbol{F}=m\\vec{a}\\)',
    '块级：\\[\\begin{aligned}a&=b+c\\\\d&=e\\end{aligned}\\]',
    '\\begin{equation}\\int_0^\\infty e^{-x^2}\\,dx=\\frac{\\sqrt{\\pi}}{2}\\end{equation}',
    '扩展：$\\qty(\\dv{f}{x}) + \\color{red}{x}$'
  ].join('\n\n')
});
assert.strictEqual((fullLatexMarkdown.match(/class="math-inline"/g) || []).length, 2, 'inline TeX delimiters were not both preserved');
assert.strictEqual((fullLatexMarkdown.match(/class="math-block"/g) || []).length, 2, 'block TeX delimiters/environments were not both preserved');
for (const sourcePart of ['\\boldsymbol{F}', '\\begin{aligned}', '\\begin{equation}', '\\qty(', '\\color{red}']) {
  assert(fullLatexMarkdown.includes(sourcePart), 'TeX source was altered before MathJax: ' + sourcePart);
}
const mathHtml = api.buildTitleContentTable([{
  noteId: 'LATEX_ROOT', noteTitle: 'Markdown + LaTeX',
  excerptText: [
    '$\\begin{aligned}&a_i,b_i\\in\\mathbb{C},i=1,2,\\ldots,n\\\\\\Rightarrow&\\left|\\sum_{i=1}^na_ib_i\\right|\\leq\\left(\\sum_{i=1}^n|a_i|^2\\right)^{\\frac12}\\end{aligned}$',
    '行内：\\(\\boldsymbol{F}=m\\vec{a}\\)',
    '$$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$',
    '\\begin{equation}\\int_0^\\infty e^{-x^2}\\,dx=\\frac{\\sqrt{\\pi}}{2}\\end{equation}',
    '扩展：$\\qty(\\dv{f}{x}) + \\color{red}{x}$'
  ].join('\n\n'),
  comments: [], childNotes: []
}], true);
assert(mathHtml.includes('id="MathJax-script"'), 'generated table does not contain the offline MathJax runtime');
assert(mathHtml.includes('MathJax.tex2svg'), 'generated table does not invoke TeX to SVG rendering');
assert(mathHtml.includes('"physics","colorv2"'), 'MathJax full TeX extensions are not enabled');
const mathScript = mathHtml.match(/<script id="MathJax-script">[\s\S]*?<\/script>/i);
assert(mathScript && !/src=["']https?:/i.test(mathScript[0]), 'offline MathJax script has a network src');
if (process.env.MN_LATEX_FIXTURE) fs.writeFileSync(process.env.MN_LATEX_FIXTURE, mathHtml);
notes['4599E21B-4779-4C4D-91C3-E54C6B331671'] = {
  noteId: '4599E21B-4779-4C4D-91C3-E54C6B331671',
  noteTitle: '复数情形的柯西不等式'
};
const pathLinkMarkdown = api.renderCommentText({ type: 'HtmlNote', text: '应用：\n\nmarginnote4app://note/4599E21B-4779-4C4D-91C3-E54C6B331671/path/H4sIAAAAAAAAE5XMOwvCQBAE4P9y9eXY3dvXpbWwtbA=' });
assert(pathLinkMarkdown.includes('复数情形的柯西不等式'), 'MarginNote path link title was not rendered: ' + pathLinkMarkdown);
assert(!pathLinkMarkdown.includes('/path/H4sIA'), 'MarginNote compressed path suffix leaked into card text');
const unsafeMarkdown = api.renderCommentText({ type: 'HtmlNote', text: '<script>alert(1)</script>\n[危险链接](javascript:alert(1))' });
assert(!unsafeMarkdown.includes('<script>') && unsafeMarkdown.includes('&lt;script&gt;'), 'raw script HTML was not escaped');
assert(!/href="\s*javascript:/i.test(unsafeMarkdown), 'unsafe Markdown URL was not blocked');

// Font scaling state and persistence helpers
assert.strictEqual(api.normalizeTableFontScale(0.1), 0.7);
assert.strictEqual(api.normalizeTableFontScale(9), 1.6);
assert.strictEqual(api.normalizeTableFontScale(1.14), 1.1);
const scaledHtml = api.applyFontScaleToHtml('<html><head></head><body></body></html>', 1.2);
assert(scaledHtml.includes('--table-title-font-size:19.2px'), 'title scale is not proportional');
assert(scaledHtml.includes('--table-text-font-size:18px'), 'body scale is not proportional');
assert(!scaledHtml.includes('calc('), 'unsupported CSS multiplication introduced');
let scaleJs = '';
const pe = { fontScale: 1, webView: { evaluateJavaScript(js, cb) { scaleJs = js; if (cb) cb(); } } };
assert.strictEqual(api.setPanelTableFontScale(pe, 1.3), 1.3);
assert(scaleJs.includes('1.3'), 'font scale was not sent to WebView');

// Live HTML export retains the active DOM, including the current root font variables.
const exportPanelView = {};
const exportButton = { superview: exportPanelView };
const exportPanel = {
  panel: exportPanelView,
  exportBtn: exportButton,
  rootNotes: [plainText],
  tableMode: 'titlecontent',
  isCompactMode: true,
  fontScale: 1.3,
  titleLabel: { text: '测试/表格' },
  webView: {
    evaluateJavaScript(js, cb) {
      assert(js.includes('document.documentElement.outerHTML'), 'live DOM was not requested');
      cb('<html style="--table-title-font-size:20.8px"><head></head><body><div class="note-title">测试</div><span class="math-inline" data-math-rendered="1"><mjx-container><svg data-latex-export="1"></svg></mjx-container></span><script>removeMe()</script></body></html>');
    }
  }
};
context.self.panels = [exportPanel];
api.Mindmap2Table.instanceMethods.onExportSafari.call(context.self, exportButton);
assert.strictEqual(writtenFiles.length, 1, 'HTML data was not written');
assert.strictEqual(savedFiles.length, 1, 'HTML share sheet was not opened');
assert.strictEqual(savedFiles[0].uti, 'public.html', 'wrong HTML UTI');
assert(savedFiles[0].file.endsWith('.html'), 'saved artifact is not HTML');
assert(writtenFiles[0].value.includes('--table-title-font-size:20.8px'), 'live font scale was not retained');
assert(!writtenFiles[0].value.includes('<script>'), 'interactive scripts were not removed');
assert(writtenFiles[0].value.includes('data-latex-export="1"'), 'rendered offline LaTeX SVG was removed from export');

// Library latest-first sorting covers root items, items inside folders and folder order.
const sortedLibrary = api.sortLibraryByLatest({
  rootItems: [
    { id: 'root-old', createTime: 100 },
    { id: 'root-new', createTime: 300 }
  ],
  folders: [
    { id: 'folder-old', createTime: 50, items: [{ id: 'old-1', createTime: 120 }] },
    { id: 'folder-new', createTime: 60, items: [
      { id: 'new-older', createTime: 200 },
      { id: 'new-latest', createTime: 500 }
    ] },
    { id: 'folder-empty', createTime: 400, items: [] }
  ]
});
assert.strictEqual(sortedLibrary.rootItems.map(item => item.id).join(','), 'root-new,root-old', 'root study sets are not newest first');
assert.strictEqual(sortedLibrary.folders.map(folder => folder.id).join(','), 'folder-new,folder-empty,folder-old', 'folders are not ordered by latest content');
assert.strictEqual(sortedLibrary.folders[0].items.map(item => item.id).join(','), 'new-latest,new-older', 'folder study sets are not newest first');
assert(!originalSource.includes('setTitleForState("最新排序"'), 'latest sorting should not require a button');
assert(!originalSource.includes('"onLibSortLatest"'), 'manual latest-sort handler should not exist');
assert(originalSource.includes('if (data.latestSortVersion !== 1)'), 'existing library migration does not sort automatically');
assert(originalSource.includes('sortLibraryByLatest(libData);'), 'newly saved study sets are not sorted automatically');

console.log('v3.9.0 regression: PASS');
