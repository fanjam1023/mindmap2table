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
