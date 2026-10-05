    function cardReadApi() { return {
                field: cardField, title: function (note) { return getExplicitNoteTitle(note.__baseNote || note.__nativeNote || note); }, comments: getNoteComments,
                blank: hasBlankHighlightMarker, textFirst: isTextFirst, hash: getNodePicHash,
                drawing: noteHasDrawingData, hasMedia: noteHasImagePayloadForRender,
                sketch: resolveSketchNote, html: getMNContentHtml, aggregate: getAggregatedNoteText,
                commentHash: getCommentPaint, lookup: function (id) {
                    if (activeRenderTask) activeRenderTask.metrics.associatedNoteQueries++;
                    return taskDatabaseNote(id);
                },
                image: function (note, hash) {
                    var result = note ? getNodeMediaResult(note, hash) : {data:getImageMediaData(hash),hash:hash};
                    var data = result && result.data, encoded = data ? encodeMedia(data) : '';
                    return encoded ? {base64:encoded,hash:result.hash || hash || '',mime:getImageMimeType(encoded)} : null;
                }
            }; }
