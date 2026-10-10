/* Ordered, provenance-bearing card content. No text similarity deduplication. */
var MomoCardModel = (function () {
    function create(original, api) {
        var model = {noteId: String(api.field(original, 'noteId') || ''), title: '', titleEvidence: '', blocks: [], warnings: []};
        var supplied = new Set();
        function block(kind, value, source, extra) {
            if (value === null || value === undefined || value === '') return;
            if (supplied.has(source)) return;
            supplied.add(source);
            var result = {kind: kind, value: value, source: source};
            if (extra) Object.keys(extra).forEach(function (key) { result[key] = extra[key]; });
            model.blocks.push(result);
        }
        function text(value, source, type) { if (value && String(value).trim()) block(type || 'text', String(value), source); }
        function image(note, hash, source) {
            var result;
            try { result = api.image(note, hash); }
            catch (error) { model.warnings.push('图片读取失败，请回源查看'); return false; }
            if (!result || !result.base64) return false;
            if (result.warning) model.warnings.push(result.warning);
            block('image', result.base64, source, {hash: result.hash || hash || '', mime: result.mime,
                layers: result.layers, width: result.width, height: result.height});
            return true;
        }
        function safe(source, fn) {
            try { fn(); }
            catch (error) { model.warnings.push(source + '读取失败，请回源查看'); }
        }
        if (!original) { model.warnings.push('卡片无法读取，请回源查看'); return {model:model,step:function () { return false; }}; }
        safe('标题', function () {
            model.title = api.title(original); model.titleEvidence = model.title ? 'original-visible-title' : 'hidden-or-missing';
        });
        var comments = [], excerpt = '';
        safe('正文', function () { comments = api.comments(original); excerpt = api.field(original,'excerptText'); });
        if (api.field(original, '__syntheticExcerptText') && comments.length) excerpt = '';
        var hash = '', mainImage = false;
        safe('主摘录', function () {
            // Read text preference before any placeholder media lookup.
            if (excerpt && (api.blank(original) || api.textFirst(original))) { text(excerpt, 'excerpt'); return; }
            hash = api.hash(original);
            if (hash || ((!excerpt || !String(excerpt).trim()) && api.hasMedia(original)) || api.drawing(original)) mainImage = image(original, hash, 'excerpt');
            if (!mainImage) text(excerpt, 'excerpt');
        });
        // Sketch is a payload fallback. Its title, children and identity are never used.
        if (!model.blocks.length && !comments.length) safe('手写内容', function () {
            var sketch = api.sketch(original);
            if (sketch && sketch !== original) {
                var sketchText = api.field(sketch, 'excerptText');
                if (sketchText && api.textFirst(sketch)) text(sketchText, 'sketch-excerpt');
                else if (!image(sketch, api.hash(sketch), 'sketch-excerpt')) text(sketchText, 'sketch-excerpt');
                comments = api.comments(sketch);
            }
        });
        function readComment(comment, index) {
            var source = 'comment:' + index;
            safe('评论 ' + (index + 1), function () {
                var type = String(api.field(comment, 'type') || '').toLowerCase();
                var direct = type === 'linknote' ? api.field(comment, 'q_htext') : api.field(comment, 'text');
                var blank = api.blank(comment), preferText = type === 'linknote' && api.textFirst(comment), target = null;
                if ((blank || preferText) && direct && String(direct).trim()) { text(direct, source); return; }
                var paint = api.commentHash(comment);
                // Only resolve an associated card when its own payload is needed.
                if (type === 'linknote' && api.field(comment, 'noteid') && (blank || preferText || !paint) && (!direct || !String(direct).trim())) target = api.lookup(api.field(comment, 'noteid'));
                blank = blank || api.blank(target);
                if ((!direct || !String(direct).trim()) && target) direct = api.field(target, 'excerptText');
                if (blank || preferText || (target && api.textFirst(target))) {
                    if (direct && String(direct).trim()) { text(direct, source); return; }
                    if (blank) { model.warnings.push('留白卡片内容无法读取'); return; }
                }
                // Explicit comment positions remain separate even with equal text/bytes.
                if (paint && mainImage && api.drawing(original) && model.blocks.some(function (item) { return item.source === 'excerpt' && item.hash === paint; })) return;
                if (paint && image(null, paint, source)) return;
                if (direct && String(direct).trim()) { text(direct, source, type === 'htmlnote' ? 'html-or-markdown' : 'text'); return; }
                if (type && type !== 'textnote' && type !== 'htmlnote') block('unsupported', '此评论内容无法读取，请回源查看（' + type + '）', source);
            });
        }
        function finish() {
        // Whole-card wrappers are consulted only if no direct blocks could be read.
        if (!model.blocks.length && !model.warnings.length) safe('聚合内容', function () {
            var html = api.html(original);
            if (html) text(html, 'aggregate', 'html-or-markdown');
            else { var aggregate = api.aggregate(original); if (String(aggregate || '').trim() !== model.title) text(aggregate, 'aggregate'); }
        });
        if (!model.blocks.length && api.blank(original)) model.warnings.push('留白卡片内容无法读取');
        }
        var index = 0, done = false;
        return {model:model,step:function () {
            if (index < comments.length) { readComment(comments[index],index++); return true; }
            if (!done) { finish(); done = true; }
            return false;
        }};
    }
    function read(original, api) {
        var session = create(original,api); while(session.step()) {}
        return session.model;
    }
    return {read: read, create:create};
}());
