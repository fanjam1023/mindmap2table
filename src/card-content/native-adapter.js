    // Card colours belong to the selected card, never its excerpt/Sketch source.
    // Resolve the notebook palette through MNUtils to preserve custom colours.
    function cardMutedColor(hex) {
        hex = String(hex || '');
        if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return '';
        var alpha = hex.length === 9 ? parseInt(hex.slice(7,9),16) / 255 : 1;
        var rgb = [1,3,5].map(function (offset) { return (parseInt(hex.slice(offset,offset+2),16) * alpha + 255 * (1-alpha)) / 255; });
        var max = Math.max.apply(null,rgb), min = Math.min.apply(null,rgb), delta = max-min;
        var light = (max+min)/2, saturation = delta ? delta / (1-Math.abs(2*light-1)) : 0, hue = 0;
        if (delta) {
            if (max === rgb[0]) hue = ((rgb[1]-rgb[2])/delta + 6) % 6;
            else if (max === rgb[1]) hue = (rgb[2]-rgb[0])/delta + 2;
            else hue = (rgb[0]-rgb[1])/delta + 4;
        }
        // Uniform 50% saturation reduction, with a light floor for dark colours.
        saturation *= 0.5; light = Math.max(0.95,light);
        var chroma = (1-Math.abs(2*light-1))*saturation, x = chroma*(1-Math.abs(hue%2-1)), m = light-chroma/2;
        var channels = hue < 1 ? [chroma,x,0] : hue < 2 ? [x,chroma,0] : hue < 3 ? [0,chroma,x] : hue < 4 ? [0,x,chroma] : hue < 5 ? [x,0,chroma] : [chroma,0,x];
        return '#' + channels.map(function (value) { var part = Math.round((value+m)*255).toString(16); return part.length < 2 ? '0'+part : part; }).join('');
    }

    function cardColorStyle(position) {
        var note = position && (position.__sourceNote || position.__baseNote || position);
        var index = cardField(note,'colorIndex'), notebookId = String(cardField(note,'notebookId') || '');
        // Zero is the first colour; missing/negative indices must not borrow a parent's colour.
        if (index === null || index === undefined || index === '' || !isFinite(Number(index)) || Number(index) < 0 || Number(index) > 15 || Math.floor(Number(index)) !== Number(index)) return '--card-background:initial;';
        var read = function () {
            try {
                if (typeof MNUtil === 'undefined') return '';
                var hex = '';
                if (notebookId && typeof MNUtil.noteColorByNotebookIdAndColorIndex === 'function') hex = MNUtil.noteColorByNotebookIdAndColorIndex(notebookId,Number(index));
                else if (MNUtil.defaultNoteColors) hex = MNUtil.defaultNoteColors[Number(index)];
                return cardMutedColor(hex);
            } catch (ignored) { return ''; }
        };
        var color = activeRenderTask ? taskMemo('cardColor',notebookId+':'+index,read) : read();
        return color ? '--card-background:'+color+';background-color:var(--card-background);' : '--card-background:initial;';
    }

    function cardDrawingHash(note, paint) {
        var current = note, seen = [];
        for (var i = 0; current && i < 8; i++) {
            var id = String(cardField(current, 'noteId') || '');
            if (id && seen.indexOf(id) >= 0) break;
            if (id) seen.push(id);
            var pic = cardField(current, 'excerptPic');
            // A reference may cache the base picture without the source's drawing.
            // Only inherit ink from the exact same excerpt, never from a group card.
            if (pic && readMediaHash(pic) === paint) {
                var drawing = readMediaHash(cardField(pic, 'drawing'));
                if (drawing) return drawing;
            }
            var origin = cardField(current, 'originNoteId');
            if (!origin) break;
            current = taskDatabaseNote(String(origin));
        }
        return '';
    }

    function cardPngSize(encoded) {
        if (String(encoded).indexOf('iVBOR') !== 0) return null;
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', bytes = [], bits = 0, count = 0;
        for (var i = 0; i < 32; i++) {
            var value = alphabet.indexOf(encoded.charAt(i));
            if (value < 0) return null;
            bits = (bits << 6) | value; count += 6;
            if (count >= 8) { count -= 8; bytes.push((bits >>> count) & 255); }
        }
        function number(offset) { return bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]; }
        var width = number(16), height = number(20);
        return width > 0 && height > 0 ? {width:width,height:height} : null;
    }

    function cardReadApi() { return {
                field: cardField, title: function (note) { return getExplicitNoteTitle(note.__baseNote || note.__nativeNote || note); }, comments: getNoteComments,
                blank: hasBlankHighlightMarker, textFirst: function (note) {
                    var value = cardField(note, 'textFirst');
                    return value === true || Number(value) === 1;
                }, hash: getNodePicHash,
                drawing: noteHasDrawingData, hasMedia: noteHasImagePayloadForRender,
                sketch: resolveSketchNote, html: getMNContentHtml, aggregate: getAggregatedNoteText,
                commentHash: getCommentPaint, lookup: function (id) {
                    if (activeRenderTask) activeRenderTask.metrics.associatedNoteQueries++;
                    return taskDatabaseNote(id);
                },
                image: function (note, hash) {
                    var result = note ? getNodeMediaResult(note, hash) : {data:getImageMediaData(hash),hash:hash};
                    var data = result && result.data, encoded = data ? encodeMedia(data) : '';
                    if (!encoded) return null;
                    var output = {base64:encoded,hash:result.hash || hash || '',mime:getImageMimeType(encoded)};
                    try { if (note && output.hash) {
                        var drawingHash = cardDrawingHash(note, output.hash);
                        if (drawingHash && drawingHash !== output.hash) {
                            var ink = getImageMediaData(drawingHash), inkEncoded = ink ? encodeMedia(ink) : '';
                            var size = cardPngSize(encoded) || cardPngSize(inkEncoded);
                            if (inkEncoded && size) {
                                output.layers = [{base64:inkEncoded,mime:getImageMimeType(inkEncoded)}];
                                output.width = size.width; output.height = size.height;
                            } else output.warning = '手写笔记无法读取，请回源查看';
                        }
                    } } catch (drawingError) { output.warning = '手写笔记无法读取，请回源查看'; }
                    return output;
                }
            }; }
