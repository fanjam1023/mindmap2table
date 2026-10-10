/* Body-local HTML sanitization, implemented independently of reference plugins. */
var MomoCardHtml = (function () {
    var tags = 'html body a abbr b blockquote br caption code col colgroup dd del details div dl dt em font h1 h2 h3 h4 h5 h6 hr i img input kbd li mark ol p pre s small span strike strong sub summary sup table tbody td th thead tr u ul'.split(' ');
    var voids = {br:1,hr:1,img:1,input:1,col:1};
    function escape(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function decode(value) {
        return String(value).replace(/&#(x[0-9a-f]+|[0-9]+);?/gi, function (_, code) {
            var n = code.charAt(0).toLowerCase() === 'x' ? parseInt(code.slice(1),16) : Number(code);
            return n < 65536 ? String.fromCharCode(n) : '';
        }).replace(/&colon;/gi,':').replace(/&tab;|&newline;/gi,'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#39;|&apos;/gi,"'");
    }
    function url(value, image) {
        var normalized = decode(value).replace(/[\u0000-\u0020\u007f]+/g,'');
        if (/^(?:https?:|mailto:|marginnote[34]app:|#|\/|\.\/|\.\.\/)/i.test(normalized)) return normalized;
        if (image && /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(normalized)) return normalized;
        if (!/^[A-Za-z][\w+.-]*:/.test(normalized)) return normalized;
        return '';
    }
    function style(value) {
        var allowed = /^(?:color|background-color|background|font-(?:size|weight|style|family)|text-(?:align|decoration|indent)|white-space|line-height|letter-spacing|vertical-align|border(?:-(?:top|right|bottom|left))?(?:-(?:color|style|width))?|border-collapse|padding(?:-(?:top|right|bottom|left))?|margin(?:-(?:top|right|bottom|left))?|width|max-width|min-width|height|max-height|list-style-type)$/;
        return decode(value).split(';').map(function (part) {
            var colon = part.indexOf(':'); if (colon < 0) return '';
            var key = part.slice(0,colon).trim().toLowerCase(), val = part.slice(colon+1).trim();
            if (!allowed.test(key) || /url\s*\(|expression|@|[<>\\]|behavior|javascript/i.test(val)) return '';
            if (key === 'white-space' && !/^(normal|pre|pre-wrap|pre-line|nowrap)$/i.test(val)) return '';
            return key + ':' + val;
        }).filter(Boolean).join(';');
    }
    function attributes(source) {
        var out = {}, re = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, match;
        while ((match = re.exec(source))) out[match[1].toLowerCase()] = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] || '';
        return out;
    }
    function simple(node, selector) {
        var tag = /^[A-Za-z][\w-]*|^\*/.exec(selector), rest = tag ? selector.slice(tag[0].length) : selector;
        if (tag && tag[0] !== '*' && tag[0].toLowerCase() !== node.tag) return false;
        var matches = rest.match(/[.#][\w-]+/g) || [];
        if (matches.join('') !== rest) return false;
        return matches.every(function (item) { return item[0] === '#' ? node.attrs.id === item.slice(1) : (' '+(node.attrs.class || '')+' ').indexOf(' '+item.slice(1)+' ') >= 0; });
    }
    function matches(node, selector) {
        var parts = selector.trim().split(/\s+/), current = node;
        for (var i = parts.length - 1; i >= 0; i--) {
            if (parts[i] === '>') { i--; current = current && current.parent; if (!current || !simple(current,parts[i])) return false; continue; }
            if (i === parts.length - 1) { if (!simple(current,parts[i])) return false; }
            else { current = current.parent; while (current && !simple(current,parts[i])) current = current.parent; if (!current) return false; }
        }
        return true;
    }
    function emitTag(tag) { return tag === 'body' || tag === 'html' ? 'div' : tag; }
    function sanitize(source) {
        var warnings = [], rules = [], html = String(source || '');
        html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, function (_, css) {
            css.replace(/([^{}]+)\{([^{}]*)\}/g, function (_, selector, declarations) {
                selector.split(',').forEach(function (sel) {
                    sel = sel.trim();
                    if (!/^[\w.*#\s>\-]+$/.test(sel) || /@/.test(sel)) { warnings.push('部分 HTML 样式无法恢复'); return; }
                    rules.push({selector: sel, declarations: style(declarations)});
                }); return '';
            }); return '';
        });
        html = html.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi,'');
        html = html.replace(/<(script|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
        var output = [], stack = [], cursor = 0, token = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>/g, match;
        while ((match = token.exec(html))) {
            output.push(html.slice(cursor,match.index)); cursor = token.lastIndex;
            var raw = match[0], parsed = /^<(\/)?([A-Za-z][\w-]*)([\s\S]*?)>$/.exec(raw);
            if (!parsed) continue;
            var closing = !!parsed[1], tag = parsed[2].toLowerCase();
            if (tags.indexOf(tag) < 0) continue;
            if (closing) {
                var index = -1;
                for (var j = stack.length - 1; j >= 0; j--) if (stack[j].tag === tag) { index = j; break; }
                if (index >= 0) while (stack.length > index) output.push('</' + emitTag(stack.pop().tag) + '>');
                continue;
            }
            var attrs = attributes(parsed[3]), current = {tag:tag,attrs:attrs,parent:stack.length ? stack[stack.length-1] : null}, clean = [];
            var inline = '';
            rules.forEach(function (rule) { if (matches(current,rule.selector)) inline += rule.declarations + ';'; });
            inline += style(attrs.style || '');
            // Absolute rich-text font sizes become relative to their native
            // parent size, so A-/A+ scales nested HTML with the rest of the card.
            var parentFont = current.parent && current.parent.fontPx || 15;
            current.fontPx = parentFont;
            inline = inline.replace(/font-size\s*:\s*([0-9.]+)(px|pt|em|%)(?=\s|;|!|$)/gi, function (_, amount, unit) {
                var size = Number(amount), absolute = unit.toLowerCase() === 'px' ? size : unit.toLowerCase() === 'pt' ? size * 4 / 3 : unit === '%' ? parentFont * size / 100 : parentFont * size;
                if (!isFinite(absolute) || absolute <= 0) return '';
                current.fontPx = absolute;
                return 'font-size:' + Math.round(absolute / parentFont * 10000) / 10000 + 'em';
            });
            if (inline) clean.push('style="'+escape(inline)+'"');
            ['title','alt','colspan','rowspan','start','width','height','color','face','size'].forEach(function (name) {
                if (attrs[name] !== undefined) clean.push(name+'="'+escape(decode(attrs[name]))+'"');
            });
            if (tag === 'input') { if (attrs.checked !== undefined) clean.push('checked=""'); clean.push('disabled="" type="checkbox"'); }
            ['href','src'].forEach(function (name) {
                if (attrs[name] !== undefined && (name === 'href' && tag === 'a' || name === 'src' && tag === 'img')) {
                    var safe = url(attrs[name],name === 'src'); if (safe) clean.push(name+'="'+escape(safe)+'"'); else warnings.push('危险或不支持的链接已移除');
                }
            });
            // Preserve parser-owned markers only; native CSS/classes cannot target the table UI.
            if (attrs.class && /^(?:math-inline|math-block|md-table|compact-paragraph-gap|language-[A-Za-z0-9_-]+)$/.test(attrs.class)) clean.push('class="'+attrs.class+'"');
            if (attrs['data-math'] !== undefined) clean.push('data-math="'+escape(decode(attrs['data-math']))+'"');
            output.push('<'+emitTag(tag)+(clean.length ? ' '+clean.join(' ') : '')+'>');
            if (!voids[tag]) stack.push(current);
        }
        output.push(html.slice(cursor));
        while (stack.length) output.push('</'+emitTag(stack.pop().tag)+'>');
        return {html:output.join(''),warnings:warnings};
    }
    function render(model, api, commentsOnly, imageStyle) {
        var parts = [];
        model.blocks.forEach(function (block) {
            var isComment = block.source.indexOf('comment:') === 0;
            if (isComment !== commentsOnly) return;
            try {
                if (block.kind === 'image') {
                    var imageUrl = 'data:'+block.mime+';base64,'+block.value;
                    if (block.layers && block.layers.length && block.width > 0 && block.height > 0) {
                        // One self-contained image keeps ink aligned during resizing and HTML export.
                        var svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+Number(block.width)+'" height="'+Number(block.height)+'" viewBox="0 0 '+Number(block.width)+' '+Number(block.height)+'">';
                        [imageUrl].concat(block.layers.map(function (layer) { return 'data:'+layer.mime+';base64,'+layer.base64; })).forEach(function (url) {
                            svg += '<image width="100%" height="100%" preserveAspectRatio="none" xlink:href="'+escape(url)+'"/>';
                        });
                        imageUrl = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg+'</svg>');
                    }
                    parts.push('<div class="resize-img-container"><img data-paint="'+escape(block.hash)+'" src="'+escape(imageUrl)+'"'+(api.imageStyle(block.hash) || imageStyle || '')+'/><div class="img-resizer"></div></div>');
                } else if (block.kind === 'unsupported') {
                    parts.push('<div class="note-excerpt comment-read-error">'+escape(block.value)+'</div>');
                } else {
                    var rendered = api.text(block.value,block.kind), clean = sanitize(rendered);
                    parts.push('<div class="note-excerpt" style="margin-top:0;">'+clean.html+'</div>');
                    clean.warnings.forEach(function (warning) { parts.push('<div class="comment-read-error">'+escape(warning)+'</div>'); });
                }
            } catch (error) { parts.push('<div class="note-excerpt">'+escape(block.kind === 'image' ? '图片无法读取，请回源查看' : block.value)+'</div><div class="comment-read-error">此内容排版失败，请回源查看</div>'); }
        });
        if (!commentsOnly) model.warnings.forEach(function (warning) { parts.push('<div class="note-excerpt comment-read-error">'+escape(warning)+'</div>'); });
        return parts.join('');
    }
    return {sanitize:sanitize,render:render,url:url,style:style};
}());
