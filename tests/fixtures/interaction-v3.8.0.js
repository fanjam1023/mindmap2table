JSB.newAddon = function (mainPath) {
    JSB.require('UIView');
    JSB.require('UILabel');
    JSB.require('UIButton');
    JSB.require('UIWebView');
    JSB.require('UIPanGestureRecognizer');
    JSB.require('UITapGestureRecognizer');
    JSB.require('UIImageView');
    try { JSB.require('UIImage'); } catch (eImage) { }
    JSB.require('UIColor');
    JSB.require('UIFont');
    JSB.require('NSURL');
    JSB.require('UIPasteboard');
    JSB.require('NSDictionary');
    JSB.require('NSData');
    JSB.require('NSDate');
    JSB.require('NSFileManager');
    try { JSB.require('NSKeyedUnarchiver'); } catch (e3) { }

    // MarginNote 4 includes LibMN's MNNote wrapper.  Load it when available
    // so converted handwriting cards use the same image/text extraction path
    // as the native card UI; all calls remain guarded for older builds.
    try { JSB.require('mnutils'); } catch (e0) { }
    try { JSB.require('mnnote'); } catch (e1) { }
    try {
        if (typeof MNUtil !== "undefined" && MNUtil.init) MNUtil.init(mainPath);
    } catch (e2) { }

    // ==========================================
    // 纯JS环境辅助函数
    // ==========================================

    function escapeHtml(unsafe) {
        if (!unsafe) return "";
        return unsafe.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatLinks(text) {
        if (!text) return "";
        var regex = /(marginnote[34]app:\/\/note\/([A-Z0-9\-]+))/ig;
        return text.replace(regex, function (match, url, noteId) {
            var linkedNote = Database.sharedInstance().getNoteById(noteId);
            if (linkedNote) {
                var displayTitle = linkedNote.noteTitle;
                if (!displayTitle && linkedNote.excerptText) {
                    displayTitle = linkedNote.excerptText.substring(0, 10) + "...";
                }
                if (!displayTitle) displayTitle = "未命名笔记";
                return '<span style="color: #0366d6; background: #eaf5ff; padding: 2px 4px; border-radius: 4px; word-break: normal; overflow-wrap: normal;">🔗 ' + escapeHtml(displayTitle) + '</span>';
            }
            return match;
        });
    }

    function renderMarkdown(text) {
        if (!text) return "";
        var html = text;

        // ── 0. 保护数学公式（$$...$$  和  $...$）不被 Markdown 规则破坏 ──
        var mathPlaceholders = [];
        // 块级公式优先
        html = html.replace(/\$\$([\s\S]*?)\$\$/g, function (match) {
            var idx = mathPlaceholders.length;
            mathPlaceholders.push(match);
            return "\x02MATH" + idx + "\x03";
        });
        // 行内公式
        html = html.replace(/\$([^\$\n]+?)\$/g, function (match) {
            var idx = mathPlaceholders.length;
            mathPlaceholders.push(match);
            return "\x02MATH" + idx + "\x03";
        });

        // 表格解析 (GFM 风格) - V9.1 增强：支持缩进列表中的表格
        var tableRegex = /^[ ]*\|(.+)\|\r?\n[ ]*\|( *[-:]+[-| :]*)\|/m;
        if (tableRegex.test(html)) {
            html = html.replace(/^([ ]*\|(?:.+)\|\r?\n[ ]*\|(?: *[-:]+[-| :]*))\|(?:\r?\n[ ]*\|(?:.+)\|)+/gm, function (match) {
                var lines = match.trim().split(/\r?\n/);
                if (lines.length < 2) return match;
                var tableHtml = '<table class="md-table"><thead>';
                var headers = lines[0].trim().split('|').filter(function (s, i, a) { return i > 0 && i < a.length - 1; });
                tableHtml += '<tr>';
                for (var h = 0; h < headers.length; h++) {
                    tableHtml += '<th>' + headers[h].trim() + '</th>';
                }
                tableHtml += '</tr></thead><tbody>';
                for (var l = 2; l < lines.length; l++) {
                    var cells = lines[l].trim().split('|').filter(function (s, i, a) { return i > 0 && i < a.length - 1; });
                    tableHtml += '<tr>';
                    for (var c = 0; c < cells.length; c++) {
                        tableHtml += '<td>' + (cells[c] ? cells[c].trim() : "") + '</td>';
                    }
                    tableHtml += '</tr>';
                }
                tableHtml += '</tbody></table>';
                return tableHtml;
            });
        }

        // === 缩进嵌套列表解析（先于行内格式处理，避免 * 列表标记与斜体正则冲突）===
        html = (function parseNestedLists(src) {
            var lines = src.split(/\r?\n/);
            var out = [];
            var i = 0;
            var listRe = /^\s*[-*+]\s+/;
            while (i < lines.length) {
                if (listRe.test(lines[i])) {
                    // 收集连续列表块
                    var block = [];
                    while (i < lines.length && listRe.test(lines[i])) { block.push(lines[i++]); }
                    // 预扫描所有缩进层级，排序去重
                    var levels = [];
                    for (var bj = 0; bj < block.length; bj++) {
                        var mm = block[bj].match(/^(\s*)/);
                        var iLen = mm ? mm[1].length : 0;
                        if (levels.indexOf(iLen) === -1) levels.push(iLen);
                    }
                    levels.sort(function(a, b) { return a - b; });
                    // 生成嵌套 ul/li
                    var res = '';
                    var depth = -1;
                    for (var bj = 0; bj < block.length; bj++) {
                        var bl = block[bj];
                        var indM = bl.match(/^(\s*)/);
                        var iL = indM ? indM[1].length : 0;
                        var d = levels.indexOf(iL);
                        var isUnchecked = /^\s*[-*+]\s+\[ \]\s+/.test(bl);
                        var isChecked   = /^\s*[-*+]\s+\[x\]\s+/i.test(bl);
                        var contM = bl.match(/^\s*[-*+]\s+(?:\[[ x]\]\s+)?(.*)/i);
                        var cont = contM ? contM[1] : '';
                        var liHtml;
                        if (isUnchecked) {
                            liHtml = '<li style="margin:0 0 2px 0; padding:0; list-style-type:none;"><input type="checkbox" disabled style="margin-right:6px;">' + cont;
                        } else if (isChecked) {
                            liHtml = '<li style="margin:0 0 2px 0; padding:0; list-style-type:none;"><input type="checkbox" checked disabled style="margin-right:6px;">' + cont;
                        } else {
                            liHtml = '<li style="margin:0 0 2px 0; padding:0;">' + cont;
                        }
                        while (depth > d) { res += '</li></ul>'; depth--; }
                        if (d > depth) {
                            var pl = d > 0 ? '16px' : '20px';
                            res += '<ul style="padding-left:' + pl + '; margin:2px 0;">' + liHtml;
                            depth = d;
                        } else {
                            res += '</li>' + liHtml;
                        }
                    }
                    while (depth >= 0) { res += '</li></ul>'; depth--; }
                    out.push(res);
                } else {
                    out.push(lines[i++]);
                }
            }
            return out.join('\n');
        })(html);

        // 基础行内格式（列表已转换完毕，* 不再产生歧义）
        html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');  // Bug3 fix: 移除错误的 \(
        html = html.replace(/\*((?:[^*\n])+?)\*/g, '<em>$1</em>');     // Bug3 fix: 不跨行匹配
        html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
        html = html.replace(/_(.*?)_/g, '<em>$1</em>');
        html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
        html = html.replace(/==(.*?)==/g, '<mark>$1</mark>');

        // 分割线
        html = html.replace(/^[-]{3,}\s*$/gm, '<hr style="border: 0; border-top: 1px solid #dfe2e5; margin: 10px 0;">');

        // 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #0366d6; text-decoration: none;">$1</a>');

        // 标题
        html = html.replace(/^### (.*$)/gm, '<h3 style="margin: 8px 0 4px 0; font-size: 1.1em;">$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2 style="margin: 10px 0 5px 0; font-size: 1.2em; border-bottom: 1px solid #eee;">$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1 style="margin: 12px 0 6px 0; font-size: 1.3em; border-bottom: 2px solid #eee;">$1</h1>');

        // 列表（已在上方 parseNestedLists 中以缩进嵌套方式处理）

        // 行内代码与引用
        html = html.replace(/`(.*?)`/g, '<code style="background-color: #f6f8fa; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
        
        // 引用块 (修复转义与 Windows CRLF)
        html = html.replace(/(?:^(?:>|&gt;)\s*.*(?:\r?\n)?)+/gm, function(match) {
            var content = match.replace(/^(?:>|&gt;)\s*/gm, '');
            // 去除最末尾的换行以防过度空行
            content = content.replace(/(?:\r?\n)$/, '');
            return '<blockquote style="border-left: 4px solid #dfe2e5; color: #6a737d; padding-left: 10px; margin: 5px 0;">' + content + '</blockquote>\n';
        });

        // 换行处理
        if (html.indexOf('<table') === -1) {
            html = html.replace(/\r?\n/g, '<br>');
        } else {
            // 在带有表格时保留对块级标签的换行剔除
            html = html.replace(/([^>])\r?\n/g, '$1<br>');
        }

        // 清除列表标签之间多余的 <br>（换行转换结果）
        html = html.replace(/<\/li><br>/g, '</li>');
        html = html.replace(/<br><li/g, '<li');
        html = html.replace(/(<ul[^>]*>)<br>/g, '$1');
        html = html.replace(/<br>(<\/ul>)/g, '$1');

        // ── 行内普通文本箭头支持 ──
        html = html.replace(/\\uparrow/g, '↑');
        html = html.replace(/\\downarrow/g, '↓');
        html = html.replace(/\buparrow\b/g, '↑');
        html = html.replace(/\bdownarrow\b/g, '↓');

        // ── 还原数学公式占位符为 HTML span（供 miniMath 渲染） ──
        html = html.replace(/\x02MATH(\d+)\x03/g, function (_, idx) {
            var orig = mathPlaceholders[parseInt(idx)];
            if (orig.slice(0, 2) === '$$') {
                // 块级公式，去掉首尾 $$
                var inner = orig.slice(2, orig.length - 2);
                return '<span class="math-block" data-math="' + inner.replace(/"/g, '&quot;') + '">' + inner + '</span>';
            } else {
                // 行内公式，去掉首尾 $
                var inner = orig.slice(1, orig.length - 1);
                return '<span class="math-inline" data-math="' + inner.replace(/"/g, '&quot;') + '">' + inner + '</span>';
            }
        });

        // Keep paragraph boundaries without spending a full blank line on
        // each one. The spacer height is controlled by table/print CSS.
        html = html.replace(/(?:<br>\s*){2,}/g, '<br><span class="compact-paragraph-gap"></span>');

        return html;

    }

    function readMediaHash(value) {
        if (!value) return "";
        if (typeof value === "string") return value;

        // JSB may bridge NSString/NSDictionary values as objects rather than
        // JavaScript primitives.  The native API stores the image reference
        // in excerptPic.paint (and PaintNote.paint), so String() is needed
        // before passing it to Database.getMediaByHash().
        var keys = ["paint", "imageHash", "mediaHash", "hash"];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var field = null;
            try { field = value[key]; } catch (e) { }
            if (field !== null && field !== undefined) {
                try {
                    var text = String(field);
                    if (text && text !== "[object Object]") return text;
                } catch (e2) { }
            }
            // NSDictionary instances in some MarginNote builds expose only
            // objectForKey:, not bracket/property access.
            try {
                if (value.objectForKey) {
                    field = value.objectForKey(key);
                    if (field !== null && field !== undefined) {
                        var text2 = String(field);
                        if (text2 && text2 !== "[object Object]") return text2;
                    }
                }
            } catch (e3) { }
        }

        // A hash taken from mediaList is commonly bridged as NSString rather
        // than a JavaScript string. It has no `paint` key, but String(value)
        // still returns the actual media hash.
        try {
            var scalarText = String(value);
            if (scalarText && scalarText !== "[object Object]" && scalarText !== "undefined" && scalarText !== "null") {
                return scalarText;
            }
        } catch (e4) { }
        return "";
    }

    function isTextFirst(n) {
        if (!n) return false;
        try { return n.textFirst === true || Number(n.textFirst) === 1; } catch (e) { return n.textFirst === true; }
    }

    function isImageData(data) {
        if (!data) return false;
        try {
            if (typeof UIImage !== "undefined" && UIImage.imageWithData && UIImage.imageWithData(data)) return true;
        } catch (e) { }
        // Do not make media rendering depend solely on UIImage being injected
        // into the JS bridge. Raw image signatures are stable in base64 form.
        try {
            if (data.base64Encoding) {
                var prefix = String(data.base64Encoding()).substring(0, 16);
                return prefix.indexOf("iVBOR") === 0 || prefix.indexOf("/9j/") === 0 ||
                    prefix.indexOf("R0lGOD") === 0 || prefix.indexOf("UklGR") === 0 ||
                    prefix.indexOf("SUkq") === 0 || prefix.indexOf("TU0A") === 0;
            }
        } catch (e2) { }
        return false;
    }

    // MarginNote stores some handwritten/paint media as an archived NSData
    // object whose root object is the actual PNG/JPEG NSData.  The public
    // media API may return either the unarchived bytes or the archive,
    // depending on the app build, so accept both forms.
    function unwrapImageData(data) {
        if (!data) return null;
        if (isImageData(data)) return data;
        try {
            if (typeof NSKeyedUnarchiver !== "undefined" && NSKeyedUnarchiver.unarchiveObjectWithData) {
                var unpacked = NSKeyedUnarchiver.unarchiveObjectWithData(data);
                if (isImageData(unpacked)) return unpacked;
            }
        } catch (e) { }
        return null;
    }

    function getNativeArrayItems(value, maxItems) {
        var result = [];
        if (!value) return result;
        var limit = maxItems || 20;
        var count = 0;
        try { count = Number(value.length); } catch (e) { }
        if (!count) {
            try { count = Number(typeof value.count === "function" ? value.count() : value.count); } catch (e2) { }
        }
        count = Math.min(count || 0, limit);
        for (var i = 0; i < count; i++) {
            var item = null;
            try { item = value[i]; } catch (e3) { }
            if (item === null || item === undefined) {
                try { item = value.objectAtIndex(i); } catch (e4) { }
            }
            if (item !== null && item !== undefined) result.push(item);
        }
        return result;
    }

    var renderedMediaCache = {};

    // Drawing-only cards store a proprietary `wrd` stroke stream in ZMEDIA.
    // MarginNote itself rasterizes that stream into PNG files under its media
    // cache, using the same media hash as the filename prefix. Reuse those
    // read-only rendered files when the public media value is not an image.
    function getRenderedMediaCacheData(hash) {
        if (!hash) return null;
        var key = String(hash);
        var cached = renderedMediaCache[key];
        if (cached) {
            if (cached.data) return cached.data;
            // A visible drawing may be rasterized shortly after the first
            // lookup. Avoid repeated directory scans in one render pass, but
            // allow later refreshes to discover the newly generated PNG.
            if (Date.now() - cached.checkedAt < 2000) return null;
        }
        renderedMediaCache[key] = { data: null, checkedAt: Date.now() };
        try {
            var app = Application.sharedInstance();
            var cacheDir = app.cachePath + "/MediaCacheFiles";
            var fileManager = NSFileManager.defaultManager();

            // Prefer a medium-resolution cache suitable for an embedded table.
            var suffixes = ["1700", "2000", "2048", "1024", "512", "4096", "8192"];
            for (var si = 0; si < suffixes.length; si++) {
                var directPath = cacheDir + "/" + key + "_" + suffixes[si] + "_0_1";
                if (fileManager.fileExistsAtPath(directPath)) {
                    var directData = NSData.dataWithContentsOfFile(directPath);
                    if (isImageData(directData)) {
                        renderedMediaCache[key] = { data: directData, checkedAt: Date.now() };
                        return directData;
                    }
                }
            }

            // MarginNote may use a zoom-dependent suffix not listed above.
            // Scan filenames only as a fallback and keep the result cached.
            var names = fileManager.contentsOfDirectoryAtPath(cacheDir);
            var nameItems = getNativeArrayItems(names, 200000);
            var prefix = key + "_";
            for (var ni = 0; ni < nameItems.length; ni++) {
                var name = String(nameItems[ni]);
                if (name.indexOf(prefix) !== 0 || name.indexOf("_0_1") === -1) continue;
                var candidateData = NSData.dataWithContentsOfFile(cacheDir + "/" + name);
                if (isImageData(candidateData)) {
                    renderedMediaCache[key] = { data: candidateData, checkedAt: Date.now() };
                    return candidateData;
                }
            }
        } catch (e) { }
        return null;
    }

    function getImageMediaData(hash) {
        if (!hash) return null;
        try {
            var directData = unwrapImageData(Database.sharedInstance().getMediaByHash(String(hash)));
            if (directData) return directData;
        } catch (e) { }
        return getRenderedMediaCacheData(hash);
    }

    function getMediaListIds(value) {
        if (!value) return [];
        if (typeof value === "string") return value.split("-");

        // mediaList itself is usually an NSString in JSB. Coerce it before
        // handling NSArray variants so each hash becomes a plain JS string.
        try {
            var scalarText = String(value);
            if (scalarText && scalarText !== "[object Object]" && scalarText.indexOf("-") !== -1) {
                return scalarText.split("-");
            }
        } catch (e0) { }
        try {
            if (value.componentsSeparatedByString) {
                var nativeParts = value.componentsSeparatedByString("-");
                var parts = [];
                var nativeCount = 0;
                try { nativeCount = Number(nativeParts.length); } catch (e1) { }
                if (!nativeCount) {
                    try { nativeCount = Number(typeof nativeParts.count === "function" ? nativeParts.count() : nativeParts.count); } catch (e2) { }
                }
                for (var ni = 0; ni < nativeCount; ni++) {
                    var nativePart = null;
                    try { nativePart = nativeParts[ni]; } catch (e3) { }
                    if (nativePart === null || nativePart === undefined) {
                        try { nativePart = nativeParts.objectAtIndex(ni); } catch (e4) { }
                    }
                    if (nativePart !== null && nativePart !== undefined) parts.push(String(nativePart));
                }
                if (parts.length) return parts;
            }
        } catch (e) { }
        try {
            if (value.length && typeof value !== "function") {
                var list = [];
                for (var i = 0; i < value.length; i++) list.push(value[i]);
                if (list.length) return list;
            }
        } catch (e2) { }
        try {
            var text = String(value);
            if (text && text !== "[object Object]") return text.split("-");
        } catch (e3) { }
        return [];
    }

    function getNodePicHash(n) {
        if (!n) return "";
        var p = readMediaHash(n.excerptPic) || readMediaHash(n.pic) || readMediaHash(n.excerpt);
        if (p) return p;
        if (n.__sketchSource) {
            p = getNodePicHash(n.__sketchSource);
            if (p) return p;
        }

        // MNNote exposes the normalized excerpt image hash for note variants
        // whose native MbBookNote fields do not expose excerptPic.paint.
        try {
            var mn = getMNNoteWrapper(n);
            if (mn) {
                if (mn.excerptPic) {
                    var wrappedPicHash = readMediaHash(mn.excerptPic);
                    if (wrappedPicHash) return wrappedPicHash;
                }
                var info = mn.getExcerptInfo ? mn.getExcerptInfo() : mn.excerpt;
                if (info) return readMediaHash(info);
                if (mn.imageId) return readMediaHash(mn.imageId);
                if (MNNote.getImageIdFromNote) return readMediaHash(MNNote.getImageIdFromNote(mn, false));
            }
        } catch (e) { }

        // Last read-only fallback for cards whose excerpt/comment object is
        // hidden by the bridge but whose mediaList still contains the image.
        try {
            var mediaIds = getMediaListIds(n.mediaList);
            for (var mi = 0; mi < mediaIds.length; mi++) {
                var mediaId = readMediaHash(mediaIds[mi]);
                if (!mediaId || mediaId.length < 8) continue;
                try {
                    if (Database.sharedInstance().getMediaByHash(mediaId)) return mediaId;
                } catch (e2) { }
            }
        } catch (e3) { }
        return "";
    }

    function getMNNoteWrapper(n) {
        if (!n || typeof MNNote === "undefined") return null;
        var source = n.__baseNote || n.__nativeNote || n.__sketchSource || n;
        try {
            if (MNNote.noteFromNote) return MNNote.noteFromNote(source);
            if (MNNote.new) return MNNote.new(source, false);
            return new MNNote(source);
        } catch (e) {
            try { return new MNNote(source); } catch (e2) { return null; }
        }
    }

    function getNodeMediaData(n, hash) {
        var media = null;
        if (hash) media = getImageMediaData(hash);
        if (media) return media;

        try {
            if (n && n.excerptPicData && typeof n.excerptPicData !== "function") {
                media = unwrapImageData(n.excerptPicData);
                if (media) return media;
            }
        } catch (e0) { }

        // Fallback for Sketch/handwritten notes: MNNote can expose the image
        // data even when the raw MbBookNote has no usable hash field.
        try {
            var mn = getMNNoteWrapper(n);
            if (mn && mn.excerptPicData) {
                media = unwrapImageData(mn.excerptPicData);
                if (media) return media;
            }
            if (mn && mn.imageData) {
                media = unwrapImageData(mn.imageData);
                if (media) return media;
            }
            if (mn && mn.imageDatas && mn.imageDatas.length > 0) {
                media = unwrapImageData(mn.imageDatas[0]);
                if (media) return media;
            }
            if (mn && MNNote.getImageFromNote) {
                media = unwrapImageData(MNNote.getImageFromNote(mn, false));
                if (media) return media;
            }
        } catch (e2) { }
        try {
            var base = n && (n.__baseNote || n.__nativeNote);
            var baseMn = getMNNoteWrapper(base);
            if (baseMn && baseMn.imageData) {
                media = unwrapImageData(baseMn.imageData);
                if (media) return media;
            }
            if (baseMn && baseMn.imageDatas && baseMn.imageDatas.length > 0) {
                media = unwrapImageData(baseMn.imageDatas[0]);
                if (media) return media;
            }
        } catch (e3) { }

        // DocumentController can rasterize a focused handwriting card even
        // when its stored media is an archived stroke/paint payload. Only use
        // it for the matching focused card, never for unrelated table cells.
        try {
            var app = Application.sharedInstance();
            var sc = app.studyController(self.window);
            var focused = sc && sc.notebookController ? getMindMapFocusNote(sc) : null;
            var targetIds = [];
            if (n && n.noteId) targetIds.push(String(n.noteId));
            if (n && n.__sketchSource && n.__sketchSource.noteId) targetIds.push(String(n.__sketchSource.noteId));
            if (focused && focused.noteId && targetIds.indexOf(String(focused.noteId)) !== -1) {
                var dc = sc && sc.readerController ? sc.readerController.currentDocumentController : null;
                if (dc && dc.imageFromFocusNote) {
                    media = unwrapImageData(dc.imageFromFocusNote());
                    if (media) return media;
                }
            }
        } catch (e4) { }
        return null;
    }

    function getCommentPaint(cm) {
        if (!cm) return "";
        var p = "";
        var type = cm.type ? String(cm.type).toLowerCase() : "";
        if (type === "paintnote" || type === "paint") {
            p = readMediaHash(cm.paint) || readMediaHash(cm.excerptPic) || readMediaHash(cm.pic) || "";
        } else if (type === "linknote") {
            p = readMediaHash(cm.q_hpic) || readMediaHash(cm.paint) || getNodePicHash(cm.q_hpic) || getNodePicHash(cm) || "";
        }
        // A handwritten card converted from a mind-map/link may be bridged
        // with a specialized comment type (for example mergedImageComment),
        // while the actual image is still stored in q_hpic.paint.  Do not
        // depend on the type name; the documented payload fields are stable.
        if (!p) p = readMediaHash(cm.q_hpic) || readMediaHash(cm.paint) || readMediaHash(cm.excerptPic) || readMediaHash(cm.pic) || "";
        return p;
    }

    function getNoteFromMindMapSelection(selection) {
        if (!selection) return null;
        var candidate = selection;
        var seen = [];
        for (var level = 0; level < 6 && candidate; level++) {
            var repeated = false;
            for (var si = 0; si < seen.length; si++) {
                if (seen[si] === candidate) { repeated = true; break; }
            }
            if (repeated) break;
            seen.push(candidate);

            // Official API shape is selected view -> MindMapNode -> MbBookNote.
            // Both wrapper layers can expose their own noteId, so `.note` must
            // be followed before resolving an ID.  Stopping at the wrapper ID
            // makes converted handwritten cards look like empty notes.
            var next = null;
            try { next = candidate.note; } catch (e) { }
            if (next && typeof next !== "function" && next !== candidate) {
                candidate = next;
                continue;
            }

            // Only the deepest object in the documented `.note` chain should
            // be treated as the actual MbBookNote.
            if (candidate.noteId) {
                try {
                    var dbNote = Database.sharedInstance().getNoteById(String(candidate.noteId));
                    if (dbNote) return dbNote;
                } catch (e2) { }
                return candidate;
            }

            // Compatibility fallback for older MarginNote wrapper variants.
            try { next = candidate.focusNote || candidate.bookNote || candidate.node; } catch (e3) { }
            if (!next || typeof next === "function" || next === candidate) break;
            candidate = next;
        }
        return null;
    }

    function getMindMapFocusNote(studyController) {
        var controller = studyController && studyController.notebookController;
        if (!controller) return null;
        var focusNote = getNoteFromMindMapSelection(controller.focusNote);
        var visibleNote = getNoteFromMindMapSelection(controller.visibleFocusNote);
        // A focus transition can briefly leave focusNote on the empty map
        // root while visibleFocusNote already points at the selected card.
        if (visibleNote && (!focusNote || !noteHasRenderablePayload(focusNote))) return visibleNote;
        return focusNote || visibleNote;
    }

    function getAggregatedNoteText(n) {
        if (!n) return "";
        try {
            if (n.excerptText && String(n.excerptText).trim()) return String(n.excerptText);
        } catch (e) { }
        try {
            if (n.notesText && String(n.notesText).trim()) return String(n.notesText);
        } catch (e2) { }
        // allNoteText() is the documented API fallback for note variants whose
        // individual text fields are empty (including converted handwriting).
        try {
            if (n.allNoteText) {
                var allText = n.allNoteText();
                if (allText && String(allText).trim()) return String(allText);
            }
        } catch (e3) { }
        try {
            var mn = getMNNoteWrapper(n);
            if (mn && mn.allText && String(mn.allText).trim()) return String(mn.allText);
            if (mn && mn.allNoteText) {
                var wrappedText = mn.allNoteText();
                if (wrappedText && String(wrappedText).trim()) return String(wrappedText);
            }
        } catch (e4) { }
        return "";
    }

    function getMNContentHtml(n) {
        try {
            var mn = getMNNoteWrapper(n);
            var allTextPic = mn && mn.allTextPic;
            if (allTextPic && allTextPic.html && String(allTextPic.html).trim()) return String(allTextPic.html);
        } catch (e) { }
        return "";
    }

    function noteHasRenderablePayload(n) {
        if (!n) return false;
        if (n.noteTitle && String(n.noteTitle).trim()) return true;
        if (n.excerptText && String(n.excerptText).trim()) return true;
        if (getNodePicHash(n)) return true;
        if (n.comments && n.comments.length) {
            for (var i = 0; i < n.comments.length; i++) {
                var cm = n.comments[i];
                if (getCommentPaint(cm)) return true;
                if (cm && (cm.text || cm.q_htext)) return true;
            }
        }
        if (getMNContentHtml(n)) return true;
        return false;
    }

    function noteHasDrawingData(n) {
        if (!n) return false;
        try {
            if (n.getStrokesCount && Number(n.getStrokesCount()) > 0) return true;
            if (n.getDrawingSize && Number(n.getDrawingSize()) > 0) return true;
        } catch (e) { }
        return false;
    }

    var sketchNoteCache = {};

    function hasUserVisibleTitleMarker(n) {
        var sources = [n, n && n.__baseNote, n && n.__nativeNote, n && n.__sketchSource];
        for (var i = 0; i < sources.length; i++) {
            var source = sources[i];
            if (!source) continue;
            var metadataList = [];
            try { if (source.options) metadataList.push(source.options); } catch (e) { }
            // Keep the Core Data field name as a compatibility fallback for
            // older JSBridge builds; current MbBookNote exposes it as options.
            try { if (source.recognizeText) metadataList.push(source.recognizeText); } catch (e2) { }
            for (var mi = 0; mi < metadataList.length; mi++) {
                var metadata = metadataList[mi];
                try {
                    if (metadata.toggleTitleDate) return true;
                    if (metadata.objectForKey && metadata.objectForKey("toggleTitleDate")) return true;
                } catch (e3) { }
                try {
                    if (String(metadata).indexOf("toggleTitleDate") !== -1) return true;
                } catch (e4) { }
            }
        }
        return false;
    }

    function getExplicitNoteTitle(n) {
        if (!n || !n.noteTitle) return "";
        var title = String(n.noteTitle).replace(/summary\/\d*/ig, "").trim();
        if (!title) return "";

        // Image excerpts can contain an OCR-generated noteTitle which is not
        // shown as a title on the mind-map card. MarginNote records a
        // toggleTitleDate when the title is actually enabled/edited. Keep
        // ordinary structure-node titles, but never promote hidden OCR text
        // above an image excerpt.
        if (getNodePicHash(n) && !hasUserVisibleTitleMarker(n)) return "";
        return title;
    }

    function noteTextsAreEquivalent(left, right) {
        if (!left || !right) return false;
        function normalize(value) {
            return String(value)
                .replace(/summary\/\d*/ig, "")
                .replace(/\r\n?/g, "\n")
                .replace(/[\s\u00a0\u3000]+/g, "")
                .trim();
        }
        var normalizedLeft = normalize(left);
        return !!normalizedLeft && normalizedLeft === normalize(right);
    }

    function resolveSketchNote(n) {
        if (!n) return n;

        // Some handwritten cards expose their recognized/aggregated text as
        // notesText instead of excerptText. Normalize it for the existing
        // table renderer without changing the native card object.
        var aggregatedText = getAggregatedNoteText(n);
        // allNoteText() includes the title. A title-only card would otherwise
        // be rendered once as the title and again as a synthetic excerpt.
        if (!n.excerptText && aggregatedText && !noteTextsAreEquivalent(aggregatedText, n.noteTitle)) {
            n = {
                noteId: n.noteId,
                notebookId: n.notebookId,
                noteTitle: n.noteTitle || "",
                excerptText: aggregatedText,
                excerptTextMarkdown: n.excerptTextMarkdown,
                textFirst: n.textFirst,
                excerptPic: n.excerptPic,
                pic: n.pic,
                comments: n.comments || [],
                childNotes: n.childNotes || [],
                __syntheticExcerptText: true,
                __baseNote: n
            };
        }
        if (!n.noteId || noteHasRenderablePayload(n)) return n;

        var topicid = n.notebookId;
        if (!topicid) {
            try {
                var app = Application.sharedInstance();
                var sc = app.studyController(self.window);
                topicid = sc && sc.notebookController ? sc.notebookController.notebookId : null;
            } catch (e) { }
        }
        var db = null;
        try { db = Database.sharedInstance(); } catch (e2) { }
        if (!db || !db.getSketchNoteForMindMapFocusNoteId || !topicid) return n;

        var cacheKey = String(topicid) + "::" + String(n.noteId);
        if (sketchNoteCache[cacheKey]) return sketchNoteCache[cacheKey];

        var sketch = null;
        try {
            sketch = db.getSketchNoteForMindMapFocusNoteId(String(topicid), String(n.noteId));
        } catch (e3) { }
        // On some MarginNote builds the singular lookup returns undefined,
        // while the same Sketch is present in the documented list API.
        if (!sketch && db.getSketchNotesForMindMap) {
            try {
                var sketchList = db.getSketchNotesForMindMap(String(topicid));
                var wantedIds = [String(n.noteId)];
                if (n.originNoteId) wantedIds.push(String(n.originNoteId));
                if (n.groupNoteId) wantedIds.push(String(n.groupNoteId));
                for (var si = 0; si < (sketchList ? sketchList.length : 0) && !sketch; si++) {
                    var listedSketch = sketchList[si];
                    var candidateIds = ["noteId", "focusNoteId", "sourceNoteId", "originNoteId", "parentNoteId"];
                    for (var ci = 0; ci < candidateIds.length; ci++) {
                        var candidateId = null;
                        try { candidateId = listedSketch && listedSketch[candidateIds[ci]]; } catch (e4) { }
                        if (candidateId !== null && candidateId !== undefined && wantedIds.indexOf(String(candidateId)) !== -1) {
                            sketch = listedSketch;
                            break;
                        }
                    }
                }
            } catch (e5) { }
        }
        if (!sketch || sketch === n || (!noteHasRenderablePayload(sketch) && !noteHasDrawingData(sketch))) {
            sketchNoteCache[cacheKey] = n;
            return n;
        }

        // Keep the visible card's ID for table ↔ mindmap linking, while using
        // the Sketch note only as the content source.
        var resolved = {
            noteId: n.noteId,
            notebookId: n.notebookId || topicid,
            noteTitle: n.noteTitle || sketch.noteTitle || "",
            excerptText: n.excerptText || sketch.excerptText || "",
            excerptTextMarkdown: n.excerptTextMarkdown != null ? n.excerptTextMarkdown : sketch.excerptTextMarkdown,
            textFirst: n.textFirst != null ? n.textFirst : sketch.textFirst,
            excerptPic: n.excerptPic || sketch.excerptPic,
            pic: n.pic || sketch.pic,
            comments: (n.comments && n.comments.length) ? n.comments : (sketch.comments || []),
            childNotes: (n.childNotes && n.childNotes.length) ? n.childNotes : (sketch.childNotes || []),
            __sketchSource: sketch
        };
        sketchNoteCache[cacheKey] = resolved;
        return resolved;
    }

    // V2.8.5: Auto-detect image MIME type from base64 data
    function getImageMimeType(b64) {
        if (!b64) return 'image/jpeg';
        if (b64.indexOf('iVBOR') === 0) return 'image/png';
        if (b64.indexOf('R0lGOD') === 0) return 'image/gif';
        if (b64.indexOf('UklGR') === 0) return 'image/webp';
        return 'image/jpeg';
    }



    // V2.5.0: Optimal Width Algorithm to minimize table height
    // Guard malformed/deep childNotes trees so one cyclic reference cannot
    // take down the whole addon with a JavaScript stack overflow.
    var MAX_NOTE_TREE_DEPTH = 256;

    function isNoteInPath(note, path) {
        if (!note || !path) return false;
        var noteId = note.noteId;
        for (var i = 0; i < path.length; i++) {
            var ancestor = path[i];
            if (ancestor === note) return true;
            if (noteId && ancestor && ancestor.noteId && String(ancestor.noteId) === String(noteId)) return true;
        }
        return false;
    }

    function calculateOptimalWidths(rootNotes) {
        var weights = {};
        var maxDepth = 0;

        function traverse(n, depth, path) {
            if (!n || depth > MAX_NOTE_TREE_DEPTH || isNoteInPath(n, path)) return;
            n = resolveSketchNote(n);
            if (!n || isNoteInPath(n, path)) return;
            var nextPath = (path || []).slice();
            nextPath.push(n);
            if (depth > maxDepth) maxDepth = depth;
            var len = 0;
            if (n.noteTitle) len += n.noteTitle.length;
            if (n.excerptText) len += n.excerptText.length;
            if (n.comments) {
                n.comments.forEach(function (cm) {
                    if (cm.text) len += cm.text.length;
                    var t = (cm.type === "LinkNote" ? cm.q_htext : "");
                    if (t) len += t.length;
                    if (cm.type === "PaintNote" || (cm.type === "LinkNote" && cm.q_hpic)) len += 60;
                });
            }
            if (getNodePicHash(n)) len += 60;

            weights[depth] = (weights[depth] || 0) + len;
            if (n.childNotes) {
                n.childNotes.forEach(function (c) { traverse(c, depth + 1, nextPath); });
            }
        }

        rootNotes.forEach(function (n) { traverse(n, 1, []); });

        var sqrtSum = 0;
        var sqrtWeights = {};
        for (var i = 1; i <= maxDepth; i++) {
            var w = Math.sqrt((weights[i] || 0) + 20); // Add bias for small columns
            sqrtWeights[i] = w;
            sqrtSum += w;
        }

        var results = {};
        if (sqrtSum > 0) {
            for (var j = 1; j <= maxDepth; j++) {
                results[j] = (sqrtWeights[j] / sqrtSum) * 100;
            }
        }
        return { widths: results, maxDepth: maxDepth };
    }

    function getCommonHtmlPrefix(isCompact) {

        // 新的拦截点击方案：用纯 JS 在内部把点击的 nodeid 存到全局变量 clickedNoteId 里，然后由外部 OC 定时轮询
        // Injected script for interactive features (V10.3 ES5 Safe)
        var js = '\n<script>\n' +
            'window.isSyncWidth = ' + (self.isSyncWidth !== false ? 'true' : 'false') + ';\n' +
            'window.clickedNoteId = null;\n' +
            'var currentResizer = null;\n' +
            'var currentImgHandle = null;\n' +
            'window.ignoreLinkClickUntil = 0;\n' +
            '\n' +
            'function getX(e) {\n' +
            '    if (e.touches && e.touches.length > 0) return e.touches[0].pageX;\n' +
            '    return e.pageX || 0;\n' +
            '}\n' +
            '\n' +
            'function getY(e) {\n' +
            '    if (e.touches && e.touches.length > 0) return e.touches[0].pageY;\n' +
            '    return e.pageY || 0;\n' +
            '}\n' +
            '\n' +
            '// A. Jump logic (No closest)\n' +
            'document.addEventListener("click", function(e) {\n' +
            '    if(Date.now() < window.ignoreLinkClickUntil) {\n' +
            '        e.preventDefault();\n' +
            '        e.stopPropagation();\n' +
            '        return;\n' +
            '    }\n' +
            '    var el = e.target;\n' +
            '    while(el && el !== document) {\n' +
            '        if(el.classList && (el.classList.contains("img-resizer") || el.classList.contains("resizer"))) {\n' +
            '            e.preventDefault();\n' +
            '            e.stopPropagation();\n' +
            '            return;\n' +
            '        }\n' +
            '        if(el.tagName === "A" && el.getAttribute("data-nodeid")) {\n' +
            '            window.clickedNoteId = el.getAttribute("data-nodeid");\n' +
            '            e.preventDefault();\n' +
            '            return;\n' +
            '        }\n' +
            '        el = el.parentElement;\n' +
            '    }\n' +
            '});\n' +
            '\n' +
            '// B. Column Resizer\n' +
            'var res = document.querySelectorAll(".resizer");\n' +
            'for(var i=0; i<res.length; i++) {\n' +
            '    (function(r){\n' +
            '        var cell = r.parentElement;\n' +
            '        var mode, targetEle, startXP, startW;\n' +
            '        function start(e) {\n' +
            '            startXP = getX(e);\n' +
            '            var depth = cell.getAttribute("data-depth");\n' +
            '            var dragCol = cell.getAttribute("data-dragcol");\n' +
            '            if (depth !== null) {\n' +
            '                mode = "title";\n' +
            '                targetEle = cell;\n' +
            '                startW = parseFloat(window.getComputedStyle(targetEle).width);\n' +
            '            } else {\n' +
            '                mode = "other";\n' +
            '                targetEle = cell;\n' +
            '                startW = parseFloat(window.getComputedStyle(targetEle).width);\n' +
            '            }\n' +
            '            document.addEventListener("mousemove", move);\n' +
            '            document.addEventListener("touchmove", move, {passive:false});\n' +
            '            document.addEventListener("mouseup", end);\n' +
            '            document.addEventListener("touchend", end);\n' +
            '            if(e.cancelable) e.preventDefault();\n' +
            '        }\n' +
            '        function move(e) {\n' +
            '            var curX = getX(e);\n' +
            '            var deltaX = curX - startXP;\n' +
            '            if (mode === "title") {\n' +
            '                var depth = cell.getAttribute("data-depth");\n' +
            '                var nW = startW + deltaX; if (nW < 20) nW = 20;\n' +
            '                if(window.isSyncWidth) {\n' +
            '                    var syncCells = document.querySelectorAll("td[data-depth=\'" + depth + "\']");\n' +
            '                    for(var k=0; k<syncCells.length; k++) syncCells[k].style.width = nW + "px";\n' +
            '                } else {\n' +
            '                    cell.style.width = nW + "px";\n' +
            '                }\n' +
            '            } else {\n' +
            '                if (targetEle) {\n' +
            '                    var nW = startW + deltaX; if (nW < 5) nW = 5;\n' +
            '                    targetEle.style.width = nW + "px";\n' +
            '                }\n' +
            '            }\n' +
            '            if(e.cancelable) e.preventDefault();\n' +
            '        }\n' +
            '        function end() {\n' +
            '            document.removeEventListener("mousemove", move);\n' +
            '            document.removeEventListener("touchmove", move);\n' +
            '            document.removeEventListener("mouseup", end);\n' +
            '            document.removeEventListener("touchend", end);\n' +
            '        }\n' +
            '        r.addEventListener("mousedown", start);\n' +
            '        r.addEventListener("touchstart", start, {passive:false});\n' +
            '    })(res[i]);\n' +
            '}\n' +
            '\n' +
            '// C. Img Resizer\n' +
            'var hds = document.querySelectorAll(".img-resizer");\n' +
            'for(var j=0; j<hds.length; j++) {\n' +
            '    (function(h){\n' +
            '        var container = h.parentElement;\n' +
            '        var img = container.getElementsByTagName("img")[0];\n' +
            '        var sX, sY, sW, sH, ratio;\n' +
            '        function blockImageLink(e) {\n' +
            '            window.ignoreLinkClickUntil = Date.now() + 500;\n' +
            '            if(e && e.cancelable) e.preventDefault();\n' +
            '            if(e && e.stopPropagation) e.stopPropagation();\n' +
            '        }\n' +
            '        function s(e) {\n' +
            '            window.ignoreLinkClickUntil = Date.now() + 800;\n' +
            '            sX = getX(e); sY = getY(e);\n' +
            '            sW = img.offsetWidth; sH = img.offsetHeight;\n' +
            '            // V2.5.11: Multi-layer safety for ratio capture\n' +
            '            if (img.naturalWidth > 0 && img.naturalHeight > 0) {\n' +
            '                ratio = img.naturalHeight / img.naturalWidth;\n' +
            '            } else {\n' +
            '                ratio = sH / (sW || 1);\n' +
            '            }\n' +
            '            document.addEventListener("mousemove", m);\n' +
            '            document.addEventListener("touchmove", m, {passive:false});\n' +
            '            document.addEventListener("mouseup", q);\n' +
            '            document.addEventListener("touchend", q);\n' +
            '            if(e.cancelable) e.preventDefault();\n' +
            '            if(e.stopPropagation) e.stopPropagation();\n' +
            '        }\n' +
            '        function m(e) {\n' +
            '            window.ignoreLinkClickUntil = Date.now() + 800;\n' +
            '            var dX = getX(e) - sX;\n' +
            '            var nW = sW + dX;\n' +
            '            if (nW < 50) nW = 50;\n' +
            '            if (nW > 2000) nW = 2000;\n' +
            '            img.style.width = nW + "px";\n' +
            '            img.style.height = "auto";\n' +
            '            if(e.cancelable) e.preventDefault();\n' +
            '        }\n' +
            '        function q(e) {\n' +
            '            window.ignoreLinkClickUntil = Date.now() + 500;\n' +
            '            document.removeEventListener("mousemove", m); document.removeEventListener("touchmove", m);\n' +
            '            document.removeEventListener("mouseup", q); document.removeEventListener("touchend", q);\n' +
            '            if(e && e.stopPropagation) e.stopPropagation();\n' +
            '        }\n' +
            '        h.addEventListener("click", blockImageLink);\n' +
            '        h.addEventListener("mousedown", s); h.addEventListener("touchstart", s, {passive:false});\n' +
            '    })(hds[j]);\n' +
            '}\n' +
            '\n' +
            '// D. Section Fold/Unfold\n' +
            'function toggleSection(btn) {\n' +
            '    var header = btn.parentElement;\n' +
            '    var body = header.nextElementSibling;\n' +
            '    if (!body) return;\n' +
            '    if (body.style.display === "none") {\n' +
            '        body.style.display = "block";\n' +
            '        btn.textContent = "▼";\n' +
            '    } else {\n' +
            '        body.style.display = "none";\n' +
            '        btn.textContent = "▶";\n' +
            '    }\n' +
            '}\n' +
            '\n' +
            '// E. First-level Row Fold/Unfold (Merge Mode)\n' +
            'function foldRows(prefix, start, end, btn) {\n' +
            '    var firstRow = document.getElementById(prefix + start);\n' +
            '    if (!firstRow) return;\n' +
            '    var nextRow = document.getElementById(prefix + (start + 1));\n' +
            '    if (!nextRow) return;\n' +
            '    var isFolded = nextRow.style.display === "none";\n' +
            '    for (var i = start + 1; i <= end; i++) {\n' +
            '        var row = document.getElementById(prefix + i);\n' +
            '        if (row) row.style.display = isFolded ? "" : "none";\n' +
            '    }\n' +
            '    var cells = firstRow.querySelectorAll("td[data-origspan]");\n' +
            '    var firstCell = cells.length > 0 ? cells[0] : null;\n' +
            '    if(firstCell) {\n' +
            '       firstCell.setAttribute("rowspan", isFolded ? firstCell.getAttribute("data-origspan") : "1");\n' +
            '    }\n' +
            '    var siblings = Array.from(firstRow.children);\n' +
            '    for(var s = 1; s < siblings.length; s++) {\n' +
            '       siblings[s].style.display = isFolded ? "" : "none";\n' +
            '    }\n' +
            '    if (firstCell && !isFolded) {\n' +
            '       firstCell.setAttribute("data-origcolspan", firstCell.getAttribute("colspan") || "1");\n' +
            '       firstCell.setAttribute("colspan", "100");\n' +
            '    } else if (firstCell && isFolded) {\n' +
            '       var origCs = firstCell.getAttribute("data-origcolspan");\n' +
            '       if (origCs) firstCell.setAttribute("colspan", origCs);\n' +
            '       else firstCell.removeAttribute("colspan");\n' +
            '    }\n' +
            '    btn.textContent = isFolded ? "▼" : "▶";\n' +
            '}\n' +
            '// F. Title Mode Child Rows Fold/Unfold\n' +
            'function toggleChildRows(btn) {\n' +
            '    event.stopPropagation();\n' +
            '    var td = btn.parentElement;\n' +
            '    while(td && td.tagName !== "TD") td = td.parentElement;\n' +
            '    if(!td) return;\n' +
            '    var nextTd = td.nextElementSibling;\n' +
            '    if(nextTd) {\n' +
            '       var isFolded = nextTd.style.display === "none";\n' +
            '       nextTd.style.display = isFolded ? "" : "none";\n' +
            '       td.setAttribute("colspan", isFolded ? "1" : "2");\n' +
            '       btn.textContent = isFolded ? "▼" : "▶";\n' +
            '    } else {\n' +
            '       var childContainer = td.querySelector(".tc-child-container");\n' +
            '       if (childContainer) {\n' +
            '           var isFolded = childContainer.style.display === "none";\n' +
            '           childContainer.style.display = isFolded ? "" : "none";\n' +
            '           btn.textContent = isFolded ? "\u25bc" : "\u25b6";\n' +
            '       } else {\n' +
            '           var contents = td.querySelectorAll(".note-excerpt, .resize-img-container");\n' +
            '           if(contents.length === 0) return;\n' +
            '           var anyHidden = false;\n' +
            '           for(var ci=0; ci<contents.length; ci++) {\n' +
            '             if(contents[ci].style.display === "none") anyHidden = true;\n' +
            '           }\n' +
            '           for(var ci=0; ci<contents.length; ci++) {\n' +
            '             contents[ci].style.display = anyHidden ? "" : "none";\n' +
            '           }\n' +
            '           btn.textContent = anyHidden ? "\u25bc" : "\u25b6";\n' +
            '       }\n' +
            '    }\n' +
            '}\n' +
            '// G. Reverse Positioning Function (Improved)\n' +
            'window.scrollToNote = function(noteId) {\n' +
            '    if(!noteId) return false;\n' +
            '    noteId = String(noteId);\n' +
            '    var el = document.querySelector(\'[data-nodeid="\' + noteId + \'"]\');\n' +
            '    if(!el) {\n' +
            '        var allLinks = document.getElementsByTagName("a");\n' +
            '        for(var i=0; i<allLinks.length; i++) {\n' +
            '            if(allLinks[i].getAttribute("data-nodeid") === noteId) { el = allLinks[i]; break; }\n' +
            '        }\n' +
            '    }\n' +
            '    if(!el) return false;\n' +
            '    var target = el;\n' +
            '    while(target && target.tagName !== "TD" && !(target.classList && target.classList.contains("section-header"))) target = target.parentElement;\n' +
            '    if(!target) target = el;\n' +
            '    target.scrollIntoView({ behavior: "smooth", block: "center" });\n' +
            '    if(window.highlightedNoteCell) window.highlightedNoteCell.classList.remove("highlight-target");\n' +
            '    target.classList.remove("highlight-target");\n' +
            '    void target.offsetWidth; \n' +
            '    target.classList.add("highlight-target");\n' +
            '    window.highlightedNoteCell = target;\n' +
            '    return true;\n' +
            '};\n' +
            '// H. Get Layout Data for Persistence (Improved for Images)\n' +
            'window.getLayoutData = function() {\n' +
            '    var widths = {};\n' +
            '    var nodeWidths = {};\n' +
            '    var images = {};\n' +
            '    // Capture <td> widths\n' +
            '    var cells = document.querySelectorAll("td[data-depth]");\n' +
            '    for(var i=0; i<cells.length; i++) {\n' +
            '        var d = cells[i].getAttribute("data-depth");\n' +
            '        var nid = cells[i].getAttribute("data-nodeid");\n' +
            '        var w = window.getComputedStyle(cells[i]).width;\n' +
            '        if(!widths[d]) widths[d] = w;\n' +
            '        if(nid) nodeWidths[nid] = { w: w, depth: d };\n' +
            '    }\n' +
            '    // Capture <img> dimensions (using data-noteid from parent <a>)\n' +
            '    var imgContainers = document.querySelectorAll(".resize-img-container");\n' +
            '    for(var j=0; j<imgContainers.length; j++) {\n' +
            '        var img = imgContainers[j].querySelector("img");\n' +
            '        var sticky = imgContainers[j].closest(".sticky-content");\n' +
            '        var nidImg = sticky ? sticky.getAttribute("data-nodeid") : null;\n' +
            '        if(img && nidImg) {\n' +
            '            images[nidImg] = { w: img.style.width, h: img.style.height };\n' +
            '        }\n' +
            '    }\n' +
            '    return JSON.stringify({ widths: widths, nodeWidths: nodeWidths, images: images });\n' +
            '};\n' +
            '// ── Mini Math Renderer (inline, no CDN required) ──\n' +
            'function miniMath(src) {\n' +
            '    var s = src;\n' +
            '    var GL = {\n' +
            '        "\\\\alpha":"\u03b1","\\\\beta":"\u03b2","\\\\gamma":"\u03b3","\\\\delta":"\u03b4","\\\\epsilon":"\u03b5",\n' +
            '        "\\\\zeta":"\u03b6","\\\\eta":"\u03b7","\\\\theta":"\u03b8","\\\\iota":"\u03b9","\\\\kappa":"\u03ba",\n' +
            '        "\\\\lambda":"\u03bb","\\\\mu":"\u03bc","\\\\nu":"\u03bd","\\\\xi":"\u03be","\\\\pi":"\u03c0",\n' +
            '        "\\\\rho":"\u03c1","\\\\sigma":"\u03c3","\\\\tau":"\u03c4","\\\\phi":"\u03c6","\\\\chi":"\u03c7",\n' +
            '        "\\\\psi":"\u03c8","\\\\omega":"\u03c9","\\\\Gamma":"\u0393","\\\\Delta":"\u0394","\\\\Theta":"\u0398",\n' +
            '        "\\\\Lambda":"\u039b","\\\\Xi":"\u039e","\\\\Pi":"\u03a0","\\\\Sigma":"\u03a3","\\\\Phi":"\u03a6",\n' +
            '        "\\\\Psi":"\u03a8","\\\\Omega":"\u03a9","\\\\infty":"\u221e","\\\\pm":"\u00b1","\\\\times":"\u00d7",\n' +
            '        "\\\\div":"\u00f7","\\\\neq":"\u2260","\\\\leq":"\u2264","\\\\geq":"\u2265","\\\\approx":"\u2248",\n' +
            '        "\\\\cdot":"\u00b7","\\\\ldots":"\u2026","\\\\in":"\u2208","\\\\notin":"\u2209","\\\\subset":"\u2282",\n' +
            '        "\\\\cup":"\u222a","\\\\cap":"\u2229","\\\\partial":"\u2202","\\\\nabla":"\u2207",\n' +
            '        "\\\\int":"\u222b","\\\\sum":"\u03a3","\\\\prod":"\u03a0","\\\\sqrt":"\u221a",\n' +
            '        "\\\\to":"\u2192","\\\\leftarrow":"\u2190","\\\\Rightarrow":"\u21d2","\\\\Leftrightarrow":"\u21d4",\n' +
            '        "\\\\uparrow":"\u2191","\\\\downarrow":"\u2193","\\\\cos":"cos","\\\\sin":"sin","\\\\tan":"tan","\\\\exp":"exp",\n' +
            '        "\\\\sec":"sec","\\\\csc":"csc","\\\\cot":"cot",\n' +
            '        "\\\\ln":"ln","\\\\log":"log","\\\\lim":"lim","\\\\limits":"",\n' +
            '        "\\\\arctan":"arctan","\\\\arcsin":"arcsin","\\\\arccos":"arccos",\n' +
            '        "\\\\max":"max","\\\\min":"min","\\\\varphi":"\u03c6"\n' +
            '    };\n' +
            '    // Greek & symbols\n' +
            '    for (var k in GL) { s = s.split(k).join(GL[k]); }\n' +
            '    // \\begin{cases}...\\end{cases}\n' +
            '    s = s.replace(/\\\\begin\\{cases\\}([\\s\\S]*?)\\\\end\\{cases\\}/g, function(m, body) {\n' +
            '        var rows = body.split(/\\\\\\\\/); var lines = [];\n' +
            '        for (var ri=0; ri<rows.length; ri++) {\n' +
            '            var row = rows[ri].replace(/\\\\hline/g,"").trim();\n' +
            '            if (row) lines.push(row);\n' +
            '        }\n' +
            '        return "<span style=\\"font-size:1.5em;vertical-align:middle;line-height:1;margin-right:3px;\\">\u007b</span>" +\n' +
            '               "<span style=\\"display:inline-block;vertical-align:middle;line-height:1.7;\\">" + lines.join("<br>") + "</span>";\n' +
            '    });\n' +
            '    // matrices (bmatrix, pmatrix, vmatrix, Bmatrix, matrix)\n' +
            '    s = s.replace(/\\\\begin\\{([a-zA-Z]matrix)\\}([\\s\\S]*?)\\\\end\\{\\1\\}/g, function(m, type, content) {\n' +
            '        var rowArray = content.split(/\\\\\\\\/);\n' +
            '        var trs = "";\n' +
            '        for(var r=0; r<rowArray.length; r++) {\n' +
            '            var row = rowArray[r];\n' +
            '            if (!row.trim() && r === rowArray.length-1) continue;\n' +
            '            trs += "<tr>";\n' +
            '            var cols = row.split("&");\n' +
            '            for(var c=0; c<cols.length; c++) {\n' +
            '                trs += "<td style=\\"padding:0 5px !important; border:none !important; background:transparent !important; min-width:auto !important; word-break:normal !important;\\">" + cols[c] + "</td>";\n' +
            '            }\n' +
            '            trs += "</tr>";\n' +
            '        }\n' +
            '        var tbl = "<table style=\\"display:inline-table !important; width:auto !important; vertical-align:middle !important; text-align:center !important; border:none !important; background:transparent !important; margin:0 2px !important; box-shadow:none !important;\\">" + trs + "</table>";\n' +
            '        if (type === "bmatrix") return "<span style=\\"font-size:1.5em; vertical-align:middle;\\">[</span>" + tbl + "<span style=\\"font-size:1.5em; vertical-align:middle;\\">]</span>";\n' +
            '        if (type === "pmatrix") return "<span style=\\"font-size:1.5em; vertical-align:middle;\\">(</span>" + tbl + "<span style=\\"font-size:1.5em; vertical-align:middle;\\">)</span>";\n' +
            '        if (type === "vmatrix") return "<span style=\\"font-size:1.5em; vertical-align:middle;\\">|</span>" + tbl + "<span style=\\"font-size:1.5em; vertical-align:middle;\\">|</span>";\n' +
            '        if (type === "Bmatrix") return "<span style=\\"font-size:1.5em; vertical-align:middle;\\">{</span>" + tbl + "<span style=\\"font-size:1.5em; vertical-align:middle;\\">}</span>";\n' +
            '        return tbl;\n' +
            '    });\n' +
            '    // boldsymbol, quad\n' +
            '    s = s.replace(/\\\\boldsymbol\\{([^}]*)\\}/g, \'<b style="font-style:italic;">$1</b>\');\n' +
            '    s = s.replace(/\\\\mathbf\\{([^}]*)\\}/g, \'<b>$1</b>\');\n' +
            '    s = s.replace(/\\\\quad/g, \'&emsp;\');\n' +
            '    s = s.replace(/\\\\qquad/g, \'&emsp;&emsp;\');\n' +
            '    // \\left and \\right brackets\n' +
            '    s = s.replace(/\\\\left/g, \'\');\n' +
            '    s = s.replace(/\\\\right/g, \'\');\n' +
            '    // \\text{...} and \\mathrm{...} normal text\n' +
            '    s = s.replace(/\\\\text\\{([^}]*)\\}/g, \'<span style="font-style:normal;">$1</span>\');\n' +
            '    s = s.replace(/\\\\mathrm\\{([^}]*)\\}/g, \'<span style="font-style:normal;">$1</span>\');\n' +
            '    s = s.replace(/\\\\mathit\\{([^}]*)\\}/g, \'<em>$1</em>\');\n' +
            '    // \\tag{...} equation tag\n' +
            '    s = s.replace(/\\\\tag\\{([^}]*)\\}/g, \'<span style="float:right">($1)</span>\');\n' +
            '    // ^{...} superscript and _{...} subscript (BEFORE \\frac so nested braces like x_{n+1} work)\n' +
            '    s = s.replace(/\\^\\{([^{}]*)\\}/g, \'<sup>$1</sup>\');\n' +
            '    s = s.replace(/\\^([0-9a-zA-Z])/g, \'<sup>$1</sup>\');\n' +
            '    s = s.replace(/\\_\\{([^{}]*)\\}/g, \'<sub>$1</sub>\');\n' +
            '    s = s.replace(/\\_([0-9a-zA-Z])/g, \'<sub>$1</sub>\');\n' +
            '    // \\frac{a}{b}: interleave with sup/sub so \\frac inside ^{} resolves correctly\n' +
            '    for (var fi=0; fi<6; fi++) {\n' +
            '        var pf=s;\n' +
            '        s=s.replace(/\\\\frac\\{([^{}]*)\\}\\{([^{}]*)\\}/g,function(m,a,b){return \'(\'+a+\'/\'+b+\')\';}); \n' +
            '        s=s.replace(/\\^\\{([^{}]*)\\}/g,\'<sup>$1</sup>\'); \n' +
            '        s=s.replace(/\\_\\{([^{}]*)\\}/g,\'<sub>$1</sub>\');\n' +
            '        if(s===pf) break;\n' +
            '    }\n' +
            '    // \\sqrt{x} → √(x)\n' +
            '    s = s.replace(/\u221a\\{([^}]*)\\}/g, function(m,a){return \'\u221a(\'+ a +\')\';}); \n' +
            '    // \\, thin space\n' +
            '    s = s.replace(/\\\\,/g, \'\u202f\');\n' +
            '    // remove remaining backslashes\n' +
            '    s = s.replace(/\\\\/g, \'\');\n' +
            '    return s;\n' +
            '}\n' +
            'function renderMathInPage() {\n' +
            '    var spans = document.querySelectorAll(".math-inline,.math-block");\n' +
            '    for (var i=0; i<spans.length; i++) {\n' +
            '        var el = spans[i];\n' +
            '        var src = el.getAttribute("data-math");\n' +
            '        if (src) el.innerHTML = miniMath(src);\n' +
            '    }\n' +
            '}\n' +
            'document.addEventListener("DOMContentLoaded", renderMathInPage);\n' +
            '</script>';

        // 构建 HTML 文本
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
        html += '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';
        html += '<style>';
        html += '@keyframes highlightEffect { 0% { background-color: #fef08a; } 100% { background-color: white; } }';
        html += '.highlight-target { animation: highlightEffect 2s ease-out; }';
        html += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; padding: 10px; margin: 0; background-color: white; }';
        // V2.5.7: Revert to Auto Layout for Resize Support, Keep Min-Width 15px
        html += 'table { border-collapse: collapse; border-spacing: 0; width: 100%; border: 1px solid #94a3b8; table-layout: auto; margin-bottom: 20px; position: relative; border-radius: 0 !important; box-shadow: none !important; }';
        html += 'th, td { border: 1px solid #94a3b8; padding: 10px 12px; vertical-align: top; position: relative; background-color: white; word-wrap: normal; overflow-wrap: normal; word-break: normal !important; hyphens: none; -webkit-hyphens: none; overflow: visible; min-width: 20px; border-radius: 0 !important; box-shadow: none !important; }';

        // V10.6 Resizer Styles - touch-action:none prevents iOS scroll hijack
        html += '.resizer { position: absolute; right: -8px; top: 0; width: 16px; cursor: col-resize; user-select: none; -webkit-user-select: none; height: 100%; z-index: 100; background: transparent; touch-action: none; -webkit-touch-callout: none; }';
        html += '.resizer::after { content: ""; position: absolute; left: 7px; top: 0; width: 2px; height: 100%; background: transparent; }';
        html += '.resizer:hover::after, .resizer:active::after { background: #3b82f6; width: 3px; left: 6px; }';

        html += '.tc-child-container table { border-collapse: collapse !important; border-spacing: 0 !important; border: 1px solid #94a3b8 !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; table-layout: auto !important; }';
        html += '.tc-child-container td { border: 1px solid #94a3b8 !important; }';

        // V2.5.15: Infinite Width Reset
        html += '.merge-mode-table { table-layout: fixed !important; width: auto !important; min-width: 100%; border-collapse: collapse; }';
        html += '.merge-mode-table .note-title { font-size: 17px !important; line-height: 1.4 !important; margin-bottom: 6px; }';
        html += '.merge-mode-table .note-excerpt { font-size: 16px !important; line-height: 1.4 !important; }';
        html += '.merge-mode-table td { padding: 12px 15px !important; }';

        html += 'td a { text-decoration: none; display: block; height: 100%; color: inherit; -webkit-tap-highlight-color: transparent; }';
        html += '.sticky-content { position: sticky; top: 0; display: block; height: max-content; z-index: 10; text-decoration: none; color: inherit; background-color: white; padding: 2px; border-radius: 0 !important; box-shadow: none !important; }';
        html += 'td:hover { background-color: #f7fafc; }';
        html += 'td:hover .sticky-content { border-color: transparent; box-shadow: none !important; }';
        html += '.note-title { font-weight: 600; color: #1f2328; font-size: 16px; display: block; line-height: 1.4; margin-bottom: 8px; }';
        html += '.note-excerpt { font-size: 15px; color: #656d76; display: block; margin-top: 4px; line-height: 1.35; word-break: normal; overflow-wrap: normal; hyphens: none; -webkit-hyphens: none; }';
        html += '.note-excerpt[style*="border-top"] { margin-top: 4px !important; padding-top: 3px !important; }';
        html += '.compact-paragraph-gap { display: block; height: 0.25em; line-height: 0; }';
        // V2.4.3: 默认图片限高不限宽，让图片偵界层内且清晰不过大
        html += '.resize-img-container { position: relative; display: block; max-width: 100%; margin-top: 8px; overflow: visible; }';
        html += '.img-resizer { position: absolute; right: -8px; bottom: -8px; width: 32px; height: 32px; cursor: nwse-resize; background: rgba(0,122,255,0.15); border: 2px solid rgba(0,122,255,0.5); border-radius: 50%; z-index: 100; touch-action: none; -webkit-touch-callout: none; }';
        html += '.img-resizer::after { content: "\\2198"; font-size: 14px; color: #007aff; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }';
        // 第一次加载时限高400px; 拖拽调整后 img会有内联 style.width，那时移除限高让图片自由自适应
        html += 'img { display: block; width: auto; max-width: 100%; max-height: 400px; height: auto; object-fit: contain; border-radius: 0 !important; pointer-events: none; min-height: 30px !important; min-width: 50px !important; }';
        html += '.resize-img-container img[style*="width"] { max-height: none !important; height: auto !important; object-fit: contain !important; }';
        html += '.resize-img-container img { pointer-events: auto; }';
        html += '.compact-theme img { max-height: 300px !important; object-fit: contain !important; max-width: 100% !important; margin: 0; }';
        html += 'ul, ol { margin: 0; padding-left: 20px; }';
        html += 'blockquote { margin: 8px 0; padding-left: 12px; border-left: 4px solid #e2e8f0; color: #64748b; font-style: italic; }';
        html += 'code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 85%; background: rgba(175, 184, 193, 0.2); padding: 0.2em 0.4em; border-radius: 6px; }';
        html += '.md-table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 12px; table-layout: auto; border: 1px solid #e2e8f0; }';
        html += '.md-table th { background-color: #f8fafc; font-weight: 600; border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }';
        html += '.md-table td { border: 1px solid #e2e8f0; padding: 6px 8px; background-color: white; }';
        html += '.md-table tr:nth-child(even) td { background-color: #fcfcfc; }';

        // V9.0 Sectional Styles
        // V2.5.4: Flat Section Headers
        html += '.section-header { background: #f1f5f9; border-left: 5px solid #64748b; color: #1e293b; padding: 10px 14px; margin-top: 15px; margin-bottom: 0; font-size: 17px; font-weight: bold; border-radius: 0 !important; page-break-after: avoid; cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #cbd5e1; }';
        html += '.fold-btn { background: none; border: none; font-size: 14px; color: #5a7baa; cursor: pointer; padding: 0 4px; -webkit-user-select: none; }';
        html += '.row-fold-btn { float: left; margin-top: 2px; line-height: 1; background: none; border: none; font-size: 11px; color: #999; cursor: pointer; padding: 0; margin-right: 2px; -webkit-user-select: none; }';
        html += '.section-body { margin-bottom: 50px; }';
        html += 'tr { page-break-inside: avoid; break-inside: avoid; }';
        html += '.empty-section { padding: 20px; color: #666; border: 1px solid #eee; background: #fafafa; }';
        html += '.print-breadcrumb { display: none; }';
        html += 'body.hide-breadcrumb .print-breadcrumb { display: none !important; }';
        html += '.compact-theme { padding: 4px !important; -webkit-tap-highlight-color: transparent; }';
        html += '.compact-theme table { margin-bottom: 0 !important; margin-top: 0 !important; border-color: #94a3b8 !important; box-shadow: none !important; }';
        html += '.compact-theme th, .compact-theme td { padding: 2px 4px !important; border-color: #94a3b8 !important; }';
        html += '.compact-theme .tc-child-container { margin-top: 0 !important; }';
        html += '.compact-theme .note-title { margin-bottom: 2px !important; font-size: 16px !important; }';
        html += '.compact-theme .note-excerpt { margin-top: 2px !important; line-height: 1.3 !important; font-size: 15px !important; }';
        html += '.compact-theme .note-excerpt[style*="border-top"] { border-top: none !important; margin-top: 4px !important; padding-top: 0 !important; }';
        html += '.compact-theme .resize-img-container { margin-top: 2px !important; margin-bottom: 2px !important; }';
        html += '.compact-theme .section-header { padding: 4px 8px !important; margin-top: 8px !important; font-size: 16px !important; }';
        html += '.compact-theme .section-body { margin-bottom: 10px !important; }';
        html += '.compact-theme .md-table td, .compact-theme .md-table th { padding: 3px 4px !important; }';
        // Math inline/block styles
        html += '.math-inline { display: inline; font-style: italic; font-family: Georgia, serif; word-break: normal; overflow-wrap: normal; }';
        html += '.math-block { display: block; text-align: center; margin: 6px auto; font-style: italic; font-family: Georgia, serif; overflow-x: auto; }';
        html += '@media print { ';
        html += '  .fold-btn, .row-fold-btn, .resizer, .img-resizer { display: none !important; } ';
        html += '  .sticky-content { position: static !important; } ';
        html += '  body:not(.hide-breadcrumb) .print-breadcrumb { display: block !important; font-size: 10px; color: gray !important; margin-bottom: 5px; border-bottom: 1px dashed #eee; padding-bottom: 2px; } ';
        html += '  body, table, th, td, .note-title, .note-excerpt { color: #000 !important; } ';
        html += '  body { padding: 0 !important; } ';
        html += '  .note-excerpt { border-top: none !important; line-height: 1.25 !important; margin-top: 2px !important; padding-top: 0 !important; }';
        html += '  .compact-paragraph-gap { height: 0.12em !important; } ';
        html += '  .section-body { margin-bottom: 6px !important; } ';
        html += '  .section-body > a[data-nodeid] { padding: 5px 7px !important; margin-bottom: 0 !important; } ';
        html += '  table { table-layout: fixed !important; width: 100% !important; border: 1px solid #000 !important; margin-bottom: 6px !important; } ';
        html += '  th, td { border: 1px solid #000 !important; padding: 4px 6px !important; } ';
        html += '  td { page-break-inside: avoid; } ';
        html += '  .resize-img-container { margin-top: 3px !important; margin-bottom: 3px !important; } ';
        html += '  img { max-height: none !important; object-fit: contain !important; max-width: 100% !important; page-break-inside: avoid; margin: 0 !important; height: auto !important; }';
        html += '}';
        var bodyCls = '';
        if (isCompact) bodyCls += ' compact-theme';
        if (self && self.showBreadcrumb === false) bodyCls += ' hide-breadcrumb';
        html += '</style></head><body' + (bodyCls ? ' class="' + bodyCls.trim() + '"' : '') + '>';

        return { js: js, prefix: html };
    }

    // ==========================================
    // Visual excerpt renderer
    // Preserve the card as an image whenever MarginNote exposes image data.
    // Text/OCR is only a fallback when no image can be loaded.
    // extraImgStyle: optional inline style string for the <img> (e.g. saved width).
    // ==========================================
    // Comment text renderer: HtmlNote → raw HTML; TextNote/LinkNote → Markdown
    // ==========================================
    function renderCommentText(cm) {
        var type = cm ? cm.type : "";
        if (type === "HtmlNote") {
            // Raw HTML from Zotero, MN rich-text, etc. — render as-is (already safe from MN)
            return cm.text || "";
        }
        var t = (type === "TextNote") ? cm.text : (type === "LinkNote" ? cm.q_htext : "");
        if (!t) return "";
        // Detect HTML content by heuristic (Zotero cards may be TextNote with HTML body)
        var trimmed = t.trim();
        if (trimmed.charAt(0) === '<' || trimmed.indexOf('<div') !== -1 || trimmed.indexOf('<a ') !== -1 || trimmed.indexOf('<span') !== -1) {
            return t; // Raw HTML — render as-is
        }
        return renderMarkdown(formatLinks(escapeHtml(t)));
    }

    // Returns { html: string, rendered: bool }
    // ==========================================
    function renderExcerpt(n, cid, extraImgStyle) {
        // notesText/allNoteText is an aggregate of the comment list. When the
        // original card already exposes those comments, rendering the
        // aggregate here would move all text ahead of the first image and
        // then render the same comments again. Let the ordered comment loop
        // below reproduce the card exactly instead.
        if (n && n.__syntheticExcerptText && n.comments && n.comments.length) {
            return { html: '', rendered: false };
        }

        // Continuous OCR cards explicitly ask MarginNote to show their text
        // layer first. Ordinary excerpt cards keep their original image.
        if (isTextFirst(n) && n.excerptText && String(n.excerptText).trim()) {
            return {
                html: '<div class="note-excerpt" style="margin-top:0;">' + renderMarkdown(formatLinks(escapeHtml(n.excerptText))) + '</div>',
                rendered: true
            };
        }

        // A text card can still expose imageData from a linked/grouped note.
        // Without its own image hash, that image does not belong to the main
        // excerpt and must not replace the card's definition/body text.
        var currentPicHash = getNodePicHash(n);
        var hasReadableExcerptText = !!(n && n.excerptText && String(n.excerptText).trim());
        var allowHashlessImageFallback = !hasReadableExcerptText || noteHasDrawingData(n) || !!n.__sketchSource;
        var med = (currentPicHash || allowHashlessImageFallback) ? getNodeMediaData(n, currentPicHash) : null;
        if (med) {
            var b64 = med.base64Encoding();
            if (b64) {
                var imgStyle = extraImgStyle || '';
                return {
                    html: '<div class="resize-img-container"><img data-paint="' + currentPicHash + '" src="data:' + getImageMimeType(b64) + ';base64,' + b64 + '"' + imgStyle + '/><div class="img-resizer"></div></div>',
                    rendered: true
                };
            }
        }
        // LibMN can export a converted handwriting/merged card as trusted
        // HTML even when its native media hash is not exposed to JSB.
        var wrappedHtml = getMNContentHtml(n);
        if (wrappedHtml) {
            return {
                html: '<div class="note-excerpt" style="margin-top:0;">' + wrappedHtml + '</div>',
                rendered: true
            };
        }
        // Fallback: show excerptText if no image available
        if (n.excerptText) {
            return {
                html: '<div class="note-excerpt" style="margin-top:0;">' + renderMarkdown(formatLinks(escapeHtml(n.excerptText))) + '</div>',
                rendered: true
            };
        }
        return { html: '', rendered: false };
    }

    function buildTitleContentTable(rootNotes, isCompact) {

        var common = getCommonHtmlPrefix(isCompact);
        var html = common.prefix;
        var opt = calculateOptimalWidths(rootNotes);

        for (var idx = 0; idx < rootNotes.length; idx++) {
            var rootNote = resolveSketchNote(rootNotes[idx]);
            var rawTitle = getExplicitNoteTitle(rootNote);

            if (rawTitle) {
                html += '<div class="section-header">';
                // V3.2.2: Use <a> with data-nodeid to enable bi-link focusing
                html += '<a data-nodeid="' + rootNote.noteId + '" style="cursor:pointer; color:inherit; text-decoration:none; display:inline-block; flex:1;">' + renderMarkdown(formatLinks(escapeHtml(rawTitle))) + '</a>';
                html += '<button class="fold-btn" onclick="toggleSection(this)">▼</button>';
                html += '</div>';
            }

            html += '<div class="section-body">';

            // --- NEW: 根节点内容脱壳前置 ---
            var rootHasContent = false;
            if (rootNote.excerptText || getNodePicHash(rootNote) || getMNContentHtml(rootNote)) rootHasContent = true;
            if (rootNote.comments && rootNote.comments.length > 0) rootHasContent = true;

            if (rootHasContent) {
                // V3.2.2: Wrap content area in <a> for bi-link support
                var rootBorderTop = rawTitle ? 'none' : '1px solid #94a3b8';
                html += '<a data-nodeid="' + rootNote.noteId + '" style="display:block; text-decoration:none; color:inherit; padding: 10px 15px; margin-bottom: 2px; background: #fff; border: 1px solid #94a3b8; border-top: ' + rootBorderTop + '; border-radius: 0 !important;">';

                var savedImgStyleRoot = "";
                var epaintRoot = getNodePicHash(rootNote);
                if (epaintRoot && self.savedImgHash && self.savedImgHash[epaintRoot] && self.savedImgHash[epaintRoot].w) {
                    savedImgStyleRoot = ' style="width:' + self.savedImgHash[epaintRoot].w + '; height: auto !important;" ';
                }
                var excerptResult = renderExcerpt(rootNote, null, savedImgStyleRoot);
                html += excerptResult.html;

                if (rootNote.comments) {
                    rootNote.comments.forEach(function (cm) {
                        var isTextMode = false;
                        var targetNote = null;
                        if (cm.type === "LinkNote" && cm.noteid) {
                            targetNote = Database.sharedInstance().getNoteById(cm.noteid);
                            if (targetNote && isTextFirst(targetNote) && targetNote.excerptText) {
                                isTextMode = true;
                            }
                        }
                        var p = getCommentPaint(cm);
                        if (isTextMode) p = "";
                        if (p) {
                            var m = getImageMediaData(p);
                            if (m) {
                                var b = m.base64Encoding();
                                if (b) {
                                    var cImgStyle = "";
                                    if (self.savedImgHash && self.savedImgHash[p] && self.savedImgHash[p].w) {
                                        cImgStyle = ' style="width:' + self.savedImgHash[p].w + '; height: auto !important;" ';
                                    }
                                    html += '<div class="resize-img-container" style="margin-top:8px;"><img data-paint="' + p + '" src="data:' + getImageMimeType(b) + ';base64,' + b + '"' + cImgStyle + '/><div class="img-resizer"></div></div>';
                                }
                            }
                        } else {
                            var ct = renderCommentText(cm);
                            if (!ct && isTextMode && targetNote && targetNote.excerptText) ct = renderMarkdown(formatLinks(escapeHtml(targetNote.excerptText)));
                            if (ct) html += '<div class="note-excerpt" style="border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 8px; color:#444; font-size:15px;">' + ct + '</div>';
                        }
                    });
                }
                html += '</a>';
            }

            function renderNode(n, depth, path) {
                if (!n || depth > MAX_NOTE_TREE_DEPTH || isNoteInPath(n, path)) return '';
                n = resolveSketchNote(n);
                if (!n || isNoteInPath(n, path)) return '';
                var newPath = (path || []).slice();
                newPath.push(n);

                var displayTitle = getExplicitNoteTitle(n);
                var hasTitle = displayTitle ? true : false;
                var hasContent = false;
                if (n.excerptText) hasContent = true;
                if (getNodePicHash(n) || getMNContentHtml(n)) hasContent = true;
                if (n.comments && n.comments.length > 0) hasContent = true;
                var hasChild = (n.childNotes && n.childNotes.length > 0);

                // 1. 纯结构节点（无标题无内容，只有挂载下级作用）-> 透传
                if (!hasTitle && !hasContent && hasChild) {
                    var childHtmlStr = '';
                    n.childNotes.forEach(function (c) {
                        childHtmlStr += renderNode(c, depth, newPath); // 保持同一depth透传
                    });
                    return childHtmlStr;
                }

                // V2.5.0 calculate local relative percentage for nested tables
                var currentWidthWeight = opt.widths[depth] || 18;
                var remainingWeight = 0;
                for (var wi = depth; wi <= opt.maxDepth; wi++) remainingWeight += (opt.widths[wi] || 0);
                if (remainingWeight <= 0) remainingWeight = 100;
                var relativePct = Math.round((currentWidthWeight / remainingWeight) * 10000) / 100;

                // Persistence Layout: check if we have a saved width for this depth level or this specific cell
                var persistentWidthStyle = "";
                var cid = n.noteId || "root";
                if (self.isSyncWidth !== true && self.savedNodeWidthMap && self.savedNodeWidthMap[cid]) {
                    persistentWidthStyle = "width: " + self.savedNodeWidthMap[cid].w + " !important; ";
                }
                else if (self.savedWidthMap && self.savedWidthMap[depth]) {
                    persistentWidthStyle = "width: " + self.savedWidthMap[depth] + " !important; ";
                } else {
                    persistentWidthStyle = "width: " + relativePct + "%; ";
                }

                var mTop = "0";
                var htmlStr = '<table style="margin:0; width:100%; table-layout: auto !important; border:1px solid #94a3b8; border-collapse:collapse; margin-top:' + mTop + '; border-radius:0 !important; box-shadow:none !important;"><tbody><tr>';

                var bc = "";
                if (depth > 1 && path && path.length > 0) {
                    var bcPath = "";
                    for (var pi = 0; pi < path.length; pi++) {
                        var pn = path[pi];
                        var pt = getExplicitNoteTitle(pn) || "笔记";
                        bcPath += (bcPath ? " > " : "") + pt;
                    }
                    if (bcPath) bc = '<div class="print-breadcrumb" style="display:none;">' + escapeHtml(bcPath) + '</div>';
                }

                if (hasTitle && !hasContent && !hasChild) {
                    // 只有标题
                    htmlStr += '<td data-depth="' + depth + '" data-nodeid="' + cid + '" colspan="2" style="' + persistentWidthStyle + ' vertical-align:top; border:1px solid #94a3b8; background:#f0f7ff; padding:6px; border-radius:0 !important;">';
                    htmlStr += '<a class="sticky-content" style="cursor: pointer; background:#f0f7ff; padding:0; border-radius:0 !important;" data-nodeid="' + cid + '">';
                    if (bc) htmlStr += bc;
                    htmlStr += '<div class="note-title" style="font-size: 15px; margin-bottom: 4px;">' + renderMarkdown(formatLinks(escapeHtml(displayTitle))) + '</div>';
                    htmlStr += '</a></td>';
                } else if (!hasTitle && hasContent) {
                    if (hasChild) {
                        htmlStr += '<td data-depth="' + depth + '" data-nodeid="' + cid + '" style="' + persistentWidthStyle + ' vertical-align:top; border:1px solid #94a3b8; padding:6px; background:white;">';
                        htmlStr += '<a class="sticky-content" style="cursor: pointer; position:static;" data-nodeid="' + cid + '">';
                        if (bc) htmlStr += bc;
                        htmlStr += '<button class="row-fold-btn" onclick="toggleChildRows(this)">▼</button>';

                        var savedImgStyle = "";
                        var epaint = getNodePicHash(n);
                        if (epaint && self.savedImgHash && self.savedImgHash[epaint] && self.savedImgHash[epaint].w) {
                            savedImgStyle = ' style="width:' + self.savedImgHash[epaint].w + '; height: auto !important;" ';
                        }
                        var excerptResult = renderExcerpt(n, cid, savedImgStyle);
                        htmlStr += excerptResult.html;

                        if (n.comments) {
                            n.comments.forEach(function (cm) {
                                var isTextMode = false;
                                var targetNote = null;
                                if (cm.type === "LinkNote" && cm.noteid) {
                                    targetNote = Database.sharedInstance().getNoteById(cm.noteid);
                                    if (targetNote && isTextFirst(targetNote) && targetNote.excerptText) {
                                        isTextMode = true;
                                    }
                                }
                                var p = getCommentPaint(cm);
                                if (isTextMode) p = "";
                                if (p) {
                                    var m = getImageMediaData(p);
                                    if (m) {
                                        var b = m.base64Encoding();
                                        if (b) {
                                            var cImgStyle = "";
                                            if (self.savedImgHash && self.savedImgHash[p] && self.savedImgHash[p].w) {
                                                cImgStyle = ' style="width:' + self.savedImgHash[p].w + '; height: auto !important;" ';
                                            }
                                            htmlStr += '<div class="resize-img-container"><img data-paint="' + p + '" src="data:' + getImageMimeType(b) + ';base64,' + b + '"' + cImgStyle + '/><div class="img-resizer"></div></div>';
                                        }
                                    }
                                } else {
                                    var ct = renderCommentText(cm);
                                    if (!ct && isTextMode && targetNote && targetNote.excerptText) ct = renderMarkdown(formatLinks(escapeHtml(targetNote.excerptText)));
                                    if (ct) htmlStr += '<div class="note-excerpt" style="border-top: 1px dashed #e2e8f0; padding-top: 4px; margin-top: 8px;">' + ct + '</div>';
                                }
                            });
                        }
                        htmlStr += '</a><div class="resizer"></div></td>';
                        htmlStr += '<td style="vertical-align:top; border:1px solid #94a3b8; padding:0; background:white;">';
                        htmlStr += '<div class="tc-child-container">';
                        n.childNotes.forEach(function (c) {
                            htmlStr += renderNode(c, depth + 1, newPath);
                        });
                        htmlStr += '</div></td>';
                    } else {
                        // 只有内容，无下级 -> colspan 全宽
                        htmlStr += '<td colspan="2" style="vertical-align:top; border:1px solid #94a3b8; padding:6px; background:white;">';
                        htmlStr += '<a class="sticky-content" style="cursor: pointer; position:static;" data-nodeid="' + cid + '">';
                        if (bc) htmlStr += bc;
                        htmlStr += '<button class="row-fold-btn" onclick="toggleChildRows(this)">▼</button>';

                        var savedImgStyle2 = "";
                        var epaint2 = getNodePicHash(n);
                        if (epaint2 && self.savedImgHash && self.savedImgHash[epaint2] && self.savedImgHash[epaint2].w) {
                            savedImgStyle2 = ' style="width:' + self.savedImgHash[epaint2].w + '; height: auto !important;" ';
                        }
                        var excerptResult = renderExcerpt(n, cid, savedImgStyle2);
                        htmlStr += excerptResult.html;

                        if (n.comments) {
                            n.comments.forEach(function (cm) {
                                var isTextMode = false;
                                var targetNote = null;
                                if (cm.type === "LinkNote" && cm.noteid) {
                                    targetNote = Database.sharedInstance().getNoteById(cm.noteid);
                                    if (targetNote && isTextFirst(targetNote) && targetNote.excerptText) {
                                        isTextMode = true;
                                    }
                                }
                                var p = getCommentPaint(cm);
                                if (isTextMode) p = "";
                                if (p) {
                                    var m = getImageMediaData(p);
                                    if (m) {
                                        var b = m.base64Encoding();
                                        if (b) {
                                            var cImgStyle = "";
                                            if (self.savedImgHash && self.savedImgHash[p] && self.savedImgHash[p].w) {
                                                cImgStyle = ' style="width:' + self.savedImgHash[p].w + '; height: auto !important;" ';
                                            }
                                            htmlStr += '<div class="resize-img-container"><img data-paint="' + p + '" src="data:' + getImageMimeType(b) + ';base64,' + b + '"' + cImgStyle + '/><div class="img-resizer"></div></div>';
                                        }
                                    }
                                } else {
                                    var ct = renderCommentText(cm);
                                    if (!ct && isTextMode && targetNote && targetNote.excerptText) ct = renderMarkdown(formatLinks(escapeHtml(targetNote.excerptText)));
                                    if (ct) htmlStr += '<div class="note-excerpt" style="border-top: 1px dashed #e2e8f0; padding-top: 4px; margin-top: 8px;">' + ct + '</div>';
                                }
                            });
                        }
                        htmlStr += '</a></td>';
                    }
                } else {
                    // V5 Fix: use persistentWidthStyle (savedWidthMap) instead of always-recalculated relativePct
                    htmlStr += '<td data-depth="' + depth + '" data-nodeid="' + cid + '" style="' + persistentWidthStyle + ' vertical-align:top; border:1px solid #94a3b8; background:#f0f7ff; padding:6px; border-radius:0 !important;">';
                    htmlStr += '<a class="sticky-content" style="cursor: pointer; background:#f0f7ff; padding:0; border-radius:0 !important;" data-nodeid="' + cid + '">';
                    if (bc) htmlStr += bc;
                    if (hasChild || hasContent) htmlStr += '<button class="row-fold-btn" onclick="toggleChildRows(this)">▼</button>';
                    if (displayTitle) htmlStr += '<div class="note-title" style="font-size: 15px; margin-bottom: 4px;">' + renderMarkdown(formatLinks(escapeHtml(displayTitle))) + '</div>';
                    htmlStr += '</a><div class="resizer"></div></td>';

                    if (hasTitle && !hasContent && hasChild) {
                        htmlStr += '<td style="vertical-align:top; border:1px solid #94a3b8; padding:0; background:white;">';
                        htmlStr += '<div class="tc-child-container">';
                        n.childNotes.forEach(function (c) {
                            htmlStr += renderNode(c, depth + 1, newPath);
                        });
                        htmlStr += '</div>';
                        htmlStr += '</td>';
                    } else {
                        var pTop = hasContent ? "6px" : "0px";
                        htmlStr += '<td style="vertical-align:top; border:1px solid #94a3b8; padding:' + pTop + '; padding-bottom: 6px; background:white;">';
                        htmlStr += '<a class="sticky-content" style="cursor: pointer; position:static;" data-nodeid="' + cid + '">';
                        var savedImgStyle3 = "";
                        var epaint3 = getNodePicHash(n);
                        if (epaint3 && self.savedImgHash && self.savedImgHash[epaint3] && self.savedImgHash[epaint3].w) {
                            savedImgStyle3 = ' style="width:' + self.savedImgHash[epaint3].w + '; height: auto !important;" ';
                        }
                        var excerptResult = renderExcerpt(n, cid, savedImgStyle3);
                        htmlStr += excerptResult.html;

                        if (n.comments) {
                            n.comments.forEach(function (cm) {
                                var isTextMode = false;
                                var targetNote = null;
                                if (cm.type === "LinkNote" && cm.noteid) {
                                    targetNote = Database.sharedInstance().getNoteById(cm.noteid);
                                    if (targetNote && isTextFirst(targetNote) && targetNote.excerptText) {
                                        isTextMode = true;
                                    }
                                }
                                var p = getCommentPaint(cm);
                                if (isTextMode) p = "";
                                if (p) {
                                    var m = getImageMediaData(p);
                                    if (m) {
                                        var b = m.base64Encoding();
                                        if (b) {
                                            var cImgStyle = "";
                                            if (self.savedImgHash && self.savedImgHash[p] && self.savedImgHash[p].w) {
                                                cImgStyle = ' style="width:' + self.savedImgHash[p].w + '; height: auto !important;" ';
                                            }
                                            htmlStr += '<div class="resize-img-container"><img data-paint="' + p + '" src="data:' + getImageMimeType(b) + ';base64,' + b + '"' + cImgStyle + '/><div class="img-resizer"></div></div>';
                                        }
                                    }
                                } else {
                                    var ct = renderCommentText(cm);
                                    if (!ct && isTextMode && targetNote && targetNote.excerptText) ct = renderMarkdown(formatLinks(escapeHtml(targetNote.excerptText)));
                                    if (ct) htmlStr += '<div class="note-excerpt" style="border-top: 1px dashed #e2e8f0; padding-top: 4px; margin-top: 8px;">' + ct + '</div>';
                                }
                            });
                        }
                        htmlStr += '</a>';
                        if (hasChild) {
                            var mTopChild = hasContent ? "6px" : "0";
                            htmlStr += '<div class="tc-child-container" style="margin-top: ' + mTopChild + ';">';
                            n.childNotes.forEach(function (c) {
                                htmlStr += renderNode(c, depth + 1, newPath);
                            });
                            htmlStr += '</div>';
                        }
                        htmlStr += '</td>';
                    }
                }

                htmlStr += '</tr></tbody></table>';
                return htmlStr;
            }

            if (rootNote.childNotes && rootNote.childNotes.length > 0) {
                rootNote.childNotes.forEach(function (child) {
                    html += renderNode(child, 1, [rootNote]);
                });
            }

            html += '</div>'; // section-body
        }
        html += common.js;
        html += '</body></html>';
        return html;
    }

    function buildHtmlTable(rootNotes, isCompact) {
        var common = getCommonHtmlPrefix(isCompact);
        var html = common.prefix;
        var opt = calculateOptimalWidths(rootNotes);

        for (var idx = 0; idx < rootNotes.length; idx++) {
            var rootNote = resolveSketchNote(rootNotes[idx]);
            var rawTitle = getExplicitNoteTitle(rootNote);

            if (rawTitle) {
                html += '<div class="section-header">';
                // V3.2.2: Use <a> with data-nodeid to enable bi-link focusing
                html += '<a data-nodeid="' + rootNote.noteId + '" style="cursor:pointer; color:inherit; text-decoration:none; display:inline-block; flex:1;">' + renderMarkdown(formatLinks(escapeHtml(rawTitle))) + '</a>';
                html += '<button class="fold-btn" onclick="toggleSection(this)">▼</button>';
                html += '</div>';
            }

            html += '<div class="section-body">';

            // --- NEW: 根节点内容脱壳前置 ---
            var rootHasContent = false;
            if (rootNote.excerptText || getNodePicHash(rootNote) || getMNContentHtml(rootNote)) rootHasContent = true;
            if (rootNote.comments && rootNote.comments.length > 0) rootHasContent = true;

            if (rootHasContent) {
                // V3.2.2: Wrap content area in <a> for bi-link support
                var rootBorderTop = rawTitle ? 'none' : '1px solid #94a3b8';
                html += '<a data-nodeid="' + rootNote.noteId + '" style="display:block; text-decoration:none; color:inherit; padding: 10px 15px; margin-bottom: 2px; background: #fff; border: 1px solid #94a3b8; border-top: ' + rootBorderTop + '; border-radius: 0 !important;">';

                var savedImgStyleRoot2 = "";
                var epaintRoot2 = getNodePicHash(rootNote);
                if (epaintRoot2 && self.savedImgHash && self.savedImgHash[epaintRoot2] && self.savedImgHash[epaintRoot2].w) {
                    savedImgStyleRoot2 = ' style="width:' + self.savedImgHash[epaintRoot2].w + '; height: auto !important;" ';
                }
                var excerptResult2 = renderExcerpt(rootNote, null, savedImgStyleRoot2);
                html += excerptResult2.html;

                if (rootNote.comments) {
                    rootNote.comments.forEach(function (cm) {
                        var isTextMode = false;
                        var targetNote = null;
                        if (cm.type === "LinkNote" && cm.noteid) {
                            targetNote = Database.sharedInstance().getNoteById(cm.noteid);
                            if (targetNote && isTextFirst(targetNote) && targetNote.excerptText) {
                                isTextMode = true;
                            }
                        }
                        var p = getCommentPaint(cm);
                        if (isTextMode) p = "";
                        if (p) {
                            var m = getImageMediaData(p);
                            if (m) {
                                var b = m.base64Encoding();
                                if (b) {
                                    var cImgStyle = "";
                                    if (self.savedImgHash && self.savedImgHash[p] && self.savedImgHash[p].w) {
                                        cImgStyle = ' style="width:' + self.savedImgHash[p].w + '; height: auto !important;" ';
                                    }
                                    html += '<div class="resize-img-container" style="margin-top:8px;"><img data-paint="' + p + '" src="data:' + getImageMimeType(b) + ';base64,' + b + '"' + cImgStyle + '/><div class="img-resizer"></div></div>';
                                }
                            }
                        } else {
                            var ct = renderCommentText(cm);
                            if (!ct && isTextMode && targetNote && targetNote.excerptText) ct = renderMarkdown(formatLinks(escapeHtml(targetNote.excerptText)));
                            if (ct) html += '<div class="note-excerpt" style="border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 8px; color:#444; font-size:15px;">' + ct + '</div>';
                        }
                    });
                }
                html += '</a>';
            }

            function renderNode(n, depth, path) {
                if (!n || depth > MAX_NOTE_TREE_DEPTH || isNoteInPath(n, path)) return '';
                n = resolveSketchNote(n);
                if (!n || isNoteInPath(n, path)) return '';
                var newPath = (path || []).slice();
                newPath.push(n);

                var displayTitle = getExplicitNoteTitle(n);
                var hasTitle = displayTitle ? true : false;
                var hasContent = false;
                if (n.excerptText) hasContent = true;
                if (getNodePicHash(n) || getMNContentHtml(n)) hasContent = true;
                if (n.comments && n.comments.length > 0) hasContent = true;
                var hasChild = (n.childNotes && n.childNotes.length > 0);

                // 1. 纯结构节点（无标题无内容，只有挂载下级作用）-> 透传
                if (!hasTitle && !hasContent && hasChild) {
                    var childHtmlStr = '';
                    n.childNotes.forEach(function (c) {
                        childHtmlStr += renderNode(c, depth, newPath); // 保持同一depth透传
                    });
                    return childHtmlStr;
                }

                // V2.5.0 calculate local relative percentage for nested tables
                var currentWidthWeight = opt.widths[depth] || 18;
                var remainingWeight = 0;
                for (var wi = depth; wi <= opt.maxDepth; wi++) remainingWeight += (opt.widths[wi] || 0);
                if (remainingWeight <= 0) remainingWeight = 100;
                var relativePct = Math.round((currentWidthWeight / remainingWeight) * 10000) / 100;

                // V5 Fix: apply savedWidthMap in merge mode too, same as title mode
                var persistentWidthStyle = "";
                var cid = n.noteId || "root";
                if (self.isSyncWidth !== true && self.savedNodeWidthMap && self.savedNodeWidthMap[cid]) {
                    persistentWidthStyle = "width: " + self.savedNodeWidthMap[cid].w + " !important; ";
                }
                else if (self.savedWidthMap && self.savedWidthMap[depth]) {
                    persistentWidthStyle = "width: " + self.savedWidthMap[depth] + " !important; ";
                } else {
                    persistentWidthStyle = "width: " + relativePct + "%; ";
                }

                var mTop = "0";
                var htmlStr = '<table class="merge-mode-table" style="margin:0; width:100%; table-layout: auto !important; border:1px solid #94a3b8; border-collapse:collapse; margin-top:' + mTop + '; border-radius:0 !important; box-shadow:none !important;"><tbody><tr>';

                var bc = "";
                if (depth > 1 && path && path.length > 0) {
                    var bcPath = "";
                    for (var pi = 0; pi < path.length; pi++) {
                        var pn = path[pi];
                        var pt = getExplicitNoteTitle(pn) || "笔记";
                        bcPath += (bcPath ? " > " : "") + pt;
                    }
                    if (bcPath) bc = '<div class="print-breadcrumb" style="display:none;">' + escapeHtml(bcPath) + '</div>';
                }

                // 统一将标题和内容塞进同一个 td
                var colSpanAttr = hasChild ? '' : ' colspan="2"';
                // V5 Fix: use persistentWidthStyle (computed just above) instead of hardcoded relativePct
                htmlStr += '<td data-depth="' + depth + '" data-nodeid="' + cid + '"' + colSpanAttr + ' style="' + persistentWidthStyle + ' vertical-align:top; border:1px solid #94a3b8; padding:6px; background:white;">';
                htmlStr += '<a class="sticky-content" style="cursor: pointer; position:static;" data-nodeid="' + cid + '">';

                if (bc) htmlStr += bc;
                if (hasChild || hasContent) htmlStr += '<button class="row-fold-btn" onclick="toggleChildRows(this)">▼</button>';

                if (displayTitle) {
                    htmlStr += '<div class="note-title" style="font-size: 15px; margin-bottom: 4px; color:#1e293b; font-weight:bold;">' + renderMarkdown(formatLinks(escapeHtml(displayTitle))) + '</div>';
                }

                var savedImgStyle4 = "";
                var epaint4 = getNodePicHash(n);
                if (epaint4 && self.savedImgHash && self.savedImgHash[epaint4] && self.savedImgHash[epaint4].w) {
                    savedImgStyle4 = ' style="width:' + self.savedImgHash[epaint4].w + '; height: auto !important;" ';
                }
                var excerptResult3 = renderExcerpt(n, cid, savedImgStyle4);
                htmlStr += excerptResult3.html;

                if (n.comments) {
                    n.comments.forEach(function (cm) {
                        var isTextMode = false;
                        var targetNote = null;
                        if (cm.type === "LinkNote" && cm.noteid) {
                            targetNote = Database.sharedInstance().getNoteById(cm.noteid);
                            if (targetNote && isTextFirst(targetNote) && targetNote.excerptText) {
                                isTextMode = true;
                            }
                        }
                        var p = getCommentPaint(cm);
                        if (isTextMode) p = "";
                        if (p) {
                            var m = getImageMediaData(p);
                            if (m) {
                                var b = m.base64Encoding();
                                if (b) {
                                    var cImgStyle = "";
                                    if (self.savedImgHash && self.savedImgHash[p] && self.savedImgHash[p].w) {
                                        cImgStyle = ' style="width:' + self.savedImgHash[p].w + '; height: auto !important;" ';
                                    }
                                    htmlStr += '<div class="resize-img-container"><img data-paint="' + p + '" src="data:' + getImageMimeType(b) + ';base64,' + b + '"' + cImgStyle + '/><div class="img-resizer"></div></div>';
                                }
                            }
                        } else {
                            var ct = renderCommentText(cm);
                            if (!ct && isTextMode && targetNote && targetNote.excerptText) ct = renderMarkdown(formatLinks(escapeHtml(targetNote.excerptText)));
                            if (ct) htmlStr += '<div class="note-excerpt" style="border-top: 1px dashed #e2e8f0; padding-top: 4px; margin-top: 8px;">' + ct + '</div>';
                        }
                    });
                }

                htmlStr += '</a><div class="resizer"></div></td>';

                if (hasChild) {
                    htmlStr += '<td style="vertical-align:top; border:1px solid #94a3b8; padding:0; background:white;">';
                    htmlStr += '<div class="tc-child-container">';
                    n.childNotes.forEach(function (c) {
                        htmlStr += renderNode(c, depth + 1, newPath);
                    });
                    htmlStr += '</div></td>';
                }

                htmlStr += '</tr></tbody></table>';
                return htmlStr;
            }

            if (rootNote.childNotes && rootNote.childNotes.length > 0) {
                rootNote.childNotes.forEach(function (child) {
                    html += renderNode(child, 1, [rootNote]);
                });
            }

            html += '</div>'; // section-body
        }
        html += common.js;
        html += '</body></html>';
        return html;
    }

    // ==========================================
    // V3: Multi-Window Helper Functions
    // ==========================================
    var MINIMIZED_POSITION_KEY = "momo.mindmap2table.minimizedPanelPosition";

    function copyFrame(frame) {
        if (!frame) return null;
        return {
            x: Number(frame.x) || 0,
            y: Number(frame.y) || 0,
            width: Number(frame.width) || 0,
            height: Number(frame.height) || 0
        };
    }

    function loadMinimizedPosition() {
        try {
            var ud = NSUserDefaults.standardUserDefaults();
            var raw = ud.objectForKey(MINIMIZED_POSITION_KEY);
            if (!raw) return null;
            if (typeof raw === "string") raw = JSON.parse(raw);
            if (!raw || !isFinite(Number(raw.x)) || !isFinite(Number(raw.y))) return null;
            return { x: Number(raw.x), y: Number(raw.y) };
        } catch (e) {
            return null;
        }
    }

    function saveMinimizedPosition(frame) {
        if (!frame) return;
        try {
            var ud = NSUserDefaults.standardUserDefaults();
            ud.setObjectForKey(JSON.stringify({
                x: Number(frame.x) || 0,
                y: Number(frame.y) || 0
            }), MINIMIZED_POSITION_KEY);
        } catch (e) { }
    }

    function clampMinimizedFrame(position, bounds, width, height) {
        var bw = Number(bounds && bounds.width) || 1024;
        var bh = Number(bounds && bounds.height) || 768;
        var w = Number(width) || 180;
        var h = Number(height) || 44;
        var maxX = Math.max(0, bw - w);
        var maxY = Math.max(0, bh - h);
        var x = Number(position && position.x);
        var y = Number(position && position.y);
        if (!isFinite(x)) x = 0;
        if (!isFinite(y)) y = 0;
        return {
            x: Math.max(0, Math.min(maxX, x)),
            y: Math.max(0, Math.min(maxY, y)),
            width: w,
            height: h
        };
    }

    function findPanelEntryFromView(view) {
        if (!self.panels || !view) return null;
        var current = view;
        for (var attempt = 0; attempt < 10 && current; attempt++) {
            for (var i = 0; i < self.panels.length; i++) {
                if (self.panels[i].panel === current) {
                    self.lastActivePe = self.panels[i]; // Track last active
                    return self.panels[i];
                }
            }
            current = current.superview;
        }
        return null;
    }

    function escapeJavaScriptString(value) {
        return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }

    function scrollPanelToNote(pe, noteId) {
        if (!pe || !pe.webView || pe.panel.hidden || pe.isLinked === false || !noteId) return;
        var id = String(noteId);
        pe.lastFocusedNoteId = id;
        pe.webView.evaluateJavaScript("if(window.scrollToNote) window.scrollToNote('" + escapeJavaScriptString(id) + "');", function () { });
    }

    function startGlobalPollTimer() {
        if (self.pollTimer) {
            self.pollTimer.invalidate();
            self.pollTimer = null;
        }
        self.pollTimer = NSTimer.scheduledTimerWithTimeInterval(0.5, true, function (timer) {
            // Per-panel polling
            var panels = self.panels || [];
            for (var pi = 0; pi < panels.length; pi++) {
                (function (pe) {
                    if (!pe.webView || pe.panel.hidden) return;
                    // Poll 1: clickedNoteId
                    pe.webView.evaluateJavaScript("(function(){ var r = window.clickedNoteId; window.clickedNoteId = null; return r; })()", function (res, error) {
                        if (res && res !== "null" && res !== "") {
                            var app = Application.sharedInstance();
                            var sc = app.studyController(self.window);
                            if (sc && pe.isLinked !== false) {
                                sc.focusNoteInMindMapById(String(res));
                                sc.focusNoteInDocumentById(String(res));
                            }
                        }
                    });
                    // Poll 2: clickedCopyWord
                    pe.webView.evaluateJavaScript("window.clickedCopyWord;", function (res, error) {
                        if (res && res !== "null" && res !== "") {
                            pe.webView.evaluateJavaScript("window.clickedCopyWord = null;", function () { });
                            UIPasteboard.generalPasteboard().setString(res);
                            Application.sharedInstance().showHUD("✅ 已原生写入系统剪贴板，请前往 Word / WPS 粘贴！", self.window, 3);
                        }
                    });
                    // Poll 3: mindmap selection sync
                    var sc2 = Application.sharedInstance().studyController(self.window);
                    if (sc2 && sc2.notebookController && sc2.notebookController.mindmapView) {
                        var selViewLst = sc2.notebookController.mindmapView.selViewLst;
                        var selectedItems = getNativeArrayItems(selViewLst, 1);
                        if (selectedItems.length > 0) {
                            var selectedNote = getNoteFromMindMapSelection(selectedItems[0]);
                            var curId = selectedNote && selectedNote.noteId ? String(selectedNote.noteId) : null;
                            var lastId = pe.lastFocusedNoteId !== null ? String(pe.lastFocusedNoteId) : null;
                            if (curId && curId !== lastId) {
                                scrollPanelToNote(pe, curId);
                            }
                        } else {
                            pe.lastFocusedNoteId = null;
                        }
                    }
                })(panels[pi]);
            }
            // Library webView polling (global, not per-panel)
            if (self.libWebView) {
                self.libWebView.evaluateJavaScript("(function(){ var a = window.libraryAction; window.libraryAction = null; return a; })()", function (res, error) {
                    if (res && res !== "null" && res !== "") {
                        try {
                            var actionResult = processLibraryAction(res, self);
                            if (actionResult) {
                                var isForceNew = (typeof actionResult === 'object' && actionResult.forceNew === true);
                                var targetPe = null;

                                if (!isForceNew) {
                                    // Default: Find the active (visible, non-hidden) panel to refresh, or last active, or first panel
                                    var allPanels = self.panels || [];
                                    // Priority 1: Last active panel (if still valid and not hidden)
                                    if (self.lastActivePe && !self.lastActivePe.panel.hidden) {
                                        targetPe = self.lastActivePe;
                                    }
                                    // Priority 2: Any visible panel
                                    if (!targetPe) {
                                        for (var ti = 0; ti < allPanels.length; ti++) {
                                            if (!allPanels[ti].panel.hidden) { targetPe = allPanels[ti]; break; }
                                        }
                                    }
                                    // Priority 3: First panel (even if hidden)
                                    if (!targetPe && allPanels.length > 0) targetPe = allPanels[0];
                                }

                                if (targetPe && targetPe.webView && self.savedRootNoteIds && self.savedRootNoteIds.length > 0) {
                                    // Refresh existing panel
                                    if (targetPe.panel.hidden) targetPe.panel.hidden = false;
                                    if (targetPe.panel.superview) targetPe.panel.superview.bringSubviewToFront(targetPe.panel);

                                    var rootNotes = [];
                                    for (var ri = 0; ri < self.savedRootNoteIds.length; ri++) {
                                        var rn = Database.sharedInstance().getNoteById(self.savedRootNoteIds[ri]);
                                        if (rn) rootNotes.push(rn);
                                    }
                                    if (rootNotes.length > 0) {
                                        targetPe.rootNotes = rootNotes;
                                        targetPe.savedRootNoteIds = self.savedRootNoteIds.slice();
                                        targetPe.tableMode = self.tableMode;
                                        targetPe.savedWidthMap = self.savedWidthMap || {};
                                        targetPe.savedImgHash = self.savedImgHash || {};
                                        var refreshHtml = (self.tableMode === "titlecontent") ? buildTitleContentTable(rootNotes, self.isCompactMode) : buildHtmlTable(rootNotes, self.isCompactMode);
                                        targetPe.currentHtml = refreshHtml;
                                        var app2 = Application.sharedInstance();
                                        var tempPath = app2.tempPath + "/view_table.html";
                                        var fileData = NSData.dataWithStringEncoding(refreshHtml, 4);
                                        if (fileData) {
                                            fileData.writeToFileAtomically(tempPath, false);
                                            targetPe.webView.loadRequest(NSURLRequest.requestWithURL(NSURL.fileURLWithPath(tempPath)));
                                        }
                                    } else {
                                        Application.sharedInstance().showHUD("未找到原始笔记，请重新选择节点", self.window, 2);
                                    }
                                } else if (self.savedRootNoteIds && self.savedRootNoteIds.length > 0) {
                                    // Force New Window (or no panels exist)
                                    var rootNotes2 = [];
                                    for (var rj = 0; rj < self.savedRootNoteIds.length; rj++) {
                                        var rn2 = Database.sharedInstance().getNoteById(self.savedRootNoteIds[rj]);
                                        if (rn2) rootNotes2.push(rn2);
                                    }
                                    if (rootNotes2.length > 0) {
                                        self.rootNotes = rootNotes2; // Ensure showPanel sees this
                                        var newHtml = (self.tableMode === "titlecontent") ? buildTitleContentTable(rootNotes2, self.isCompactMode) : buildHtmlTable(rootNotes2, self.isCompactMode);
                                        showPanel(self, newHtml);
                                    }
                                }
                            }
                        } catch (e) {
                            Application.sharedInstance().showHUD("Library Action Error: " + e, self.window, 2);
                        }
                    }
                });
            }
        });
    }

    // ==========================================
    // \u6253\u8d4f\u4e8c\u7ef4\u7801\u5f39\u7a97\uff08\u666e\u901a JS \u95ed\u5305\uff0c\u975e JSB \u65b9\u6cd5\uff09
    // ==========================================
    function showQRCodePanel(self, type) {
        try {
            var app = Application.sharedInstance();
            var studyController = app.studyController(self.window);
            var containerView = studyController ? studyController.view : self.window;
            if (!containerView) { app.showHUD("QR: no view", self.window, 2); return; }
            var frame = containerView.bounds;
            var fw = frame.width || 1024;
            var fh = frame.height || 768;

            // \u5148\u5173\u95ed\u6253\u8d4f\u5f39\u7a97
            if (self.donateAlertView) {
                self.donateAlertView.removeFromSuperview(); self.donateAlertView = null;
            }
            if (self.donateMaskView) {
                self.donateMaskView.removeFromSuperview(); self.donateMaskView = null;
            }

            var imgName = type === "wechat" ? "wechat" : "alipay";
            var titleText = type === "wechat" ? "\u5fae\u4fe1\u626b\u7801\u6253\u8d4f" : "\u652f\u4ed8\u5b9d\u626b\u7801\u6253\u8d4f";

            // \u52a0\u8f7d\u56fe\u7247\uff1a\u5148\u5c1d\u8bd5 mainPath\uff0c\u518d\u5c1d\u8bd5 NSBundle
            var img = null;
            if (mainPath) {
                img = UIImage.imageWithContentsOfFile(mainPath + "/" + imgName + ".jpg");
                if (!img) img = UIImage.imageWithContentsOfFile(mainPath + "/" + imgName + ".png");
            }
            if (!img) {
                var p2 = NSBundle.mainBundle().pathForResourceOfType(imgName, "jpg");
                if (p2) img = UIImage.imageWithContentsOfFile(p2);
            }

            var qrView = new UIView({ x: (fw - 280) / 2, y: (fh - 340) / 2, width: 280, height: 340 });
            qrView.backgroundColor = UIColor.whiteColor();
            qrView.layer.cornerRadius = 12;
            qrView.layer.shadowColor = UIColor.blackColor().CGColor;
            qrView.layer.shadowOpacity = 0.25;
            qrView.layer.shadowOffset = { width: 0, height: 2 };
            qrView.layer.shadowRadius = 8;

            var qrTitle = new UILabel({ x: 20, y: 15, width: 240, height: 30 });
            qrTitle.text = titleText;
            qrTitle.font = UIFont.boldSystemFontOfSize(16);
            qrTitle.textColor = UIColor.colorWithRedGreenBlueAlpha(0.15, 0.15, 0.15, 1);
            qrTitle.textAlignment = 1;
            qrView.addSubview(qrTitle);

            var imgView = new UIImageView({ x: 40, y: 55, width: 200, height: 200 });
            imgView.contentMode = 3;
            imgView.backgroundColor = UIColor.colorWithWhiteAlpha(0.95, 1);
            imgView.layer.cornerRadius = 8;
            if (img) {
                imgView.image = img;
            } else {
                var tip = new UILabel({ x: 5, y: 60, width: 190, height: 80 });
                tip.text = "\u56fe\u7247\u672a\u627e\u5230\n(" + imgName + ".jpg)\n\u8bf7\u68c0\u67e5\u63d2\u4ef6\u76ee\u5f55";
                tip.font = UIFont.systemFontOfSize(12);
                tip.textColor = UIColor.grayColor();
                tip.textAlignment = 1;
                tip.numberOfLines = 3;
                imgView.addSubview(tip);
            }
            qrView.addSubview(imgView);

            var qrClose = UIButton.buttonWithType(0);
            qrClose.frame = { x: 90, y: 292, width: 100, height: 36 };
            qrClose.setTitleForState("\u5173\u95ed", 0);
            qrClose.backgroundColor = UIColor.colorWithWhiteAlpha(0.92, 1);
            qrClose.setTitleColorForState(UIColor.grayColor(), 0);
            qrClose.layer.cornerRadius = 8;
            qrClose.titleLabel.font = UIFont.systemFontOfSize(14);
            qrClose.addTargetActionForControlEvents(self, "onCloseQRAlert:", 1 << 6);
            qrView.addSubview(qrClose);

            var qrMask = new UIView({ x: 0, y: 0, width: fw, height: fh });
            qrMask.backgroundColor = UIColor.colorWithWhiteAlpha(0, 0.5);
            qrMask.tag = 998;
            var qrTap = new UITapGestureRecognizer(self, "onCloseQRAlert:");
            qrMask.addGestureRecognizer(qrTap);

            containerView.addSubview(qrMask);
            containerView.addSubview(qrView);
            self.qrAlertView = qrView;
            self.qrMaskView = qrMask;
        } catch (e) {
            Application.sharedInstance().showHUD("QR Err: " + e, self.window, 4);
        }
    }

    function showPanel(self, htmlStr) {
        var app = Application.sharedInstance();
        var studyController = app.studyController(self.window);
        var containerView = studyController ? studyController.view : self.window;
        var frame = containerView.bounds;

        var panelWidth = 650;
        var panelHeight = 550;

        // Prevent NaN crashes by providing safe fallback dimensions
        var frameWidth = frame.width || 1024;
        var frameHeight = frame.height || 768;

        // V3: Calculate cascade offset for new windows
        var offset = (self.panels ? self.panels.length : 0) * 30;

        var pPanel = new UIView({
            x: (frameWidth - panelWidth) / 2 + (offset % 150),
            y: (frameHeight - panelHeight) / 2 + (offset % 150),
            width: panelWidth,
            height: panelHeight
        });

        pPanel.layer.cornerRadius = 10;
        pPanel.backgroundColor = UIColor.whiteColor();
        pPanel.clipsToBounds = true;
        pPanel.userInteractionEnabled = true;
        pPanel.autoresizingMask = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);

        // 1. Title Bar
        var pTitleBar = new UIView({
            x: 0, y: 0, width: panelWidth, height: 44
        });

        var pastelColors = [
            UIColor.colorWithRedGreenBlueAlpha(0.89, 0.96, 1.0, 1),   // Light Blue
            UIColor.colorWithRedGreenBlueAlpha(1.0, 0.94, 0.96, 1),   // Light Pink
            UIColor.colorWithRedGreenBlueAlpha(0.92, 0.98, 0.92, 1),  // Light Green
            UIColor.colorWithRedGreenBlueAlpha(1.0, 0.98, 0.88, 1),   // Light Yellow
            UIColor.colorWithRedGreenBlueAlpha(0.96, 0.92, 1.0, 1),   // Light Purple
            UIColor.colorWithRedGreenBlueAlpha(0.98, 0.94, 0.9, 1)    // Light Peach
        ];
        var randomColor = pastelColors[Math.floor(Math.random() * pastelColors.length)];
        pTitleBar.backgroundColor = randomColor; // V3.3: Random pastel color instead of white
        pTitleBar.autoresizingMask = (1 << 1);
        pTitleBar.userInteractionEnabled = true;
        pPanel.addSubview(pTitleBar);

        var dragGesture = new UIPanGestureRecognizer(self, "onDrag:");
        pTitleBar.addGestureRecognizer(dragGesture);

        var pTitleLabel = new UILabel({
            x: 16, y: 0, width: panelWidth - 400, height: 44
        });

        // V3.3: Dynamic title text based on root note
        var titleText = "脑图表格";
        if (self.rootNotes && self.rootNotes.length > 0) {
            var rootNote = self.rootNotes[0];
            var explicitTitle = getExplicitNoteTitle(rootNote);
            if (explicitTitle) titleText = explicitTitle;
        }
        pTitleLabel.text = titleText;
        pTitleLabel.font = UIFont.systemFontOfSize(14);
        pTitleLabel.textColor = UIColor.darkGrayColor();
        pTitleLabel.autoresizingMask = (1 << 1);
        pTitleLabel.userInteractionEnabled = false;
        pTitleBar.addSubview(pTitleLabel);

        var styleButtonLocal = function (btn, bgColor, textColor, radius) {
            btn.backgroundColor = bgColor;
            btn.setTitleColorForState(textColor, 0);
            btn.layer.cornerRadius = radius || 6;
            btn.layer.borderWidth = 0.5;
            btn.layer.borderColor = UIColor.colorWithWhiteAlpha(0, 0.1);
        };

        var btnY = 8;
        var btnH = 28;
        var gap = 8;
        var currentX = panelWidth - 10;

        // 1. Close Button
        var closeBtn = UIButton.buttonWithType(0);
        var closeW = 36;
        currentX -= closeW;
        closeBtn.frame = { x: currentX, y: btnY, width: closeW, height: btnH };
        closeBtn.setTitleForState("✕", 0);
        styleButtonLocal(closeBtn, UIColor.colorWithRedGreenBlueAlpha(1, 0.94, 0.94, 1), UIColor.colorWithRedGreenBlueAlpha(0.86, 0.18, 0.18, 1), 6);
        closeBtn.titleLabel.font = UIFont.boldSystemFontOfSize(16);
        closeBtn.autoresizingMask = (1 << 0);
        closeBtn.addTargetActionForControlEvents(self, "onClose:", 1 << 6);
        pTitleBar.addSubview(closeBtn);

        // 2. Minimize Button
        var minBtn = UIButton.buttonWithType(0);
        var minW = 36;
        currentX -= (gap + minW);
        minBtn.frame = { x: currentX, y: btnY, width: minW, height: btnH };
        minBtn.setTitleForState("➖", 0);
        styleButtonLocal(minBtn, UIColor.colorWithWhiteAlpha(0.9, 1), UIColor.darkGrayColor(), 6);
        minBtn.titleLabel.font = UIFont.systemFontOfSize(14);
        minBtn.autoresizingMask = (1 << 0);
        minBtn.addTargetActionForControlEvents(self, "onMinimize:", 1 << 6);
        pTitleBar.addSubview(minBtn);

        // 3. Export
        var exportBtn = UIButton.buttonWithType(0);
        var expW = 42;
        currentX -= (gap + expW);
        exportBtn.frame = { x: currentX, y: btnY, width: expW, height: btnH };
        exportBtn.setTitleForState("共享", 0);
        styleButtonLocal(exportBtn, UIColor.colorWithRedGreenBlueAlpha(0.92, 0.95, 1, 1), UIColor.colorWithRedGreenBlueAlpha(0.02, 0.44, 0.88, 1), 6);
        exportBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        exportBtn.autoresizingMask = (1 << 0);
        exportBtn.addTargetActionForControlEvents(self, "onExportSafari:", 1 << 6);
        pTitleBar.addSubview(exportBtn);

        // 4. Mode Button
        var pModeBtn = UIButton.buttonWithType(0);
        var modeW = 42;
        currentX -= (gap + modeW);
        pModeBtn.frame = { x: currentX, y: btnY, width: modeW, height: btnH };
        pModeBtn.setTitleForState(self.tableMode === "titlecontent" ? "标题" : "合并", 0);
        styleButtonLocal(pModeBtn, UIColor.colorWithRedGreenBlueAlpha(0.96, 0.93, 1, 1), UIColor.colorWithRedGreenBlueAlpha(0.48, 0.3, 0.85, 1), 6);
        pModeBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        pModeBtn.autoresizingMask = (1 << 0);
        pModeBtn.addTargetActionForControlEvents(self, "onToggleMode:", 1 << 6);
        pTitleBar.addSubview(pModeBtn);

        // 5. Breadcrumb Button
        var pBcBtn = UIButton.buttonWithType(0);
        var bcW = 42;
        currentX -= (gap + bcW);
        pBcBtn.frame = { x: currentX, y: btnY, width: bcW, height: btnH };
        pBcBtn.setTitleForState(self.showBreadcrumb === false ? "路关" : "路开", 0);
        styleButtonLocal(pBcBtn, UIColor.colorWithWhiteAlpha(0.93, 1), UIColor.grayColor(), 6);
        pBcBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        pBcBtn.autoresizingMask = (1 << 0);
        pBcBtn.addTargetActionForControlEvents(self, "onToggleBreadcrumb:", 1 << 6);
        pTitleBar.addSubview(pBcBtn);

        // 6. Link/Unlink Button
        var pLinkBtn = UIButton.buttonWithType(0);
        var linkW = 42;
        currentX -= (gap + linkW);
        pLinkBtn.frame = { x: currentX, y: btnY, width: linkW, height: btnH };
        pLinkBtn.setTitleForState(self.isLinked ? "链接" : "解链", 0);
        if (self.isLinked) {
            styleButtonLocal(pLinkBtn, UIColor.colorWithRedGreenBlueAlpha(0.92, 0.98, 0.92, 1), UIColor.colorWithRedGreenBlueAlpha(0.13, 0.55, 0.13, 1), 6);
        } else {
            styleButtonLocal(pLinkBtn, UIColor.colorWithWhiteAlpha(0.93, 1), UIColor.grayColor(), 6);
        }
        pLinkBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        pLinkBtn.autoresizingMask = (1 << 0);
        pLinkBtn.addTargetActionForControlEvents(self, "onToggleLink:", 1 << 6);
        pTitleBar.addSubview(pLinkBtn);
        
        // 10. Sync Width Button
        var pSyncWBtn = UIButton.buttonWithType(0);
        var syncW = 50;
        currentX -= (gap + syncW);
        pSyncWBtn.frame = { x: currentX, y: btnY, width: syncW, height: btnH };
        pSyncWBtn.setTitleForState(self.isSyncWidth ? "宽:同" : "宽:独", 0);
        if (self.isSyncWidth) {
            styleButtonLocal(pSyncWBtn, UIColor.colorWithRedGreenBlueAlpha(0.9, 0.95, 1.0, 1), UIColor.colorWithRedGreenBlueAlpha(0.2, 0.4, 0.8, 1), 6);
        } else {
            styleButtonLocal(pSyncWBtn, UIColor.colorWithRedGreenBlueAlpha(1.0, 0.9, 0.9, 1), UIColor.colorWithRedGreenBlueAlpha(0.8, 0.2, 0.2, 1), 6);
        }
        pSyncWBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        pSyncWBtn.autoresizingMask = (1 << 0);
        pSyncWBtn.addTargetActionForControlEvents(self, "onToggleWidthSync:", 1 << 6);
        pTitleBar.addSubview(pSyncWBtn);

        // 7. Refresh Button
        var pRefreshBtn = UIButton.buttonWithType(0);
        var refreshW = 42;
        currentX -= (gap + refreshW);
        pRefreshBtn.frame = { x: currentX, y: btnY, width: refreshW, height: btnH };
        pRefreshBtn.setTitleForState("刷新", 0);
        styleButtonLocal(pRefreshBtn, UIColor.colorWithRedGreenBlueAlpha(1, 0.96, 0.9, 1), UIColor.colorWithRedGreenBlueAlpha(0.85, 0.45, 0.1, 1), 6);
        pRefreshBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        pRefreshBtn.autoresizingMask = (1 << 0);
        pRefreshBtn.addTargetActionForControlEvents(self, "onRefresh:", 1 << 6);
        pTitleBar.addSubview(pRefreshBtn);

        // 8. Library Group
        var libOpenBtn = UIButton.buttonWithType(0);
        var libOpenW = 36;
        currentX -= (gap + libOpenW);
        libOpenBtn.frame = { x: currentX, y: btnY, width: libOpenW, height: btnH };
        libOpenBtn.setTitleForState("库", 0);
        styleButtonLocal(libOpenBtn, UIColor.colorWithRedGreenBlueAlpha(0.93, 0.95, 1.0, 1), UIColor.colorWithRedGreenBlueAlpha(0.2, 0.4, 0.8, 1), 6);
        libOpenBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        libOpenBtn.autoresizingMask = (1 << 0);
        libOpenBtn.addTargetActionForControlEvents(self, "onOpenLibrary:", 1 << 6);
        pTitleBar.addSubview(libOpenBtn);

        var libSaveBtn = UIButton.buttonWithType(0);
        var libSaveW = 42;
        currentX -= (gap + libSaveW);
        libSaveBtn.frame = { x: currentX, y: btnY, width: libSaveW, height: btnH };
        libSaveBtn.setTitleForState("存库", 0);
        styleButtonLocal(libSaveBtn, UIColor.colorWithRedGreenBlueAlpha(0.9, 1.0, 0.9, 1), UIColor.colorWithRedGreenBlueAlpha(0.1, 0.6, 0.1, 1), 6);
        libSaveBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        libSaveBtn.autoresizingMask = (1 << 0);
        libSaveBtn.addTargetActionForControlEvents(self, "onSaveToLibrary:", 1 << 6);
        pTitleBar.addSubview(libSaveBtn);

        // 9. Donate Button (打赏按钮)
        var donateBtn = UIButton.buttonWithType(0);
        var donateW = 42;
        currentX -= (gap + donateW);
        donateBtn.frame = { x: currentX, y: btnY, width: donateW, height: btnH };
        donateBtn.setTitleForState("打赏", 0);
        styleButtonLocal(donateBtn, UIColor.colorWithRedGreenBlueAlpha(1.0, 0.92, 0.92, 1), UIColor.colorWithRedGreenBlueAlpha(0.85, 0.2, 0.2, 1), 6);
        donateBtn.titleLabel.font = UIFont.systemFontOfSize(12);
        donateBtn.autoresizingMask = (1 << 0);
        donateBtn.addTargetActionForControlEvents(self, "onShowDonate:", 1 << 6);
        pTitleBar.addSubview(donateBtn);

        // 2. WebView
        var pWebView = new UIWebView({
            x: 0, y: 44, width: panelWidth, height: panelHeight - 44
        });
        pWebView.autoresizingMask = (1 << 1) | (1 << 4);
        pPanel.addSubview(pWebView);

        // 3. Resize Handle
        var pResizeHandle = new UIView({
            x: panelWidth - 40, y: panelHeight - 40, width: 40, height: 40
        });
        pResizeHandle.backgroundColor = UIColor.clearColor();
        pResizeHandle.autoresizingMask = (1 << 0) | (1 << 3);
        pResizeHandle.userInteractionEnabled = true;

        var resizeIcon = new UILabel({ x: 15, y: 15, width: 20, height: 20 });
        resizeIcon.text = "◢";
        resizeIcon.textColor = UIColor.lightGrayColor();
        resizeIcon.font = UIFont.systemFontOfSize(14);
        resizeIcon.userInteractionEnabled = false;
        pResizeHandle.addSubview(resizeIcon);

        var resizeGesture = new UIPanGestureRecognizer(self, "onResize:");
        pResizeHandle.addGestureRecognizer(resizeGesture);
        pPanel.addSubview(pResizeHandle);

        containerView.addSubview(pPanel);

        // Initialize panel state
        var pSavedRootNoteIds = [];
        if (self.rootNotes && self.rootNotes.length > 0) {
            pSavedRootNoteIds = self.rootNotes.map(function (n) { return n.noteId; });
        }

        var panelEntry = {
            panel: pPanel,
            webView: pWebView,
            titleLabel: pTitleLabel,
            modeBtn: pModeBtn,
            bcBtn: pBcBtn,
            linkBtn: pLinkBtn,
            syncWBtn: pSyncWBtn,
            minBtn: minBtn,
            closeBtn: closeBtn,
            exportBtn: exportBtn,
            refreshBtn: pRefreshBtn,
            libOpenBtn: libOpenBtn,
            libSaveBtn: libSaveBtn,
            resizeHandle: pResizeHandle,
            rootNotes: self.rootNotes || [],
            savedRootNoteIds: pSavedRootNoteIds,
            currentHtml: htmlStr,
            tableMode: self.tableMode || "merge",
            isSyncWidth: self.isSyncWidth !== false,
            savedWidthMap: self.savedWidthMap || {},
            savedNodeWidthMap: self.savedNodeWidthMap || {},
            savedImgHash: self.savedImgHash || {},
            savedImageMap: self.savedImageMap || {},
            isCompactMode: self.isCompactMode || false,
            showBreadcrumb: self.showBreadcrumb !== false,
            isLinked: self.isLinked !== false,
            isMinimized: false,
            savedFrame: null,
            minimizedFrame: null,
            lastFocusedNoteId: null
        };

        if (!self.panels) self.panels = [];
        self.panels.push(panelEntry);
        self.lastActivePe = panelEntry;

        // 加载内容
        var url = NSURL.URLWithString("about:blank");
        pWebView.loadHTMLStringBaseURL(htmlStr, url);
        startGlobalPollTimer();
        return panelEntry;
    }

    // ==========================================
    // MarginNote 桥接类定义
    // ==========================================

    function getLibraryData() {
        var ud = NSUserDefaults.standardUserDefaults();
        var json = ud.objectForKey("momo.mindmap2table.library");
        if (json) {
            try { return JSON.parse(json); } catch (e) { }
        }
        return { folders: [], rootItems: [] };
    }

    function saveLibraryData(data) {
        if (!data) return;
        var ud = NSUserDefaults.standardUserDefaults();
        ud.setObjectForKey(JSON.stringify(data), "momo.mindmap2table.library");
        // ud.synchronize(); // Deprecated on iOS 12+ but might be needed on macOS/MN3, safe to omit
    }

    function generateId() {
        return 'lib_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
    }

    function renderLibItem(item) {
        var d = new Date(item.createTime || new Date().getTime());
        var ds = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' ' + d.getHours() + ':' + d.getMinutes();
        var num = item.rootNoteIds ? item.rootNoteIds.length : 0;
        var h = '<li class="item" data-id="' + item.id + '">';
        h += '<div class="item-info">';
        h += '<div class="sel-circle" data-item-id="' + item.id + '" onclick="toggleSelection(\'' + item.id + '\', this)"></div>';
        h += '<div><div class="item-title" onclick="showModal(\'renameItem\', \'' + item.id + '\', \'' + escapeHtml(item.name) + '\', \'重命名脑图\', \'请输入新名称\')" title="点击重命名" style="cursor:pointer;">' + escapeHtml(item.name) + '</div>';
        h += '<div class="item-meta">' + ds + ' | ' + num + ' 个节点 | ' + (item.tableMode === "merge" ? "合并" : "标题") + '模式</div>';
        h += '</div></div>';
        h += '<div class="actions">';
        h += '<button onclick="callNative(\'moveItemUp\', \'' + item.id + '\')" title="上移" style="padding:2px 6px;">▲</button>';
        h += '<button onclick="callNative(\'moveItemDown\', \'' + item.id + '\')" title="下移" style="padding:2px 6px;">▼</button>';
        h += '<button onclick="showMoveModal(\'' + item.id + '\')">移动</button>';
        h += '<button class="btn-primary" onclick="callNative(\'openItem\', \'' + item.id + '\')">打开</button>';
        h += '<button class="btn-danger" onclick="callNative(\'deleteItem\', \'' + item.id + '\')">删除</button>';
        h += '</div></li>';
        return h;
    }

    function buildLibraryHtml(libraryData) {
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
        html += '<style>';
        html += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 15px; margin: 0; background: #fafafa; color: #333; }';
        html += '.folder { background: #fff; margin-bottom: 15px; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,0.05); overflow: hidden; }';
        html += '.folder-header { padding: 10px 15px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 15px; color: #1e293b; }';
        html += '.item-list { padding: 0; margin: 0; list-style: none; }';
        html += '.item { border-bottom: 1px solid #f1f5f9; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; }';
        html += '.item:last-child { border-bottom: none; }';
        html += '.item:hover { background: #f8fafc; }';
        html += '.item-info { flex: 1; display: flex; align-items: center; gap: 10px; }';
        html += '.item-title { font-size: 14px; font-weight: 500; color: #334155; margin-bottom: 2px; }';
        html += '.item-meta { font-size: 11px; color: #94a3b8; }';
        html += '.actions { display: flex; gap: 6px; }';
        html += 'button { background: none; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #475569; cursor: pointer; transition: all 0.2s; }';
        html += 'button:hover { background: #f1f5f9; color: #1e293b; border-color: #94a3b8; }';
        html += '.btn-primary { background: #e0f2fe; color: #0369a1; border-color: #bae6fd; font-weight: 500; }';
        html += '.btn-primary:hover { background: #bae6fd; }';
        html += '.btn-danger { color: #ef4444; border-color: #fee2e2; }';
        html += '.btn-danger:hover { background: #fee2e2; }';
        html += '.sel-circle { display: none; width: 24px; height: 24px; min-width: 24px; border-radius: 50%; border: 2px solid #cbd5e1; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; font-weight: 700; color: #fff; background: #fff; margin-right: 10px; transition: all 0.2s; user-select: none; -webkit-user-select: none; }';
        html += '.export-mode .sel-circle { display: flex; }';
        html += '.sel-circle.selected { background: #0284c7; border-color: #0284c7; }';
        html += '.folder-arrow { font-size: 12px; color: #64748b; transition: transform 0.2s; }';
        html += '.top-bar { display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center; }';
        html += '.global-actions { display: flex; gap: 8px; }';
        html += '.modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); justify-content: center; align-items: center; z-index: 1000; }';
        html += '.modal { background: #fff; padding: 20px; border-radius: 8px; width: 250px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }';
        html += '.modal h3 { margin-top: 0; font-size: 16px; margin-bottom: 10px; }';
        html += '.modal input { width: calc(100% - 16px); padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; margin-bottom: 15px; }';
        html += '.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }';
        html += '</style></head><body>';
        html += '<div id="library-container">';

        // Folders
        if (libraryData.folders && libraryData.folders.length > 0) {
            libraryData.folders.forEach(function (f) {
                html += '<div class="folder" data-id="' + f.id + '">';
                html += '<div class="folder-header" onclick="toggleFolder(this)" style="cursor:pointer;">';
                html += '<span style="display:flex; align-items:center; gap:6px;"><span class="folder-arrow">▼</span><span onclick="event.stopPropagation(); showModal(\'renameFolder\', \'' + f.id + '\', \'' + escapeHtml(f.name) + '\', \'重命名文件夹\', \'请输入新的名称\')" title="点击重命名">' + escapeHtml(f.name) + '</span></span>';
                html += '<div class="actions" onclick="event.stopPropagation();">';
                html += '<button class="btn-danger" onclick="callNative(\'deleteFolder\', \'' + f.id + '\')">删除</button>';
                html += '</div></div>';
                html += '<ul class="item-list">';
                if (f.items && f.items.length > 0) {
                    f.items.forEach(function (item) {
                        html += renderLibItem(item);
                    });
                } else {
                    html += '<li class="item" style="color:#94a3b8; font-size:12px; justify-content:center;">暂无内容</li>';
                }
                html += '</ul></div>';
            });
        }

        // Root Items
        if (libraryData.rootItems && libraryData.rootItems.length > 0) {
            html += '<div class="folder">';
            html += '<div class="folder-header" onclick="toggleFolder(this)" style="cursor:pointer;">';
            html += '<span style="display:flex; align-items:center; gap:6px;"><span class="folder-arrow">▼</span>未分类脑图</span></div>';
            html += '<ul class="item-list" style="border-top:1px solid #e5e7eb;">';
            libraryData.rootItems.forEach(function (item) {
                html += renderLibItem(item);
            });
            html += '</ul></div>';
        }

        if ((!libraryData.folders || libraryData.folders.length === 0) && (!libraryData.rootItems || libraryData.rootItems.length === 0)) {
            html += '<div style="text-align:center; padding: 40px; color:#94a3b8;">库还是空的，请在主界面点击「存入库」添加内容。</div>';
        }

        html += '</div>';

        html += '<div id="inputModal" class="modal-overlay">';
        html += '<div class="modal">';
        html += '<h3 id="modalTitle">标题</h3>';
        html += '<input type="text" id="modalInput" placeholder="请输入...">';
        html += '<div class="modal-actions">';
        html += '<button onclick="closeModal()">取消</button>';
        html += '<button class="btn-primary" onclick="confirmModal()">确定</button>';
        html += '</div></div></div>';

        // Move modal
        html += '<div id="moveModal" class="modal-overlay">';
        html += '<div class="modal">';
        html += '<h3>移动到文件夹</h3>';
        html += '<select id="moveTarget" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; margin-bottom:15px;">';
        html += '<option value="__root__">未分类</option>';
        // Inject folder options
        if (libraryData.folders && libraryData.folders.length > 0) {
            libraryData.folders.forEach(function (f) {
                html += '<option value="' + f.id + '">' + escapeHtml(f.name) + '</option>';
            });
        }
        html += '</select>';
        html += '<div class="modal-actions">';
        html += '<button onclick="closeMoveModal()">取消</button>';
        html += '<button class="btn-primary" onclick="confirmMove()">确定</button>';
        html += '</div></div></div>';

        html += '<script>';
        html += 'window.libraryAction = null;';
        html += 'var currentModalAction = null; var currentModalId = null;';
        html += 'var moveItemId = null;';
        html += 'function callNative(action, id, val) {';
        html += '  window.libraryAction = action + "::" + (id ? id : "") + (val ? "::" + encodeURIComponent(val) : "");';
        html += '}';
        html += 'function showModal(action, id, defaultVal, title, placeholder) {';
        html += '  currentModalAction = action; currentModalId = id;';
        html += '  document.getElementById("modalTitle").innerText = title;';
        html += '  var input = document.getElementById("modalInput");';
        html += '  input.placeholder = placeholder; input.value = defaultVal;';
        html += '  document.getElementById("inputModal").style.display = "flex";';
        html += '  input.focus();';
        html += '}';
        html += 'function closeModal() { document.getElementById("inputModal").style.display = "none"; }';
        html += 'function confirmModal() {';
        html += '  var val = document.getElementById("modalInput").value;';
        html += '  if(val) callNative(currentModalAction, currentModalId, val);';
        html += '  closeModal();';
        html += '}';
        html += 'function showMoveModal(itemId) {';
        html += '  moveItemId = itemId;';
        html += '  document.getElementById("moveModal").style.display = "flex";';
        html += '}';
        html += 'function closeMoveModal() { document.getElementById("moveModal").style.display = "none"; }';
        html += 'function toggleFolder(header) {';
        html += '  var list = header.nextElementSibling;';
        html += '  var arrow = header.querySelector(".folder-arrow");';
        html += '  if(list && list.classList.contains("item-list")) {';
        html += '    if(list.style.display === "none") { list.style.display = ""; if(arrow) arrow.textContent = "▼"; }';
        html += '    else { list.style.display = "none"; if(arrow) arrow.textContent = "▶"; }';
        html += '  }';
        html += '}';
        html += 'function confirmMove() {';
        html += '  var target = document.getElementById("moveTarget").value;';
        html += '  if(moveItemId) callNative("moveItem", moveItemId, target);';
        html += '  closeMoveModal();';
        html += '}';
        html += 'var selectionOrder = [];';
        html += 'function toggleSelection(itemId, el) {';
        html += '  var idx = selectionOrder.indexOf(itemId);';
        html += '  if(idx > -1) { selectionOrder.splice(idx, 1); el.classList.remove("selected"); el.textContent = ""; }';
        html += '  else { selectionOrder.push(itemId); el.classList.add("selected"); }';
        html += '  refreshSelectionNumbers();';
        html += '}';
        html += 'function refreshSelectionNumbers() {';
        html += '  var circles = document.querySelectorAll(".sel-circle");';
        html += '  for(var i=0; i<circles.length; i++) {';
        html += '    var cid = circles[i].getAttribute("data-item-id");';
        html += '    var pos = selectionOrder.indexOf(cid);';
        html += '    if(pos > -1) { circles[i].textContent = (pos+1); circles[i].classList.add("selected"); }';
        html += '    else { circles[i].textContent = ""; circles[i].classList.remove("selected"); }';
        html += '  }';
        html += '}';
        html += 'var isExportMode = false;';
        html += 'function batchExport() {';
        html += '  if(!isExportMode) {';
        html += '    isExportMode = true;';
        html += '    document.getElementById("library-container").classList.add("export-mode");';
        html += '    callNative("setExportButton", "active");';
        html += '  } else {';
        html += '    if(selectionOrder.length === 0) {';
        html += '      isExportMode = false;';
        html += '      document.getElementById("library-container").classList.remove("export-mode");';
        html += '      callNative("setExportButton", "inactive");';
        html += '      return;';
        html += '    }';
        html += '    window.libraryAction = "batchExport::" + selectionOrder.join(",");';
        html += '    isExportMode = false;';
        html += '    selectionOrder = [];';
        html += '    refreshSelectionNumbers();';
        html += '    document.getElementById("library-container").classList.remove("export-mode");';
        html += '  }';
        html += '}';
        html += '</script>';
        html += '</body></html>';
        return html;
    }

    function processLibraryAction(actionStr, addon) {
        if (!actionStr || typeof actionStr !== 'string') return false;
        var parts = actionStr.split("::");
        var act = parts[0];
        var id = parts.length > 1 ? parts[1] : null;
        var val = parts.length > 2 ? decodeURIComponent(parts[2]) : null;
        var d = getLibraryData();
        var app = Application.sharedInstance();

        if (act === "newFolder") {
            if (val) {
                d.folders = d.folders || [];
                d.folders.push({ id: generateId(), name: val, items: [] });
                saveLibraryData(d);
                if (addon.libWebView) addon.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(d), null);
            }
        }
        else if (act === "deleteFolder") {
            if (d.folders) {
                var newFolders = [];
                for (var i = 0; i < d.folders.length; i++) { if (d.folders[i].id !== id) newFolders.push(d.folders[i]); }
                d.folders = newFolders;
                saveLibraryData(d);
                if (addon.libWebView) addon.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(d), null);
            }
        }
        else if (act === "renameFolder") {
            var f = null;
            if (d.folders) {
                for (var i = 0; i < d.folders.length; i++) { if (d.folders[i].id === id) f = d.folders[i]; }
            }
            if (f && val) {
                f.name = val;
                saveLibraryData(d);
                if (addon.libWebView) addon.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(d), null);
            }
        }
        else if (act === "deleteItem") {
            if (d.rootItems) {
                var newRoot = [];
                for (var i = 0; i < d.rootItems.length; i++) { if (d.rootItems[i].id !== id) newRoot.push(d.rootItems[i]); }
                d.rootItems = newRoot;
            }
            if (d.folders) {
                for (var i = 0; i < d.folders.length; i++) {
                    var folder = d.folders[i];
                    if (folder.items) {
                        var newItems = [];
                        for (var j = 0; j < folder.items.length; j++) { if (folder.items[j].id !== id) newItems.push(folder.items[j]); }
                        folder.items = newItems;
                    }
                }
            }
            saveLibraryData(d);
            if (addon.libWebView) addon.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(d), null);
        }
        else if (act === "renameItem") {
            var item = null;
            if (d.rootItems) for (var i = 0; i < d.rootItems.length; i++) { if (d.rootItems[i].id === id) item = d.rootItems[i]; }
            if (!item && d.folders) {
                for (var i = 0; i < d.folders.length; i++) {
                    var folder = d.folders[i];
                    if (folder.items) for (var j = 0; j < folder.items.length; j++) { if (folder.items[j].id === id) item = folder.items[j]; }
                }
            }
            if (item && val) {
                item.name = val;
                saveLibraryData(d);
                if (addon.libWebView) addon.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(d), null);
            }
        }
        else if (act === "openItem") {
            var item = null;
            if (d.rootItems) for (var i = 0; i < d.rootItems.length; i++) { if (d.rootItems[i].id === id) item = d.rootItems[i]; }
            if (!item && d.folders) {
                for (var i = 0; i < d.folders.length; i++) {
                    var folder = d.folders[i];
                    if (folder.items) for (var j = 0; j < folder.items.length; j++) { if (folder.items[j].id === id) item = folder.items[j]; }
                }
            }
            if (item) {
                app.showHUD("正在恢复布局...", addon.window, 1);
                addon.savedRootNoteIds = item.rootNoteIds;
                addon.tableMode = item.tableMode;
                addon.isSyncWidth = typeof item.isSyncWidth !== 'undefined' ? item.isSyncWidth : true;
                addon.savedWidthMap = item.savedWidthMap || {};
                addon.savedNodeWidthMap = item.savedNodeWidthMap || {};
                addon.savedImageMap = item.savedImageMap || {};
                addon.savedImgHash = item.savedImgHash || {};

                // Ensure rootNotes is populated for showPanel if needed
                if (addon.savedRootNoteIds) {
                    var ns = [];
                    for (var k = 0; k < addon.savedRootNoteIds.length; k++) {
                        var n = Database.sharedInstance().getNoteById(addon.savedRootNoteIds[k]);
                        if (n) ns.push(n);
                    }
                    addon.rootNotes = ns;
                }

                if (addon.titleLabel && item.name) addon.titleLabel.text = item.name + " (已应用)";
                if (addon.modeBtn) addon.modeBtn.setTitleForState(addon.tableMode === "titlecontent" ? "标题" : "合并", 0);
                if (addon.syncWBtn) {
                    addon.syncWBtn.setTitleForState(addon.isSyncWidth ? "宽:同" : "宽:独", 0);
                    var styleButton = function (btn, bgColor, textColor, radius) {
                        btn.backgroundColor = bgColor;
                        btn.setTitleColorForState(textColor, 0);
                        btn.layer.cornerRadius = radius || 6;
                        btn.layer.borderWidth = 0.5;
                        btn.layer.borderColor = UIColor.colorWithWhiteAlpha(0, 0.1);
                    };
                    if (addon.isSyncWidth) {
                        styleButton(addon.syncWBtn, UIColor.colorWithRedGreenBlueAlpha(0.9, 0.95, 1.0, 1), UIColor.colorWithRedGreenBlueAlpha(0.2, 0.4, 0.8, 1), 6);
                    } else {
                        styleButton(addon.syncWBtn, UIColor.colorWithRedGreenBlueAlpha(1.0, 0.9, 0.9, 1), UIColor.colorWithRedGreenBlueAlpha(0.8, 0.2, 0.2, 1), 6);
                    }
                }

                if (addon.panel && addon.panel.hidden) {
                    addon.panel.hidden = false;
                    var studyController = app.studyController(addon.window);
                    var containerView = studyController ? studyController.view : addon.window;
                    containerView.bringSubviewToFront(addon.panel);
                }

                // V3.2.3: Return object to indicate forceNew window creation
                return { type: "open", forceNew: true };
            }
        }
        else if (act === "moveItem") {
            // val = target folder ID or "__root__"
            // Step 1: find and remove the item from wherever it is
            var movingItem = null;
            if (d.rootItems) {
                for (var i = 0; i < d.rootItems.length; i++) {
                    if (d.rootItems[i].id === id) { movingItem = d.rootItems.splice(i, 1)[0]; break; }
                }
            }
            if (!movingItem && d.folders) {
                for (var i = 0; i < d.folders.length; i++) {
                    var folder = d.folders[i];
                    if (folder.items) {
                        for (var j = 0; j < folder.items.length; j++) {
                            if (folder.items[j].id === id) { movingItem = folder.items.splice(j, 1)[0]; break; }
                        }
                    }
                    if (movingItem) break;
                }
            }
            if (movingItem) {
                // Step 2: insert into target
                if (val === "__root__") {
                    d.rootItems = d.rootItems || [];
                    d.rootItems.unshift(movingItem);
                } else {
                    var targetFolder = null;
                    if (d.folders) {
                        for (var i = 0; i < d.folders.length; i++) { if (d.folders[i].id === val) targetFolder = d.folders[i]; }
                    }
                    if (targetFolder) {
                        targetFolder.items = targetFolder.items || [];
                        targetFolder.items.unshift(movingItem);
                    } else {
                        // Fallback: put back to root
                        d.rootItems = d.rootItems || [];
                        d.rootItems.unshift(movingItem);
                    }
                }
                saveLibraryData(d);
                if (addon.libWebView) addon.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(d), null);
                app.showHUD("已移动", addon.window, 1);
            }
        }
        else if (act === "moveItemUp" || act === "moveItemDown") {
            var direction = (act === "moveItemUp") ? -1 : 1;
            // Find item in rootItems or folder.items and swap with neighbor
            var swapped = false;
            function swapInList(list) {
                if (!list) return false;
                for (var i = 0; i < list.length; i++) {
                    if (list[i].id === id) {
                        var target = i + direction;
                        if (target >= 0 && target < list.length) {
                            var tmp = list[i];
                            list[i] = list[target];
                            list[target] = tmp;
                            return true;
                        }
                        return false;
                    }
                }
                return false;
            }
            swapped = swapInList(d.rootItems);
            if (!swapped && d.folders) {
                for (var i = 0; i < d.folders.length; i++) {
                    swapped = swapInList(d.folders[i].items);
                    if (swapped) break;
                }
            }
            if (swapped) {
                saveLibraryData(d);
                if (addon.libWebView) addon.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(d), null);
            }
        }
        else if (act === "setExportButton") {
            if (addon.libBatchExportBtn) {
                var isAct = (id === "active");
                addon.libBatchExportBtn.setTitleForState(isAct ? "确认" : "批量导出", 0);
                var bg = isAct ? UIColor.colorWithRedGreenBlueAlpha(254 / 255, 242 / 255, 242 / 255, 1) : UIColor.colorWithRedGreenBlueAlpha(0.88, 0.95, 1.0, 1);
                var tc = isAct ? UIColor.colorWithRedGreenBlueAlpha(220 / 255, 38 / 255, 38 / 255, 1) : UIColor.colorWithRedGreenBlueAlpha(0.01, 0.41, 0.64, 1);
                addon.libBatchExportBtn.backgroundColor = bg;
                addon.libBatchExportBtn.setTitleColorForState(tc, 0);
                if (isAct) {
                    Application.sharedInstance().showHUD("请左侧勾选内容，再次点击确认导出", addon.window, 2);
                }
            }
        }
        else if (act === "batchExport") {
            if (addon.libBatchExportBtn) {
                addon.libBatchExportBtn.setTitleForState("批量导出", 0);
                addon.libBatchExportBtn.backgroundColor = UIColor.colorWithRedGreenBlueAlpha(0.88, 0.95, 1.0, 1);
                addon.libBatchExportBtn.setTitleColorForState(UIColor.colorWithRedGreenBlueAlpha(0.01, 0.41, 0.64, 1), 0);
            }

            // Sync breadcrumb state from last active panel if possible
            if (addon.lastActivePe && typeof addon.lastActivePe.showBreadcrumb !== 'undefined') {
                addon.showBreadcrumb = addon.lastActivePe.showBreadcrumb;
            }
            var itemIds = id ? id.split(",") : [];
            if (itemIds.length === 0) {
                app.showHUD("请先勾选要导出的项目", addon.window, 2);
                return false;
            }

            // Collect all items
            var allItems = (d.rootItems || []).slice();
            if (d.folders) {
                for (var i = 0; i < d.folders.length; i++) {
                    if (d.folders[i].items) allItems = allItems.concat(d.folders[i].items);
                }
            }

            // Build merged HTML
            var mergedBody = "";
            var exportCount = 0;
            for (var i = 0; i < itemIds.length; i++) {
                var targetItem = null;
                for (var j = 0; j < allItems.length; j++) {
                    if (allItems[j].id === itemIds[i]) { targetItem = allItems[j]; break; }
                }
                if (!targetItem || !targetItem.rootNoteIds) continue;

                // Rebuild notes from DB
                var notes = [];
                for (var k = 0; k < targetItem.rootNoteIds.length; k++) {
                    var n = Database.sharedInstance().getNoteById(targetItem.rootNoteIds[k]);
                    if (n) notes.push(n);
                }
                if (notes.length === 0) continue;

                // Temporarily apply saved sizes for this item
                var origWidthMap = addon.savedWidthMap;
                var origImgHash = addon.savedImgHash;
                addon.savedWidthMap = targetItem.savedWidthMap || {};
                addon.savedImgHash = targetItem.savedImgHash || {};

                var itemHtml = (targetItem.tableMode === "titlecontent") ? buildTitleContentTable(notes, true) : buildHtmlTable(notes, true);

                // Restore original
                addon.savedWidthMap = origWidthMap;
                addon.savedImgHash = origImgHash;

                // Extract body content only
                var bodyMatch = itemHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                var bodyContent = bodyMatch ? bodyMatch[1] : itemHtml;

                mergedBody += '<div style="margin-bottom:30px; page-break-after:always;">';
                mergedBody += '<h2 style="font-family:-apple-system,sans-serif; color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">' + escapeHtml(targetItem.name || "未命名") + '</h2>';
                mergedBody += bodyContent;
                mergedBody += '</div>';
                exportCount++;
            }

            if (exportCount === 0) {
                app.showHUD("未找到可导出的内容", addon.window, 2);
                return false;
            }

            // Extract styles from a sample HTML build
            var sampleHtml = buildTitleContentTable([], true);
            var styleMatch = sampleHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
            var styles = styleMatch ? styleMatch[0] : "";

            var bcClass = (addon.showBreadcrumb === false) ? ' class="hide-breadcrumb"' : '';
            var finalHtml = "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" + styles + "</head><body" + bcClass + " style=\"padding:20px;\">" + mergedBody + "</body></html>";

            // Clean export HTML
            finalHtml = finalHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            finalHtml = finalHtml.replace(/<div class="resizer"><\/div>/g, '');
            finalHtml = finalHtml.replace(/<div class="img-resizer"><\/div>/g, '');
            finalHtml = finalHtml.replace(/<button class="fold-btn"[^>]*>[^<]*<\/button>/g, '');
            finalHtml = finalHtml.replace(/<button class="row-fold-btn"[^>]*>[^<]*<\/button>/g, '');
            if (addon.showBreadcrumb === false) {
                finalHtml = finalHtml.replace(/<div class="print-breadcrumb"[^>]*>[\s\S]*?<\/div>/g, '');
            }

            var dateObj = new Date();
            var ds = dateObj.getFullYear() + "-" + ("0" + (dateObj.getMonth() + 1)).slice(-2) + "-" + ("0" + dateObj.getDate()).slice(-2) + "_" + ("0" + dateObj.getHours()).slice(-2) + "-" + ("0" + dateObj.getMinutes()).slice(-2);
            var fileName = ds + "-批量导出_" + exportCount + "项.html";
            var path = app.tempPath + "/" + fileName;
            var fileData = NSData.dataWithStringEncoding(finalHtml, 4);
            if (fileData) {
                fileData.writeToFileAtomically(path, false);
                app.saveFileWithUti(path, "public.html");
                app.showHUD("已导出 " + exportCount + " 个图表", addon.window, 2);
            }
        }
        return false;
    }

    var Mindmap2Table = JSB.defineClass(
        "Mindmap2Table : JSExtension",
        {
            sceneWillConnect: function () {
                self.tableMode = self.tableMode || "titlecontent";
                self.isCompactMode = true; // V2.5.0: Always Compact
                if (typeof self.showBreadcrumb === 'undefined') self.showBreadcrumb = false;
                if (typeof self.isLinked === 'undefined') self.isLinked = true;
                self.savedWidthMap = self.savedWidthMap || {};
                self.savedNodeWidthMap = self.savedNodeWidthMap || {};
                if (typeof self.isSyncWidth === 'undefined') self.isSyncWidth = true;
                self.savedImageMap = self.savedImageMap || {};
                self.savedImgHash = self.savedImgHash || {};
                self.savedRootNoteIds = self.savedRootNoteIds || [];
                self.panel = null;
                self.webView = null;
                self.panels = [];  // V3: Multi-window panel tracking
                if (self.pollTimer) {
                    self.pollTimer.invalidate();
                    self.pollTimer = null;
                }
                self.lastFocusedNoteId = null;
            },
            sceneDidDisconnect: function () {
                // V3: Clean up ALL panels
                if (self.panels) {
                    for (var i = 0; i < self.panels.length; i++) {
                        self.panels[i].panel.removeFromSuperview();
                    }
                    self.panels = [];
                }
                if (self.panel) {
                    self.panel.removeFromSuperview();
                    self.panel = null;
                    self.webView = null;
                }
                if (self.pollTimer) {
                    self.pollTimer.invalidate();
                    self.pollTimer = null;
                }
            },
            sceneWillResignActive: function () { },
            sceneDidBecomeActive: function () { },
            notebookWillOpen: function (topicid) { },
            notebookWillClose: function (topicid) { },
            documentDidOpen: function (docmd5) { },
            documentWillClose: function (docmd5) { },


            queryAddonCommandStatus: function () {
                var app = Application.sharedInstance();
                var studyController = app.studyController(self.window);
                if (studyController && studyController.notebookController && studyController.notebookController.notebookId) {
                    return {
                        image: "icon.png",
                        object: self,
                        selector: "exportTable:",
                        checked: false
                    };
                }
                return null;
            },

            handleAddonCommand: function (command) {
                if (command === "exportTable:") {
                    self["exportTable:"](null);
                }
            },

            "onNoteFocusChanged:": function (notify) {
                var userInfo = notify ? notify.userInfo : null;
                var noteId = userInfo ? (userInfo.noteid || userInfo.noteId || userInfo.noteID) : null;
                if (noteId && self.panels) {
                    for (var i = 0; i < self.panels.length; i++) {
                        var pe = self.panels[i];
                        if (pe.webView && !pe.panel.hidden && pe.isLinked !== false) {
                            scrollPanelToNote(pe, String(noteId));
                        }
                    }
                }
            },

            "exportTable:": function (sender) {
                if (self.exportTable) {
                    self.exportTable(sender);
                }
            },

            exportTable: function (sender) {
                var app = Application.sharedInstance();
                try {
                    app.showHUD("正在导出表...", self.window, 1);
                    var studyController = app.studyController(self.window);
                    if (!studyController) {
                        app.showHUD("请在学习模式下使用", self.window, 2);
                        return;
                    }
                    var topicid = studyController.notebookController.notebookId;
                    if (!topicid) return;

                    var notebook = Database.sharedInstance().getNotebookById(topicid);
                    var html = "";
                    var selViewLst = studyController.notebookController.mindmapView.selViewLst;
                    var targetNotes = [];
                    if (selViewLst && selViewLst.length > 0) {
                        for (var i = 0; i < selViewLst.length; i++) {
                            var selectedNote = getNoteFromMindMapSelection(selViewLst[i]);
                            if (selectedNote) targetNotes.push(selectedNote);
                        }
                    }
                    if (targetNotes.length === 0) {
                        var focusNote = getMindMapFocusNote(studyController);
                        if (focusNote) targetNotes.push(focusNote);
                    }

                    if (targetNotes.length > 0) {
                        self.rootNotes = targetNotes;
                        self.savedRootNoteIds = targetNotes.map(function (n) { return n.noteId; });
                        html = (self.tableMode === "titlecontent") ? buildTitleContentTable(targetNotes, self.isCompactMode) : buildHtmlTable(targetNotes, self.isCompactMode);
                    } else if (notebook.notes && notebook.notes.length > 0) {
                        self.rootNotes = notebook.notes;
                        self.savedRootNoteIds = notebook.notes.map(function (n) { return n.noteId; });
                        html = (self.tableMode === "titlecontent") ? buildTitleContentTable(notebook.notes, self.isCompactMode) : buildHtmlTable(notebook.notes, self.isCompactMode);
                    } else {
                        app.showHUD("没有笔记", self.window, 2);
                        return;
                    }

                    // V3: Multi-window — if current panel exists and is visible, detach it
                    // so showPanel creates a brand new panel (the old one stays on screen)
                    if (self.panel && !self.panel.hidden) {
                        self.panel = null;
                        self.webView = null;
                        self.titleBar = null;
                        self.titleLabel = null;
                        self.modeBtn = null;
                        self.bcBtn = null;
                        self.linkBtn = null;
                        self.maxBtn = null;
                        self.resizeHandle = null;
                    }

                    var pe = showPanel(self, html);
                    // 更新标题为一级标题
                    if (pe.titleLabel && self.rootNotes && self.rootNotes.length > 0) {
                        var t = getExplicitNoteTitle(self.rootNotes[0]) || "脑图表格";
                        if (self.rootNotes.length > 1) t += " 等 " + self.rootNotes.length + " 项";
                        pe.titleLabel.text = t;
                    }
                } catch (e) {
                    app.showHUD("Error: " + e, self.window, 5);
                }
            },

            "onSaveToLibrary": function (sender) {
                var app = Application.sharedInstance();
                var pe = findPanelEntryFromView(sender);
                if (!pe || !pe.webView) return;

                app.showHUD("正在捕获图表布局并存入库...", self.window, 1);

                pe.webView.evaluateJavaScript(
                    "var sizes = { td: {}, nodeTd: {}, img: {} }; " +
                    "var tds = document.querySelectorAll('td[data-depth]'); " +
                    "for(var i=0; i<tds.length; i++){ " +
                    "  if(tds[i].style.width) { " +
                    "    sizes.td[tds[i].getAttribute('data-depth')] = tds[i].style.width; " +
                    "    var nid = tds[i].getAttribute('data-nodeid'); " +
                    "    if(nid) sizes.nodeTd[nid] = { w: tds[i].style.width, depth: tds[i].getAttribute('data-depth') }; " +
                    "  } " +
                    "} " +
                    "var imgs = document.querySelectorAll('.resize-img-container img'); " +
                    "for(var j=0; j<imgs.length; j++){ if(imgs[j].style.width) { " +
                    "  var paint = imgs[j].getAttribute('data-paint') || ''; " +
                    "  if(paint) sizes.img[paint] = { w: imgs[j].style.width }; " +
                    "} } " +
                    "JSON.stringify(sizes);",
                    function (sizeJsonStr, error) {
                        var sizeState = { td: {}, nodeTd: {}, img: {} };
                        if (sizeJsonStr) {
                            try { sizeState = JSON.parse(sizeJsonStr); } catch (e) { }
                        }

                        if (sizeState.td) pe.savedWidthMap = sizeState.td;
                        if (sizeState.nodeTd) pe.savedNodeWidthMap = sizeState.nodeTd;
                        if (sizeState.img) {
                            for (var h in sizeState.img) {
                                pe.savedImgHash[h] = sizeState.img[h];
                            }
                        }

                        if (!pe.savedRootNoteIds || pe.savedRootNoteIds.length === 0) {
                            app.showHUD("当前没有笔记可保存", self.window, 2);
                            return;
                        }

                        var title = "未命名图表";
                        if (pe.rootNotes && pe.rootNotes.length > 0) {
                            title = getExplicitNoteTitle(pe.rootNotes[0]) || title;
                        }

                        var libData = getLibraryData();
                        var newItem = {
                            id: generateId(),
                            name: title,
                            rootNoteIds: pe.savedRootNoteIds,
                            tableMode: pe.tableMode,
                            isSyncWidth: self.isSyncWidth,
                            savedWidthMap: pe.savedWidthMap || {},
                            savedNodeWidthMap: pe.savedNodeWidthMap || {},
                            savedImageMap: pe.savedImageMap || {},
                            savedImgHash: pe.savedImgHash || {},
                            createTime: new Date().getTime()
                        };

                        // Auto-save into notebook-named folder
                        var notebookName = "";
                        try {
                            var sc = app.studyController(self.window);
                            var nbId = sc.notebookController.notebookId;
                            if (nbId) {
                                var nb = Database.sharedInstance().getNotebookById(nbId);
                                if (nb && nb.title) notebookName = nb.title;
                            }
                        } catch (e) { }

                        if (notebookName) {
                            // Find or create folder
                            libData.folders = libData.folders || [];
                            var targetFolder = null;
                            for (var fi = 0; fi < libData.folders.length; fi++) {
                                if (libData.folders[fi].name === notebookName) { targetFolder = libData.folders[fi]; break; }
                            }
                            if (!targetFolder) {
                                targetFolder = { id: generateId(), name: notebookName, items: [] };
                                libData.folders.unshift(targetFolder);
                            }
                            targetFolder.items = targetFolder.items || [];
                            targetFolder.items.unshift(newItem);
                        } else {
                            libData.rootItems.unshift(newItem);
                        }
                        saveLibraryData(libData);
                        app.showHUD("✅ 已保存到「" + (notebookName || "未分类") + "」", self.window, 2);

                        // If library is open, refresh it
                        if (self.libWebView) {
                            self.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(libData), null);
                        }
                    }
                );
            },

            "onOpenLibrary": function (sender) {
                var app = Application.sharedInstance();
                if (self.libPanel) {
                    self.libPanel.removeFromSuperview();
                    self.libPanel = null;
                    self.libWebView = null;
                    return;
                }

                var containerView = app.studyController(self.window)?.view || self.window;
                var frame = containerView.bounds;
                var fw = frame.width || 1024;
                var fh = frame.height || 768;

                var panelW = 400;
                var panelH = 500;

                self.libPanel = new UIView({
                    x: (fw - panelW) / 2, y: (fh - panelH) / 2, width: panelW, height: panelH
                });
                self.libPanel.layer.cornerRadius = 10;
                self.libPanel.layer.masksToBounds = true;
                self.libPanel.backgroundColor = UIColor.whiteColor();
                self.libPanel.layer.shadowColor = UIColor.blackColor().CGColor;
                self.libPanel.layer.shadowOffset = { width: 0, height: 4 };
                self.libPanel.layer.shadowOpacity = 0.3;
                self.libPanel.layer.shadowRadius = 8;
                self.libPanel.autoresizingMask = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);

                // titlebar with flexible width
                var titleBar = new UIView({ x: 0, y: 0, width: panelW, height: 44 });
                titleBar.backgroundColor = UIColor.colorWithWhiteAlpha(0.95, 1);
                titleBar.autoresizingMask = (1 << 1); // flexible width
                var panGesture = new UIPanGestureRecognizer(self, "onDragLib:");
                titleBar.addGestureRecognizer(panGesture);
                self.libPanel.addSubview(titleBar);

                // Close button - flexible left margin so it stays at right edge
                var closeBtn = UIButton.buttonWithType(0);
                closeBtn.frame = { x: panelW - 44, y: 0, width: 44, height: 44 };
                closeBtn.setTitleForState("✕", 0);
                closeBtn.setTitleColorForState(UIColor.darkGrayColor(), 0);
                closeBtn.autoresizingMask = (1 << 0); // flexible left
                closeBtn.addTargetActionForControlEvents(self, "onCloseLib:", 1 << 6);
                titleBar.addSubview(closeBtn);

                // Title label
                var titleLabel = new UILabel({ x: 15, y: 0, width: 100, height: 44 });
                titleLabel.text = "我的图表库";
                titleLabel.font = UIFont.boldSystemFontOfSize(14);
                titleLabel.textColor = UIColor.darkGrayColor();
                titleBar.addSubview(titleLabel);

                // Style helper for title bar buttons
                var styleTbBtn = function (btn, bgColor, textColor) {
                    btn.backgroundColor = bgColor;
                    btn.setTitleColorForState(textColor, 0);
                    btn.layer.cornerRadius = 6;
                    btn.layer.borderWidth = 0.5;
                    btn.layer.borderColor = UIColor.colorWithWhiteAlpha(0, 0.1);
                    btn.titleLabel.font = UIFont.systemFontOfSize(12);
                    btn.autoresizingMask = (1 << 0); // flexible left
                };

                // Batch Export button (rightmost, before close)
                var batchExportBtn = UIButton.buttonWithType(0);
                batchExportBtn.frame = { x: panelW - 44 - 8 - 65, y: 8, width: 65, height: 28 };
                batchExportBtn.setTitleForState("批量导出", 0);
                styleTbBtn(batchExportBtn, UIColor.colorWithRedGreenBlueAlpha(0.88, 0.95, 1.0, 1), UIColor.colorWithRedGreenBlueAlpha(0.01, 0.41, 0.64, 1));
                batchExportBtn.addTargetActionForControlEvents(self, "onLibBatchExport:", 1 << 6);
                titleBar.addSubview(batchExportBtn);
                self.libBatchExportBtn = batchExportBtn;

                // New Folder button
                var newFolderBtn = UIButton.buttonWithType(0);
                newFolderBtn.frame = { x: panelW - 44 - 8 - 65 - 8 - 70, y: 8, width: 70, height: 28 };
                newFolderBtn.setTitleForState("新建文件夹", 0);
                styleTbBtn(newFolderBtn, UIColor.colorWithWhiteAlpha(0.93, 1), UIColor.colorWithRedGreenBlueAlpha(0.3, 0.3, 0.3, 1));
                newFolderBtn.addTargetActionForControlEvents(self, "onLibNewFolder:", 1 << 6);
                titleBar.addSubview(newFolderBtn);

                // Bottom border for title bar
                var tbBorder = new UIView({ x: 0, y: 43, width: panelW, height: 1 });
                tbBorder.backgroundColor = UIColor.colorWithWhiteAlpha(0, 0.1);
                tbBorder.autoresizingMask = (1 << 1); // flexible width
                titleBar.addSubview(tbBorder);

                self.libWebView = new UIWebView({ x: 0, y: 44, width: panelW, height: panelH - 44 });
                self.libWebView.autoresizingMask = (1 << 1) | (1 << 4);
                self.libPanel.addSubview(self.libWebView);

                var libData = getLibraryData();
                self.libWebView.loadHTMLStringBaseURL(buildLibraryHtml(libData), null);

                // Add to container and ensure it's above the table panel
                containerView.addSubview(self.libPanel);
                containerView.bringSubviewToFront(self.libPanel);

                // Add pinch/resize handle
                var resizeBtn = new UIView({
                    x: panelW - 30, y: panelH - 30, width: 30, height: 30
                });
                resizeBtn.backgroundColor = UIColor.clearColor();
                resizeBtn.autoresizingMask = (1 << 0) | (1 << 3); // flexible left & top
                var resizeGesture = new UIPanGestureRecognizer(self, "onResizeLib:");
                resizeBtn.addGestureRecognizer(resizeGesture);
                self.libPanel.addSubview(resizeBtn);
            },

            "onCloseLib": function (sender) {
                if (self.libPanel) {
                    self.libPanel.removeFromSuperview();
                    self.libPanel = null;
                    self.libWebView = null;
                }
            },

            "onDragLib": function (sender) {
                var translation = sender.translationInView(sender.view.superview);
                var center = sender.view.superview.center;
                sender.view.superview.center = { x: center.x + translation.x, y: center.y + translation.y };
                sender.setTranslationInView({ x: 0, y: 0 }, sender.view.superview);
                // Keep library panel above table panel
                if (self.libPanel && self.libPanel.superview) {
                    self.libPanel.superview.bringSubviewToFront(self.libPanel);
                }
            },

            "onResizeLib": function (sender) {
                var translation = sender.translationInView(sender.view.superview);
                var f = self.libPanel.frame;
                var newW = f.width + translation.x;
                var newH = f.height + translation.y;
                if (newW < 250) newW = 250;
                if (newH < 300) newH = 300;
                self.libPanel.frame = { x: f.x, y: f.y, width: newW, height: newH };
                sender.setTranslationInView({ x: 0, y: 0 }, sender.view.superview);
            },

            "onLibNewFolder": function (sender) {
                if (self.libWebView) {
                    self.libWebView.evaluateJavaScript("showModal('newFolder', '', '新文件夹', '新建文件夹', '请输入文件夹名称');", function () { });
                }
            },

            "onLibBatchExport": function (sender) {
                if (self.libWebView) {
                    self.libWebView.evaluateJavaScript("batchExport();", function () { });
                }
            },



            "onToggleMode": function (sender) {
                var app = Application.sharedInstance();
                var pe = findPanelEntryFromView(sender);
                if (!pe || !pe.webView) return;

                // V9: Mode toggle only remembers image sizes, NOT table layout
                pe.webView.evaluateJavaScript(
                    "var sizes = { img: {} }; " +
                    "var imgs = document.querySelectorAll('.resize-img-container img'); " +
                    "for(var j=0; j<imgs.length; j++){ if(imgs[j].style.width) { " +
                    "  var paint = imgs[j].getAttribute('data-paint') || ''; " +
                    "  if(paint) sizes.img[paint] = { w: imgs[j].style.width }; " +
                    "} } " +
                    "JSON.stringify(sizes);",
                    function (sizeJsonStr, error) {
                        var sizeState = { img: {} };
                        if (sizeJsonStr) {
                            try { sizeState = JSON.parse(sizeJsonStr); } catch (e) { }
                        }

                        // Sync savedImgHash
                        if (sizeState.img) {
                            for (var h in sizeState.img) {
                                pe.savedImgHash[h] = sizeState.img[h];
                            }
                        }

                        if (pe.tableMode === "titlecontent") {
                            pe.tableMode = "merge";
                            if (pe.modeBtn) pe.modeBtn.setTitleForState("合并模式", 0);
                            app.showHUD("切换为合并模式", self.window, 1);
                        } else {
                            pe.tableMode = "titlecontent";
                            if (pe.modeBtn) pe.modeBtn.setTitleForState("标题模式", 0);
                            app.showHUD("切换为标题模式", self.window, 1);
                        }

                        if (pe.rootNotes && pe.webView) {
                            // Temporarily set self state for HTML build
                            var origWidthMap = self.savedWidthMap;
                            var origImgHash = self.savedImgHash;
                            self.savedWidthMap = {};
                            self.savedImgHash = pe.savedImgHash || {};
                            var html = (pe.tableMode === "titlecontent") ? buildTitleContentTable(pe.rootNotes, pe.isCompactMode) : buildHtmlTable(pe.rootNotes, pe.isCompactMode);
                            self.savedWidthMap = origWidthMap;
                            self.savedImgHash = origImgHash;

                            // Only inject image size restore (no td width restore)
                            var imgSizeState = { img: pe.savedImgHash || {} };
                            var injectSizeJs = "<script>" +
                                "window.onload = function() { " +
                                "  var st = " + JSON.stringify(imgSizeState) + "; " +
                                "  var imgs = document.querySelectorAll('.resize-img-container img'); " +
                                "  for(var j=0; j<imgs.length; j++) { var paint = imgs[j].getAttribute('data-paint') || ''; if(paint && st.img[paint] && st.img[paint].w) { imgs[j].style.width = st.img[paint].w; imgs[j].style.height = 'auto'; } } " +
                                "};" +
                                "<\/script>";
                            if (html.indexOf('</head>') > -1) {
                                html = html.replace('</head>', injectSizeJs + '</head>');
                            }

                            var tempPath = app.tempPath + "/view_table.html";
                            var fileData = NSData.dataWithStringEncoding(html, 4);
                            if (fileData) {
                                fileData.writeToFileAtomically(tempPath, false);
                                pe.webView.loadRequest(NSURLRequest.requestWithURL(NSURL.fileURLWithPath(tempPath)));
                            }
                        }
                    }
                );
            },


            "onToggleBreadcrumb": function (sender) {
                var app = Application.sharedInstance();
                var pe = findPanelEntryFromView(sender);
                if (!pe) return;
                pe.showBreadcrumb = !pe.showBreadcrumb;
                self.showBreadcrumb = pe.showBreadcrumb; // V3.5.8: Sync global state for batch export
                if (pe.bcBtn) pe.bcBtn.setTitleForState(pe.showBreadcrumb ? "路径:开" : "路径:关", 0);
                app.showHUD(pe.showBreadcrumb ? "打印/导出时显示路径" : "打印/导出时隐藏路径", self.window, 1);

                if (pe.webView) {
                    var jsCmd = pe.showBreadcrumb ? "document.body.classList.remove('hide-breadcrumb');" : "document.body.classList.add('hide-breadcrumb');";
                    pe.webView.evaluateJavaScript(jsCmd, function () { });
                }
            },

            "onToggleLink": function (sender) {
                var app = Application.sharedInstance();
                var pe = findPanelEntryFromView(sender);
                if (!pe) return;
                pe.isLinked = !pe.isLinked;

                var styleButton = function (btn, bgColor, textColor, radius) {
                    btn.backgroundColor = bgColor;
                    btn.setTitleColorForState(textColor, 0);
                    btn.layer.cornerRadius = radius || 6;
                    btn.layer.borderWidth = 0.5;
                    btn.layer.borderColor = UIColor.colorWithWhiteAlpha(0, 0.1);
                };

                if (pe.linkBtn) {
                    pe.linkBtn.setTitleForState(pe.isLinked ? "链接" : "解链", 0);
                    if (pe.isLinked) {
                        styleButton(pe.linkBtn, UIColor.colorWithRedGreenBlueAlpha(0.92, 0.98, 0.92, 1), UIColor.colorWithRedGreenBlueAlpha(0.13, 0.55, 0.13, 1), 6);
                    } else {
                        styleButton(pe.linkBtn, UIColor.colorWithWhiteAlpha(0.93, 1), UIColor.grayColor(), 6);
                    }
                }
                app.showHUD(pe.isLinked ? "🔗 已开启脑图联动" : "⛓️ 已关闭脑图联动", self.window, 1);
            },

            "onToggleWidthSync": function (sender) {
                var app = Application.sharedInstance();
                var pe = findPanelEntryFromView(sender);
                if (!pe) return;
                self.isSyncWidth = !self.isSyncWidth;
                
                // 处理从独立回到同步时的合并逻辑：以相同depth的最大宽度来合并
                if (self.isSyncWidth && self.savedNodeWidthMap) {
                    for (var nid in self.savedNodeWidthMap) {
                        var nodeData = self.savedNodeWidthMap[nid];
                        if (nodeData && nodeData.w && nodeData.depth) {
                            var wVal = parseFloat(nodeData.w);
                            var curSaved = parseFloat(self.savedWidthMap[nodeData.depth] || "0");
                            if (wVal > curSaved) {
                                self.savedWidthMap[nodeData.depth] = nodeData.w;
                            }
                        }
                    }
                    // 清空个别记录，强制归并
                    self.savedNodeWidthMap = {};
                }

                var styleButton = function (btn, bgColor, textColor, radius) {
                    btn.backgroundColor = bgColor;
                    btn.setTitleColorForState(textColor, 0);
                    btn.layer.cornerRadius = radius || 6;
                    btn.layer.borderWidth = 0.5;
                    btn.layer.borderColor = UIColor.colorWithWhiteAlpha(0, 0.1);
                };

                // Update btn
                var syncBtn = sender;
                syncBtn.setTitleForState(self.isSyncWidth ? "宽:同" : "宽:独", 0);
                if (self.isSyncWidth) {
                    styleButton(syncBtn, UIColor.colorWithRedGreenBlueAlpha(0.9, 0.95, 1.0, 1), UIColor.colorWithRedGreenBlueAlpha(0.2, 0.4, 0.8, 1), 6);
                } else {
                    styleButton(syncBtn, UIColor.colorWithRedGreenBlueAlpha(1.0, 0.9, 0.9, 1), UIColor.colorWithRedGreenBlueAlpha(0.8, 0.2, 0.2, 1), 6);
                }

                app.showHUD(self.isSyncWidth ? "宽度模式: 整体联动同步" : "宽度模式: 单独单元格调整", self.window, 1);

                // Inject into JS
                if (pe.webView) {
                    pe.webView.evaluateJavaScript("window.isSyncWidth = " + (self.isSyncWidth ? "true" : "false") + ";", function () { });
                }
                
                // If turning sync back ON, trigger a full re-render to apply merged widths
                if (self.isSyncWidth) {
                    var nSelf = self;
                    NSTimer.scheduledTimerWithTimeInterval(0.2, false, function() {
                        nSelf.onRefresh(sender);
                    });
                }
            },

            "onShowDonate": function (sender) {
                var app = Application.sharedInstance();
                try {
                    var studyController = app.studyController(self.window);
                    var containerView = studyController ? studyController.view : self.window;
                    if (!containerView) { app.showHUD("Donate: no view", self.window, 2); return; }
                    var frame = containerView.bounds;
                    var fw = frame.width || 1024;
                    var fh = frame.height || 768;

                    // 如果已有打赏弹窗，先关闭再新建（防止重复叠加）
                    if (self.donateAlertView) {
                        if (self.donateMaskView) { self.donateMaskView.removeFromSuperview(); self.donateMaskView = null; }
                        self.donateAlertView.removeFromSuperview();
                        self.donateAlertView = null;
                        return;
                    }

                    var alertView = new UIView({
                        x: 0, y: 0, width: 300, height: 260
                    });
                    alertView.backgroundColor = UIColor.whiteColor();
                    alertView.layer.cornerRadius = 12;
                    alertView.layer.shadowColor = UIColor.blackColor().CGColor;
                    alertView.layer.shadowOpacity = 0.3;
                    alertView.layer.shadowOffset = { width: 0, height: 2 };
                    alertView.layer.shadowRadius = 10;

                    // 标题
                    var titleLabel = new UILabel({
                        x: 20, y: 15, width: 260, height: 30
                    });
                    titleLabel.text = "❤️ 感谢支持";
                    titleLabel.font = UIFont.boldSystemFontOfSize(18);
                    titleLabel.textColor = UIColor.colorWithRedGreenBlueAlpha(0.2, 0.2, 0.2, 1);
                    titleLabel.textAlignment = 1;
                    alertView.addSubview(titleLabel);

                    // 描述文字
                    var descLabel = new UILabel({
                        x: 20, y: 45, width: 260, height: 40
                    });
                    descLabel.text = "如果这个插件对你有帮助，可以支持作者继续创作";
                    descLabel.font = UIFont.systemFontOfSize(13);
                    descLabel.textColor = UIColor.grayColor();
                    descLabel.textAlignment = 1;
                    descLabel.numberOfLines = 2;
                    alertView.addSubview(descLabel);

                    // 微信打赏按钮
                    var wechatBtn = UIButton.buttonWithType(0);
                    wechatBtn.frame = { x: 40, y: 95, width: 100, height: 36 };
                    wechatBtn.setTitleForState("微信打赏", 0);
                    wechatBtn.backgroundColor = UIColor.colorWithRedGreenBlueAlpha(0.07, 0.77, 0.32, 1);
                    wechatBtn.setTitleColorForState(UIColor.whiteColor(), 0);
                    wechatBtn.layer.cornerRadius = 8;
                    wechatBtn.titleLabel.font = UIFont.systemFontOfSize(14);
                    wechatBtn.addTargetActionForControlEvents(self, "onShowWechatQR:", 1 << 6);
                    alertView.addSubview(wechatBtn);

                    // 支付宝打赏按钮
                    var alipayBtn = UIButton.buttonWithType(0);
                    alipayBtn.frame = { x: 160, y: 95, width: 100, height: 36 };
                    alipayBtn.setTitleForState("支付宝打赏", 0);
                    alipayBtn.backgroundColor = UIColor.colorWithRedGreenBlueAlpha(0.0, 0.68, 0.9, 1);
                    alipayBtn.setTitleColorForState(UIColor.whiteColor(), 0);
                    alipayBtn.layer.cornerRadius = 8;
                    alipayBtn.titleLabel.font = UIFont.systemFontOfSize(14);
                    alipayBtn.addTargetActionForControlEvents(self, "onShowAlipayQR:", 1 << 6);
                    alertView.addSubview(alipayBtn);

                    // 关闭按钮
                    var closeBtn = UIButton.buttonWithType(0);
                    closeBtn.frame = { x: 100, y: 215, width: 100, height: 36 };
                    closeBtn.setTitleForState("关闭", 0);
                    closeBtn.backgroundColor = UIColor.colorWithWhiteAlpha(0.93, 1);
                    closeBtn.setTitleColorForState(UIColor.grayColor(), 0);
                    closeBtn.layer.cornerRadius = 8;
                    closeBtn.titleLabel.font = UIFont.systemFontOfSize(14);
                    closeBtn.addTargetActionForControlEvents(self, "onCloseDonateAlert:", 1 << 6);
                    alertView.addSubview(closeBtn);

                    alertView.frame = { x: (fw - 300) / 2, y: (fh - 260) / 2, width: 300, height: 260 };

                    // 添加半透明遮罩
                    var maskView = new UIView({
                        x: 0, y: 0, width: fw, height: fh
                    });
                    maskView.backgroundColor = UIColor.colorWithWhiteAlpha(0, 0.5);
                    maskView.tag = 999;

                    var tapGesture = new UITapGestureRecognizer(self, "onCloseDonateAlert:");
                    maskView.addGestureRecognizer(tapGesture);

                    containerView.addSubview(maskView);
                    containerView.addSubview(alertView);

                    // 保存弹窗引用
                    self.donateAlertView = alertView;
                    self.donateMaskView = maskView;
                } catch (e) { app.showHUD("Donate Err: " + e, self.window, 4); }
            },

            "onShowWechatQR": function (sender) {
                showQRCodePanel(self, "wechat");
            },

            "onShowAlipayQR": function (sender) {
                showQRCodePanel(self, "alipay");
            },

            "showQRCodeImage": function (type) {
                // 保留此为占位，实际逻辑已移到闭包函数 showQRCodePanel
            },

            "onCloseQRAlert": function (sender) {
                // 关闭二维码弹窗
                if (self.qrAlertView) {
                    self.qrAlertView.removeFromSuperview();
                    self.qrAlertView = null;
                }
                if (self.qrMaskView) {
                    self.qrMaskView.removeFromSuperview();
                    self.qrMaskView = null;
                }
            },

            "onCloseDonateAlert": function (sender) {
                // 关闭打赏弹窗
                if (self.donateAlertView) {
                    self.donateAlertView.removeFromSuperview();
                    self.donateAlertView = null;
                }
                if (self.donateMaskView) {
                    self.donateMaskView.removeFromSuperview();
                    self.donateMaskView = null;
                }
            },

            "onRefresh": function (sender) {
                var app = Application.sharedInstance();
                var pe = findPanelEntryFromView(sender);
                if (!pe || !pe.webView) return;

                app.showHUD("正在同步最新数据并恢复布局...", self.window, 1);

                // V2.8.0: Use data-paint attribute for unified key system
                pe.webView.evaluateJavaScript(
                    "var sizes = { td: {}, nodeTd: {}, img: {} }; " +
                    "var tds = document.querySelectorAll('td[data-depth]'); " +
                    "for(var i=0; i<tds.length; i++){ if(tds[i].style.width) { " +
                    "  var depth = tds[i].getAttribute('data-depth'); " +
                    "  var nid = tds[i].getAttribute('data-nodeid'); " +
                    "  sizes.td[depth] = tds[i].style.width; " +
                    "  if(nid) sizes.nodeTd[nid] = { w: tds[i].style.width, depth: depth }; " +
                    "} } " +
                    "var imgs = document.querySelectorAll('.resize-img-container img'); " +
                    "for(var j=0; j<imgs.length; j++){ if(imgs[j].style.width) { " +
                    "  var paint = imgs[j].getAttribute('data-paint') || ''; " +
                    "  if(paint) sizes.img[paint] = { w: imgs[j].style.width }; " +
                    "} } " +
                    "JSON.stringify(sizes);",
                    function (sizeJsonStr, error) {
                        var sizeState = { td: {}, nodeTd: {}, img: {} };
                        if (sizeJsonStr) {
                            try { sizeState = JSON.parse(sizeJsonStr); } catch (e) { }
                        }

                        if (sizeState.td) pe.savedWidthMap = sizeState.td;
                        if (sizeState.nodeTd) pe.savedNodeWidthMap = sizeState.nodeTd;
                        if (sizeState.img) {
                            for (var h in sizeState.img) {
                                pe.savedImgHash[h] = sizeState.img[h];
                            }
                        }

                        var rootNotes = [];
                        // Fallback 1: pe.savedRootNoteIds
                        if (pe.savedRootNoteIds && pe.savedRootNoteIds.length > 0) {
                            pe.savedRootNoteIds.forEach(function (pid) {
                                var n = Database.sharedInstance().getNoteById(pid);
                                if (n) rootNotes.push(n);
                            });
                        }
                        // Fallback 2: pe.rootNotes
                        if (rootNotes.length === 0 && pe.rootNotes && pe.rootNotes.length > 0) {
                            rootNotes = pe.rootNotes;
                        }
                        // Fallback 3: current mindmap selection
                        if (rootNotes.length === 0) {
                            try {
                                var mmView = app.studyController(self.window).notebookController.mindmapView;
                                if (mmView) {
                                    var sel = mmView.selViewLst;
                                    if (sel && sel.length > 0) {
                                        sel.forEach(function (v) {
                                            var selectedNote = getNoteFromMindMapSelection(v);
                                            if (selectedNote) rootNotes.push(selectedNote);
                                        });
                                    }
                                }
                            } catch (e) { }
                        }

                        if (rootNotes.length > 0) {
                            pe.rootNotes = rootNotes;
                            pe.savedRootNoteIds = rootNotes.map(function (n) { return n.noteId; });

                            // Temporarily set self state for HTML build
                            var origWidthMap = self.savedWidthMap;
                            var origNodeWidthMap = self.savedNodeWidthMap;
                            var origImgHash = self.savedImgHash;
                            self.savedWidthMap = pe.savedWidthMap || {};
                            self.savedNodeWidthMap = pe.savedNodeWidthMap || {};
                            self.savedImgHash = pe.savedImgHash || {};
                            var html = (pe.tableMode === "titlecontent") ? buildTitleContentTable(rootNotes, pe.isCompactMode) : buildHtmlTable(rootNotes, pe.isCompactMode);
                            self.savedWidthMap = origWidthMap;
                            self.savedNodeWidthMap = origNodeWidthMap;
                            self.savedImgHash = origImgHash;

                            var fullSizeState = {
                                td: pe.savedWidthMap || {},
                                nodeTd: pe.savedNodeWidthMap || {},
                                img: pe.savedImgHash || {},
                                isSyncWidth: self.isSyncWidth === true
                            };
                            var injectSizeJs = "<script>" +
                                "window.onload = function() { " +
                                "  var st = " + JSON.stringify(fullSizeState) + "; " +
                                "  var tds = document.querySelectorAll('td[data-depth]'); " +
                                "  for(var i=0; i<tds.length; i++) { " +
                                "    var d = tds[i].getAttribute('data-depth'); " +
                                "    var nid = tds[i].getAttribute('data-nodeid'); " +
                                "    if(st.isSyncWidth === false && nid && st.nodeTd[nid] && st.nodeTd[nid].w) tds[i].style.width = st.nodeTd[nid].w; " +
                                "    else if(st.td[d]) tds[i].style.width = st.td[d]; " +
                                "  } " +
                                "  var imgs = document.querySelectorAll('.resize-img-container img'); " +
                                "  for(var j=0; j<imgs.length; j++) { var paint = imgs[j].getAttribute('data-paint') || ''; if(paint && st.img[paint] && st.img[paint].w) { imgs[j].style.width = st.img[paint].w; imgs[j].style.height = 'auto'; } } " +
                                "};" +
                                "<\/script>";
                            if (html.indexOf('</head>') > -1) {
                                html = html.replace('</head>', injectSizeJs + '</head>');
                            }

                            pe.currentHtml = html;
                            var tempPath = app.tempPath + "/view_table.html";
                            var fileData = NSData.dataWithStringEncoding(html, 4);
                            if (fileData) {
                                fileData.writeToFileAtomically(tempPath, false);
                                pe.webView.loadRequest(NSURLRequest.requestWithURL(NSURL.fileURLWithPath(tempPath)));
                            }
                        } else {
                            app.showHUD("⚠️ 未找到原始笔记，请重新选择节点", self.window, 2);
                        }
                    }
                );
            },


            "onClose": function (sender) {
                // V3: Multi-window — find which panel this close button belongs to
                var pe = findPanelEntryFromView(sender);
                if (pe) {
                    pe.panel.removeFromSuperview();
                    // Remove from panels array
                    if (self.panels) {
                        for (var i = 0; i < self.panels.length; i++) {
                            if (self.panels[i].panel === pe.panel) {
                                self.panels.splice(i, 1);
                                break;
                            }
                        }
                    }
                    // If this was the last active panel, clear the reference
                    if (self.lastActivePe === pe) {
                        self.lastActivePe = null;
                        // Optional fallback to another visible panel
                        if (self.panels.length > 0) self.lastActivePe = self.panels[self.panels.length - 1];
                    }
                } else if (self.panel) {
                    // Fallback for legacy: hide the current panel
                    self.panel.hidden = true;
                }
            },

            "onExportSafari": function (sender) {
                // V3: Multi-window — find the correct panel
                var pe = findPanelEntryFromView(sender);
                if (!pe || !pe.rootNotes) return;
                var app = Application.sharedInstance();

                // 异步获取 WebView 当前实时 DOM，保留用户手动调整的列宽、图片大小和折叠状态
                pe.webView.evaluateJavaScript(
                    "document.documentElement.outerHTML;",
                    function (liveHtml, error) {
                        try {
                            var cleanHtml;
                            if (liveHtml && liveHtml.length > 100) {
                                cleanHtml = "<!DOCTYPE html>" + liveHtml;
                            } else {
                                // 回退：抓取失败时用数据重建
                                cleanHtml = (pe.tableMode === "titlecontent") ? buildTitleContentTable(pe.rootNotes, pe.isCompactMode) : buildHtmlTable(pe.rootNotes, pe.isCompactMode);
                            }

                            // 剔除脚本 (V2.5.7: 使用正则防止误删 Body)
                            cleanHtml = cleanHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                            // 剔除交互控件
                            cleanHtml = cleanHtml.replace(/<div class="resizer"><\/div>/g, '');
                            cleanHtml = cleanHtml.replace(/<div class="img-resizer"><\/div>/g, '');
                            cleanHtml = cleanHtml.replace(/<button class="fold-btn"[^>]*>[^<]*<\/button>/g, '');
                            cleanHtml = cleanHtml.replace(/<button class="row-fold-btn"[^>]*>[^<]*<\/button>/g, '');

                            var dateObj = new Date();
                            var yyyy = dateObj.getFullYear();
                            var mm = (dateObj.getMonth() + 1).toString();
                            if (mm.length < 2) mm = '0' + mm;
                            var dd = dateObj.getDate().toString();
                            if (dd.length < 2) dd = '0' + dd;
                            var hh = dateObj.getHours().toString();
                            if (hh.length < 2) hh = '0' + hh;
                            var min = dateObj.getMinutes().toString();
                            if (min.length < 2) min = '0' + min;
                            var ss = dateObj.getSeconds().toString();
                            if (ss.length < 2) ss = '0' + ss;
                            var dateStr = yyyy + "-" + mm + "-" + dd + "_" + hh + "-" + min + "-" + ss;
                            var titleStr = (pe.titleLabel && pe.titleLabel.text) ? pe.titleLabel.text.replace(/[\\/:*?"<>|]/g, "_") : "脑图表格";
                            var fileName = dateStr + "-" + titleStr + ".html";
                            var path = app.tempPath + "/" + fileName;
                            var fileData = NSData.dataWithStringEncoding(cleanHtml, 4);
                            if (fileData) {
                                fileData.writeToFileAtomically(path, false);
                                app.saveFileWithUti(path, "public.html");
                            } else {
                                app.showHUD("文件创建失败", self.window, 2);
                            }
                        } catch (e) {
                            app.showHUD("导出失败: " + e, self.window, 3);
                        }
                    }
                );
            },


            "onMinimize": function (sender) {
                var pe = findPanelEntryFromView(sender);
                if (!pe) return;
                var containerView = pe.panel.superview || self.window;
                var cb = containerView.bounds;

                if (pe.isMinimized) {
                    // === RESTORE ===
                    // Keep the actual floating-tag position before restoring the full panel.
                    // Otherwise the next minimize recomputes it from savedFrame and loses
                    // the position chosen by the user.
                    var currentMinFrame = copyFrame(pe.panel.frame);
                    if (currentMinFrame && currentMinFrame.width && currentMinFrame.height) {
                        pe.minimizedFrame = currentMinFrame;
                        saveMinimizedPosition(currentMinFrame);
                    }
                    pe.isMinimized = false;

                    // 1) Disable autoresizing on titleBar subviews to prevent iOS auto-adjustment
                    if (pe.minBtn) pe.minBtn.autoresizingMask = 0;
                    if (pe.closeBtn) pe.closeBtn.autoresizingMask = 0;
                    if (pe.titleLabel) pe.titleLabel.autoresizingMask = 0;

                    // 2) Restore panel frame (this would normally trigger autoresizing)
                    if (pe.savedFrame) {
                        pe.panel.frame = pe.savedFrame;
                    }

                    // 3) Manually restore subview frames from our saved copies
                    if (pe.minBtn) {
                        pe.minBtn.setTitleForState("➖", 0);
                        if (pe._minBtnSavedFrame) pe.minBtn.frame = pe._minBtnSavedFrame;
                        pe.minBtn.autoresizingMask = (1 << 0); // Re-enable FlexibleLeftMargin
                    }
                    if (pe.closeBtn) {
                        pe.closeBtn.hidden = false;
                        if (pe._closeBtnSavedFrame) pe.closeBtn.frame = pe._closeBtnSavedFrame;
                        pe.closeBtn.autoresizingMask = (1 << 0);
                    }
                    if (pe.titleLabel) {
                        if (pe._titleLabelSavedFrame) pe.titleLabel.frame = pe._titleLabelSavedFrame;
                        pe.titleLabel.autoresizingMask = (1 << 1);
                    }

                    // 4) Show hidden elements
                    pe.webView.hidden = false;
                    if (pe.resizeHandle) pe.resizeHandle.hidden = false;
                    if (pe.modeBtn) pe.modeBtn.hidden = false;
                    if (pe.bcBtn) pe.bcBtn.hidden = false;
                    if (pe.linkBtn) pe.linkBtn.hidden = false;
                    if (pe.exportBtn) pe.exportBtn.hidden = false;
                    if (pe.refreshBtn) pe.refreshBtn.hidden = false;
                    if (pe.libOpenBtn) pe.libOpenBtn.hidden = false;
                    if (pe.libSaveBtn) pe.libSaveBtn.hidden = false;

                    pe.panel.layer.cornerRadius = 10;
                } else {
                    // === MINIMIZE ===
                    var f = pe.panel.frame;
                    pe.savedFrame = copyFrame(f);

                    // 1) Save subview frames BEFORE changing panel size (autoresizing hasn't fired yet)
                    if (pe.minBtn) {
                        var mbf = pe.minBtn.frame;
                        pe._minBtnSavedFrame = { x: mbf.x, y: mbf.y, width: mbf.width, height: mbf.height };
                        pe.minBtn.autoresizingMask = 0; // Disable auto-adjustment
                    }
                    if (pe.closeBtn) {
                        var cbf = pe.closeBtn.frame;
                        pe._closeBtnSavedFrame = { x: cbf.x, y: cbf.y, width: cbf.width, height: cbf.height };
                        pe.closeBtn.autoresizingMask = 0;
                    }
                    if (pe.titleLabel) {
                        var tlf = pe.titleLabel.frame;
                        pe._titleLabelSavedFrame = { x: tlf.x, y: tlf.y, width: tlf.width, height: tlf.height };
                        pe.titleLabel.autoresizingMask = 0;
                    }

                    // 2) Now resize the panel (autoresizing won't affect our saved subviews)
                    var minW = 180;
                    var minH = 44;
                    // Reuse the last manually placed tag position. On first use, retain the
                    // original edge-snapping behavior; clamp it when the host view changes size.
                    var storedPosition = pe.minimizedFrame || loadMinimizedPosition();
                    var defaultX = (f.x + f.width / 2) < cb.width / 2 ? 0 : cb.width - minW;
                    var nextMinFrame = clampMinimizedFrame(
                        storedPosition || { x: defaultX, y: f.y },
                        cb,
                        minW,
                        minH
                    );
                    pe.minimizedFrame = nextMinFrame;
                    saveMinimizedPosition(nextMinFrame);
                    pe.panel.frame = nextMinFrame;
                    pe.isMinimized = true;

                    // 3) Set minimized layout
                    if (pe.closeBtn) pe.closeBtn.hidden = true;
                    if (pe.titleLabel) {
                        pe.titleLabel.frame = { x: 10, y: 0, width: minW - 40, height: minH };
                    }
                    if (pe.minBtn) {
                        pe.minBtn.setTitleForState("⛶", 0);
                        pe.minBtn.frame = { x: minW - 30, y: 10, width: 24, height: 24 };
                    }

                    // 4) Hide other elements
                    pe.webView.hidden = true;
                    if (pe.resizeHandle) pe.resizeHandle.hidden = true;
                    if (pe.modeBtn) pe.modeBtn.hidden = true;
                    if (pe.bcBtn) pe.bcBtn.hidden = true;
                    if (pe.linkBtn) pe.linkBtn.hidden = true;
                    if (pe.exportBtn) pe.exportBtn.hidden = true;
                    if (pe.refreshBtn) pe.refreshBtn.hidden = true;
                    if (pe.libOpenBtn) pe.libOpenBtn.hidden = true;
                    if (pe.libSaveBtn) pe.libSaveBtn.hidden = true;

                    pe.panel.layer.cornerRadius = 10;
                }
            },

            "onDrag": function (recognizer) {
                var view = recognizer.view.superview; // 找到 gesture 所在的那个 Panel (titleBar 的 parent)
                if (recognizer.state == 1) {
                    var center = view.center;
                    self.dragStartCenter = { x: center.x, y: center.y };
                    // 提升当前被拖拽面板的层级
                    view.superview.bringSubviewToFront(view);
                    // Update last active
                    var pe = findPanelEntryFromView(view);
                    if (pe) self.lastActivePe = pe;
                } else if (recognizer.state == 2 || recognizer.state == 3) {
                    var containerView = view.superview || self.window;
                    var containerBounds = containerView.bounds;
                    var translation = recognizer.translationInView(containerView);
                    if (self.dragStartCenter) {
                        view.center = {
                            x: self.dragStartCenter.x + translation.x,
                            y: self.dragStartCenter.y + translation.y
                        };
                    }
                    if (recognizer.state == 3) {
                        self.dragStartCenter = null;
                        // V3.3.0: Edge snapping for minimized floating icon
                        var pe = findPanelEntryFromView(view);
                        if (pe && pe.isMinimized) {
                            var f = view.frame;
                            var targetX = (f.x + f.width / 2) < containerBounds.width / 2 ? 0 : containerBounds.width - f.width;
                            var snappedFrame = clampMinimizedFrame(
                                { x: targetX, y: f.y },
                                containerBounds,
                                f.width,
                                f.height
                            );
                            UIView.animateWithDurationAnimationsCompletion(0.2, function () {
                                view.frame = snappedFrame;
                                pe.minimizedFrame = copyFrame(snappedFrame);
                                saveMinimizedPosition(snappedFrame);
                            }, function () { });
                        }
                    }
                }
            },


            "onResize": function (recognizer) {
                // V3: Multi-window — find panel from resize handle
                var pe = findPanelEntryFromView(recognizer.view);
                if (!pe || pe.isMinimized) return;
                if (recognizer.state == 1) {
                    var frame = pe.panel.frame;
                    self.resizeStartFrame = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
                    self._resizePanel = pe;
                    self.lastActivePe = pe; // Track last active
                } else if (recognizer.state == 2 || recognizer.state == 3) {
                    var rpe = self._resizePanel || pe;
                    var containerView = rpe.panel.superview || self.window;
                    var translation = recognizer.translationInView(containerView);
                    if (self.resizeStartFrame) {
                        var newWidth = Math.max(300, self.resizeStartFrame.width + translation.x);
                        var newHeight = Math.max(250, self.resizeStartFrame.height + translation.y);
                        rpe.panel.frame = {
                            x: self.resizeStartFrame.x,
                            y: self.resizeStartFrame.y,
                            width: newWidth,
                            height: newHeight
                        };
                    }
                    if (recognizer.state == 3) { self.resizeStartFrame = null; self._resizePanel = null; }
                }
            }
        },
        {
            addonDidConnect: function () { },
            addonWillDisconnect: function () { },
            applicationWillEnterForeground: function () { },
            applicationDidEnterBackground: function () { },
            applicationDidReceiveLocalNotification: function (notify) { },

            // V3.3.4: Toolbar icon support
            queryAddonCommandStatus: function () {
                return {
                    image: "logo.png",
                    object: self,
                    selector: "toggleAddon:",
                    checked: false
                };
            },

            toggleAddon: function (sender) {
                // Trigger the same logic as clicking the addon button in the study bar
                var app = Application.sharedInstance();
                var studyController = app.studyController(self.window);
                if (!studyController) return;

                var topicid = studyController.notebookController.notebookId;
                if (!topicid) return;

                var notebook = Database.sharedInstance().getNotebookById(topicid);
                var html = "";
                var selViewLst = studyController.notebookController.mindmapView.selViewLst;
                var targetNotes = [];
                if (selViewLst && selViewLst.length > 0) {
                    for (var i = 0; i < selViewLst.length; i++) {
                        var selectedNote = getNoteFromMindMapSelection(selViewLst[i]);
                        if (selectedNote) targetNotes.push(selectedNote);
                    }
                }
                if (targetNotes.length === 0) {
                    var focusNote = getMindMapFocusNote(studyController);
                    if (focusNote) targetNotes.push(focusNote);
                }
                if (targetNotes.length > 0) {
                    self.rootNotes = targetNotes;
                    self.savedRootNoteIds = targetNotes.map(function (n) { return n.noteId; });
                    html = (self.tableMode === "titlecontent") ? buildTitleContentTable(targetNotes, self.isCompactMode) : buildHtmlTable(targetNotes, self.isCompactMode);
                } else if (notebook && notebook.notes && notebook.notes.length > 0) {
                    self.rootNotes = notebook.notes;
                    self.savedRootNoteIds = notebook.notes.map(function (n) { return n.noteId; });
                    html = (self.tableMode === "titlecontent") ? buildTitleContentTable(notebook.notes, self.isCompactMode) : buildHtmlTable(notebook.notes, self.isCompactMode);
                } else {
                    app.showHUD("没有笔记", self.window, 2);
                    return;
                }

                showPanel(self, html);
                startGlobalPollTimer();
            }
        }
    );
    return Mindmap2Table;
};
