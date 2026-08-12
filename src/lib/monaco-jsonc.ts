import type * as Monaco from 'monaco-editor'
import { stripJsonComments } from './strip-json-comments'

/** Ranges for line (// … eol) and block (slash-star …) comments outside JSON strings. */
export function findJsoncCommentRanges(text: string): { from: number; to: number }[] {
    const ranges: { from: number; to: number }[] = []
    const n = text.length
    if (n === 0) return ranges

    let inString = false
    let escape = false
    let inBlock = false
    let blockStart = 0
    let pos = 0

    while (pos < n) {
        const c = text[pos]!
        const next = pos + 1 < n ? text[pos + 1]! : ''

        if (inBlock) {
            if (c === '*' && next === '/') {
                ranges.push({ from: blockStart, to: pos + 2 })
                inBlock = false
                pos += 2
            } else {
                pos += 1
            }
            continue
        }

        if (escape) {
            escape = false
            pos++
            continue
        }
        if (inString) {
            if (c === '\\') escape = true
            else if (c === '"') inString = false
            pos++
            continue
        }

        if (c === '"') {
            inString = true
            pos++
            continue
        }

        if (c === '/' && next === '/') {
            let end = pos + 2
            while (end < n && text[end] !== '\n') end++
            ranges.push({ from: pos, to: end })
            pos = end
            continue
        }

        if (c === '/' && next === '*') {
            inBlock = true
            blockStart = pos
            pos += 2
            continue
        }

        pos++
    }

    if (inBlock) ranges.push({ from: blockStart, to: n })
    return ranges
}

export function updateJsoncCommentDecorations(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
    decorationIds: string[],
): string[] {
    const model = editor.getModel()
    if (!model) return decorationIds
    const text = model.getValue()
    const decorations = findJsoncCommentRanges(text).map((r) => {
        const start = model.getPositionAt(r.from)
        const end = model.getPositionAt(r.to)
        return {
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            options: { inlineClassName: 'monaco-jsonc-comment' },
        }
    })
    return editor.deltaDecorations(decorationIds, decorations)
}

export function updateJsonBodyMarkers(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
): void {
    const model = editor.getModel()
    if (!model) return
    const text = model.getValue()
    if (!text.trim()) {
        monaco.editor.setModelMarkers(model, 'json-body', [])
        return
    }
    try {
        JSON.parse(stripJsonComments(text))
        monaco.editor.setModelMarkers(model, 'json-body', [])
    } catch (e) {
        monaco.editor.setModelMarkers(model, 'json-body', [
            {
                severity: monaco.MarkerSeverity.Error,
                message: (e as Error).message,
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: model.getLineCount(),
                endColumn: model.getLineMaxColumn(model.getLineCount()),
            },
        ])
    }
}
