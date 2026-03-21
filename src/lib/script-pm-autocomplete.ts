import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Text } from '@codemirror/state'

export type PmCompletionItem = { label: string; apply: string }

const COMMON: PmCompletionItem[] = [
    { label: 'pm', apply: 'pm' },
    { label: 'pm.environment', apply: 'pm.environment' },
    { label: 'pm.environment.get', apply: 'pm.environment.get()' },
    { label: 'pm.environment.set', apply: 'pm.environment.set(, )' },
    { label: 'pm.request', apply: 'pm.request' },
    { label: 'pm.response', apply: 'pm.response' },
    { label: 'pm.console', apply: 'pm.console' },
    { label: 'pm.console.log', apply: 'pm.console.log()' },
    { label: 'pm.console.info', apply: 'pm.console.info()' },
    { label: 'pm.console.warn', apply: 'pm.console.warn()' },
    { label: 'pm.console.error', apply: 'pm.console.error()' },
]

const POST_EXTRA: PmCompletionItem[] = [
    { label: 'pm.response.status', apply: 'pm.response.status' },
    { label: 'pm.response.body', apply: 'pm.response.body' },
    { label: 'pm.response.headers', apply: 'pm.response.headers' },
    { label: 'pm.response.json', apply: 'pm.response.json()' },
]

function optionsForVariant(variant: 'pre' | 'post'): PmCompletionItem[] {
    return variant === 'post' ? [...COMMON, ...POST_EXTRA] : [...COMMON]
}

/** Identifier / dotted path ending at cursor, only if it starts with `pm`. */
function pmPrefix(doc: Text, pos: number): { from: number; text: string } | null {
    const line = doc.lineAt(pos)
    const col = pos - line.from
    const lt = line.text
    let start = col
    while (start > 0 && /[\w.]/.test(lt[start - 1]!)) start -= 1
    const text = lt.slice(start, col)
    if (!text.startsWith('pm')) return null
    return { from: line.from + start, text }
}

function pmCompletionSource(
    variant: 'pre' | 'post',
    describe: (label: string) => string | undefined
) {
    const opts = optionsForVariant(variant)
    return (context: CompletionContext): CompletionResult | null => {
        const pm = pmPrefix(context.state.doc, context.pos)
        if (!pm) return null
        const { from, text } = pm
        if (!context.explicit && text.length < 2) return null
        const filtered = opts.filter((o) => o.label.startsWith(text))
        if (filtered.length === 0) return null
        return {
            from,
            options: filtered.map((o) => ({
                label: o.label,
                apply: o.apply,
                type: 'function' as const,
                detail: describe(o.label),
            })),
        }
    }
}

export function scriptPmAutocompletion(
    variant: 'pre' | 'post',
    describe: (label: string) => string | undefined
) {
    return autocompletion({
        override: [pmCompletionSource(variant, describe)],
        activateOnTyping: true,
        maxRenderedOptions: 48,
    })
}
