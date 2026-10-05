/* Independent implementation. Native positions and content identities are distinct. */
var MomoCardStructure = (function () {
    function node(value) {
        if (!value) return value;
        var next; try { next = value.note; } catch (ignored) { return value; }
        return next && next.note ? next : value;
    }
    function note(value) {
        var current = value, seen = [];
        while (current && seen.indexOf(current) < 0) {
            var next; try { next = current.note; } catch (ignored) { return null; }
            if (!next) break;
            seen.push(current); current = next;
        }
        return current;
    }
    function create(inputs, api) {
        var roots = [], records = [], pending = [], seen = new Map(), attached = new Set(), serial = 0;
        var chosen = api.array(inputs).map(node), selected = new Set(chosen);
        // Selection order is replaced only when a native sibling array supplies order.
        chosen = chosen.map(function (value, index) {
            var parent = value && value.parentNode, siblings = parent && api.field(parent, 'childNodes');
            return {value: value, index: index, parent: parent, rank: siblings == null ? -1 : api.array(siblings).indexOf(value)};
        }).sort(function (a, b) {
            if (a.parent && a.parent === b.parent && a.rank >= 0 && b.rank >= 0) return a.rank - b.rank;
            if (a.parent && a.parent === b.parent && a.rank < 0 && b.rank < 0) {
                var af = a.value.frame, bf = b.value.frame;
                if (af && bf) return (Number(af.y) - Number(bf.y)) || (Number(af.x) - Number(bf.x)) || a.index - b.index;
            }
            return a.index - b.index;
        }).map(function (entry) { return entry.value; });
        chosen.forEach(function (value) {
            var ancestor = value && value.parentNode, path = new Set(), overlap = false;
            while (ancestor && !path.has(ancestor)) {
                if (selected.has(ancestor)) { overlap = true; break; }
                path.add(ancestor); ancestor = ancestor.parentNode;
            }
            if (!overlap) pending.push({value: value, parent: null, depth: 1, path: []});
        });
        pending.reverse();
        function warning(parent, message) {
            var placeholder = {noteId: parent ? parent.noteId : '', __positionId: 'warning-' + (++serial),
                __sourceNote: null, __structureWarnings: [message], childNotes: [], noteTitle: '', excerptText: ''};
            (parent ? parent.childNotes : roots).push(placeholder);
            records.push({note: placeholder, depth: parent ? parent.__depth + 1 : 1});
        }
        function step() {
            if (!pending.length) return false;
            var item = pending.pop(), value = node(item.value);
            if (!value) { warning(item.parent, '此位置的卡片无法读取，请回源查看'); return true; }
            if (item.path.indexOf(value) >= 0 || item.depth > api.maxDepth) {
                warning(item.parent, '脑图循环或层级过深，已在此位置截断'); return true;
            }
            // Object identity identifies a real placement, never noteId.
            if (seen.has(value)) {
                var existing = seen.get(value);
                if (item.parent && roots.indexOf(existing) >= 0 && !attached.has(existing)) {
                    item.parent.childNotes.push(existing); attached.add(existing);
                }
                return true;
            }
            var nativeNote = note(value), warnings = [], diagnostics = [], children;
            if (!nativeNote) { warning(item.parent, '此位置的卡片无法读取，请回源查看'); return true; }
            try {
                var nativeChildren = api.field(value, 'childNodes');
                if (nativeChildren != null) children = api.array(nativeChildren);
                else {
                    children = api.array(api.field(nativeNote, 'childNotes'));
                    if (children.length) diagnostics.push('原生 childNodes 不可得，使用 childNotes 原顺序');
                }
            } catch (error) { children = []; warnings.push('子位置读取失败，请回源查看'); }
            var facade = {noteId: String(api.field(nativeNote, 'noteId') || ''),
                __positionId: 'position-' + (++serial), __sourceNote: nativeNote,
                __structureWarnings: warnings, __structureDiagnostics: diagnostics, __depth: item.depth, childNotes: [], noteTitle: '', excerptText: ''};
            if (!facade.noteId) facade.__structureWarnings.push('卡片身份无法读取，请回源查看');
            seen.set(value, facade);
            (item.parent ? item.parent.childNotes : roots).push(facade);
            if (item.parent) attached.add(facade);
            records.push({note: facade, depth: item.depth});
            for (var i = children.length - 1; i >= 0; i--) pending.push({value: children[i], parent: facade, depth: item.depth + 1, path: item.path.concat([value])});
            return true;
        }
        function finish() {
            // Fallback MbBookNote trees may have no parentNode. Remove selected
            // descendant roots only by native object identity, preserving other placements.
            roots = roots.filter(function (root) { return !attached.has(root); });
            records.length = 0;
            var queue = roots.map(function (root) { return {note:root,depth:1}; });
            for (var i = 0; i < queue.length; i++) {
                var item = queue[i]; item.note.__depth = item.depth; records.push(item);
                item.note.childNotes.forEach(function (child) { queue.push({note:child,depth:item.depth+1}); });
            }
            return roots;
        }
        return {step: step, records: records, finish: finish};
    }
    return {create: create, node: node, note: note};
}());
