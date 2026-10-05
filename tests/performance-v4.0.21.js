const assert = require('assert');
const {harness} = require('./performance-v4.0.18');

const h = harness();
const settings = {isSyncWidth: true, showBreadcrumb: false, savedWidthMap: {}, savedNodeWidthMap: {}, savedImgHash: {}, savedImageMap: {}};

function immediateBuild(roots, mode = 'titlecontent') {
  const queue = [];
  h.context.NSTimer.scheduledTimerWithTimeInterval = (delay, repeat, fn) => {
    const timer = {cancelled: false, invalidate() { this.cancelled = true; }};
    queue.push(() => { if (!timer.cancelled) fn(timer); });
    return timer;
  };
  let html = null, error = null;
  const task = h.api.createTableTask(roots, mode, false, settings, () => {}, value => { html = value; }, e => { error = e; });
  let ticks = 0;
  while (queue.length) {
    queue.shift()();
    if (++ticks > 100000) throw Error('render task did not yield');
  }
  if (error) throw error;
  assert(html, 'render task did not complete');
  return {html, task};
}

// A q_htext-bearing blank comment must never resolve its placeholder image
// or associated note.  This is the deterministic regression for the main
// unnecessary-work path fixed in 4.0.21.
{
  h.media.BLANK_PERF = h.fakePng('BLANK_PERF');
  const note = {
    noteId: 'PERF_BLANK_TEXT', noteTitle: '留白', excerptText: '',
    comments: [{type: 'LinkNote', q_hblank: true,
      q_htext: '留白文字只应渲染一次。', q_hpic: {paint: 'BLANK_PERF'},
      noteid: 'PERF_ASSOCIATED_NOTE'}], childNotes: []
  };
  const result = immediateBuild([note]);
  const metrics = result.task.metrics;
  assert.strictEqual((result.html.match(/留白文字只应渲染一次/g) || []).length, 1);
  assert.strictEqual(metrics.associatedNoteQueries, 0, 'blank text queried associated note');
  assert.strictEqual(metrics.imageReads, 0, 'blank text read placeholder image');
  assert.strictEqual(metrics.mediaReads, 0, 'blank text queried media database');
  assert.strictEqual(metrics.encodeCalls, 0, 'blank text encoded placeholder image');
}

// A normal image remains image-first and is encoded only during actual
// generation.  Repeating the same image in two comments should hit the task
// cache instead of doing another media read or Base64 conversion.
{
  const note = {
    noteId: 'PERF_IMAGE_CARD', noteTitle: '图片', excerptText: '',
    comments: [
      {type: 'LinkNote', q_hpic: {paint: 'IMAGE_MAIN_123'}},
      {type: 'LinkNote', q_hpic: {paint: 'IMAGE_MAIN_123'}}
    ], childNotes: []
  };
  const result = immediateBuild([note]);
  const metrics = result.task.metrics;
  assert(result.html.includes('<img'));
  assert.strictEqual(metrics.imageReads, 1, 'same image was read more than once');
  assert.strictEqual(metrics.mediaReads, 1, 'same media hash was queried more than once');
  assert.strictEqual(metrics.encodeCalls, 1, 'same image was encoded more than once');
  assert(metrics.cacheHits > 0, 'task cache did not record a hit');
}

// The progress phase names describe the actual work after the preview pass
// was removed.  The delayed scheduler test below also verifies that elapsed
// timer waiting is measured separately from native work.
{
  const note = {noteId: 'PERF_PHASES', noteTitle: '阶段', excerptText: '正文', comments: [], childNotes: []};
  const queue = [];
  const statuses = [];
  h.context.NSTimer.scheduledTimerWithTimeInterval = (delay, repeat, fn) => {
    const timer = {cancelled: false, invalidate() { this.cancelled = true; }};
    queue.push(() => { if (!timer.cancelled) fn(timer); });
    return timer;
  };
  let task;
  task = h.api.createTableTask([note], 'merge', false, settings, t => statuses.push(t.phase), () => {}, e => { throw e; });
  while (queue.length) queue.shift()();
  assert(!statuses.includes('处理图文'));
  assert(task.metrics.nativeWorkMs >= 0);
  assert(task.metrics.batchCount >= 1);
  assert(task.metrics.scheduledBatches >= task.metrics.batchCount);
  assert(Object.prototype.hasOwnProperty.call(task.metrics.stages, '统计布局'));
}

function delayedBuild(roots) {
  return new Promise((resolve, reject) => {
    const timers = [];
    h.context.NSTimer.scheduledTimerWithTimeInterval = (delay, repeat, fn) => {
      const timer = {cancelled: false, invalidate() { this.cancelled = true; }};
      const started = Date.now();
      timers.push(timer);
      setTimeout(() => {
        if (timer.cancelled) return;
        timer.waitedMs = Date.now() - started;
        fn(timer);
      }, Math.max(0, Math.round(delay * 1000)));
      return timer;
    };
    let task;
    task = h.api.createTableTask(roots, 'merge', false, settings, () => {}, html => resolve({html, task}), reject);
  });
}

(async () => {
  const roots = [];
  for (let i = 0; i < 180; i++) roots.push({noteId: 'PERF_DELAY_' + i, noteTitle: '卡片 ' + i, excerptText: '正文 ' + i, comments: [], childNotes: []});
  const result = await delayedBuild(roots);
  assert(result.html.includes('data-nodeid="PERF_DELAY_0"'));
  assert(result.task.metrics.totalMs >= result.task.metrics.nativeWorkMs);
  assert(result.task.metrics.scheduledBatches >= 1);
  assert(result.task.metrics.yieldWaitMs >= 0);
  console.log(JSON.stringify({
    cards: result.task.metrics.cards,
    totalMs: result.task.metrics.totalMs,
    nativeWorkMs: result.task.metrics.nativeWorkMs,
    timerWaitMs: result.task.metrics.yieldWaitMs,
    batches: result.task.metrics.batchCount,
    maxSliceMs: result.task.metrics.maxSliceMs
  }, null, 2));
  console.log('4.0.21 performance paths: PASS (blank-image bypass, single-pass media, phase metrics, delayed scheduler)');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
