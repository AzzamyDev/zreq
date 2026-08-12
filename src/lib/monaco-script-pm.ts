import type * as Monaco from 'monaco-editor'

export type PmCompletionItem = { label: string; insertText: string }

const COMMON: PmCompletionItem[] = [
    { label: 'pm', insertText: 'pm' },
    { label: 'pm.environment', insertText: 'pm.environment' },
    { label: 'pm.environment.get', insertText: 'pm.environment.get()' },
    { label: 'pm.environment.set', insertText: 'pm.environment.set(, )' },
    { label: 'pm.request', insertText: 'pm.request' },
    { label: 'pm.response', insertText: 'pm.response' },
    { label: 'pm.console', insertText: 'pm.console' },
    { label: 'pm.console.log', insertText: 'pm.console.log()' },
    { label: 'pm.console.info', insertText: 'pm.console.info()' },
    { label: 'pm.console.warn', insertText: 'pm.console.warn()' },
    { label: 'pm.console.error', insertText: 'pm.console.error()' },
]

const POST_EXTRA: PmCompletionItem[] = [
    { label: 'pm.response.status', insertText: 'pm.response.status' },
    { label: 'pm.response.body', insertText: 'pm.response.body' },
    { label: 'pm.response.headers', insertText: 'pm.response.headers' },
    { label: 'pm.response.json', insertText: 'pm.response.json()' },
]

function optionsForVariant(variant: 'pre' | 'post'): PmCompletionItem[] {
    return variant === 'post' ? [...COMMON, ...POST_EXTRA] : [...COMMON]
}

function pmPrefix(line: string, column: number): { from: number; text: string } | null {
    const col = column - 1
    let start = col
    while (start > 0 && /[\w.]/.test(line[start - 1]!)) start -= 1
    const text = line.slice(start, col)
    if (!text.startsWith('pm')) return null
    return { from: start + 1, text }
}

export function attachScriptPmCompletion(
    monaco: typeof import('monaco-editor'),
    variant: 'pre' | 'post',
    describe: (label: string) => string | undefined,
): Monaco.IDisposable {
    const opts = optionsForVariant(variant)
    return monaco.languages.registerCompletionItemProvider('javascript', {
        triggerCharacters: ['.'],
        provideCompletionItems(
            model: Monaco.editor.ITextModel,
            position: Monaco.Position,
        ) {
            const line = model.getLineContent(position.lineNumber)
            const pm = pmPrefix(line, position.column)
            if (!pm) return { suggestions: [] }
            const filtered = opts.filter((o) => o.label.startsWith(pm.text))
            if (filtered.length === 0) return { suggestions: [] }
            return {
                suggestions: filtered.map((o) => ({
                    label: o.label,
                    kind: monaco.languages.CompletionItemKind.Function,
                    detail: describe(o.label),
                    insertText: o.insertText,
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: pm.from,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                    },
                })),
            }
        },
    })
}
