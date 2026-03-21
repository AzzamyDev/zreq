import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { javascriptLanguage } from '@codemirror/lang-javascript'
import { jsonLanguage } from '@codemirror/lang-json'
import { RangeSetBuilder, type Extension, type Text } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate, tooltips } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/**
 * Shared CodeMirror chrome for the app: follows CSS variables in `index.css` (dark / future themes).
 * Use with @uiw/react-codemirror `theme="none"` so the default light (#fff) theme is not applied.
 * `dark: false` keeps styles active under uiw’s “light” color facet.
 */
export const appCodeMirrorChromeTheme = EditorView.theme(
    {
        '&': { backgroundColor: 'var(--card)', color: 'var(--foreground)' },
        '.cm-scroller': {
            backgroundColor: 'var(--card)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
            lineHeight: '1.55',
        },
        '.cm-content': {
            paddingTop: '8px',
            paddingBottom: '12px',
            caretColor: 'var(--ring)',
        },
        '&.cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor': {
            borderLeft: '2px solid var(--ring)',
            marginLeft: '-1px',
        },
        '.cm-dropCursor': {
            borderLeft: '2px solid var(--ring)',
            marginLeft: '-1px',
        },
        '.cm-gutters': {
            backgroundColor: 'var(--muted)',
            color: 'var(--muted-foreground)',
            border: 'none',
            borderRight: '1px solid var(--border)',
        },
        '.cm-lineNumbers .cm-gutterElement': {
            minWidth: '2.5rem',
            padding: '0 10px 0 8px',
            textAlign: 'right',
        },
        '.cm-activeLineGutter': {
            backgroundColor: 'color-mix(in srgb, var(--foreground) 6%, transparent)',
        },
        '.cm-activeLine': {
            backgroundColor: 'color-mix(in srgb, var(--foreground) 5%, transparent)',
        },
        '.cm-foldGutter .cm-gutterElement': { color: 'var(--muted-foreground)' },
        '.cm-selectionBackground': {
            background: 'color-mix(in srgb, var(--ring) 32%, transparent) !important',
        },
        '&.cm-focused .cm-selectionBackground': {
            background: 'color-mix(in srgb, var(--ring) 40%, transparent) !important',
        },
        '.cm-lintGutter .cm-gutterElement': { color: 'var(--muted-foreground)' },
        '.cm-tooltip': {
            zIndex: 20050,
            backgroundColor: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow:
                '0 10px 38px color-mix(in srgb, #000 50%, transparent), 0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent)',
        },
        '.cm-tooltip.cm-tooltip-lint': {
            maxWidth: 'min(90vw, 28rem)',
        },
        '.cm-tooltip.cm-completionInfo': {
            maxWidth: 'min(90vw, 20rem)',
            fontSize: '11px',
            lineHeight: 1.45,
        },
        '.cm-completionList': {
            maxHeight: 'min(40vh, 12rem)',
        },
        '.cm-completionMatched': {
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
        },
        '.cm-completionDetail': {
            color: 'var(--muted-foreground)',
            fontSize: '10px',
            marginLeft: '4px',
        },
    },
    { dark: false },
)

const appJsonHighlight = HighlightStyle.define(
    [
        { tag: t.propertyName, color: 'var(--dracula-cyan)' },
        { tag: t.attributeName, color: 'var(--dracula-cyan)' },
        { tag: t.string, color: 'var(--dracula-orange)' },
        { tag: t.number, color: 'var(--dracula-yellow)' },
        { tag: t.bool, color: 'var(--dracula-purple)' },
        { tag: t.null, color: 'var(--dracula-purple)' },
        { tag: t.keyword, color: 'var(--dracula-purple)' },
        { tag: t.bracket, color: 'var(--foreground)' },
        { tag: t.separator, color: 'var(--muted-foreground)' },
        { tag: t.punctuation, color: 'var(--muted-foreground)' },
        { tag: t.operator, color: 'var(--muted-foreground)' },
    ],
    { scope: jsonLanguage },
)

/** JSON syntax colors (request body, response body, etc.). */
export const appJsonSyntaxHighlight = syntaxHighlighting(appJsonHighlight)

const jsoncCommentMark = Decoration.mark({ class: 'cm-jsonc-comment' })

/** Ranges for line (// … eol) and block (slash-star …) comments outside JSON strings; matches strip rules when sending. */
export function findJsoncCommentRanges(doc: Text): { from: number; to: number }[] {
    const ranges: { from: number; to: number }[] = []
    const n = doc.length
    if (n === 0) return ranges

    const s = doc.sliceString(0, n)
    let inString = false
    let escape = false
    let inBlock = false
    let blockStart = 0
    let pos = 0

    while (pos < n) {
        const c = s[pos]!
        const next = pos + 1 < n ? s[pos + 1]! : ''

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
            const line = doc.lineAt(pos)
            ranges.push({ from: pos, to: line.to })
            pos = line.to
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

function buildJsoncCommentDecorationSet(doc: Text): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    for (const r of findJsoncCommentRanges(doc)) {
        if (r.from < r.to) builder.add(r.from, r.to, jsoncCommentMark)
    }
    return builder.finish()
}

const jsoncCommentViewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet
        constructor(view: EditorView) {
            this.decorations = buildJsoncCommentDecorationSet(view.state.doc)
        }
        update(u: ViewUpdate) {
            if (u.docChanged) this.decorations = buildJsoncCommentDecorationSet(u.state.doc)
        }
    },
    { decorations: (v) => v.decorations },
)

/** Gray italic styling is in `index.css` (!important over syntax tokens). */
export const jsoncCommentDecorations: Extension[] = [jsoncCommentViewPlugin]

const appJsHighlight = HighlightStyle.define(
    [
        { tag: t.keyword, color: 'var(--dracula-purple)' },
        { tag: t.string, color: 'var(--dracula-orange)' },
        { tag: t.regexp, color: 'var(--dracula-red)' },
        { tag: t.number, color: 'var(--dracula-yellow)' },
        { tag: t.bool, color: 'var(--dracula-purple)' },
        { tag: t.null, color: 'var(--dracula-purple)' },
        { tag: t.lineComment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
        { tag: t.blockComment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
        { tag: t.variableName, color: 'var(--foreground)' },
        { tag: t.propertyName, color: 'var(--dracula-cyan)' },
        { tag: t.attributeName, color: 'var(--dracula-cyan)' },
        { tag: t.function(t.variableName), color: 'var(--dracula-green)' },
        { tag: t.className, color: 'var(--dracula-cyan)' },
        { tag: t.operator, color: 'var(--dracula-pink)' },
        { tag: t.punctuation, color: 'var(--muted-foreground)' },
        { tag: t.bracket, color: 'var(--foreground)' },
        { tag: t.paren, color: 'var(--foreground)' },
        { tag: t.brace, color: 'var(--foreground)' },
    ],
    { scope: javascriptLanguage },
)

/** JavaScript syntax (pre/post request scripts). */
export const appJavaScriptSyntaxHighlight = syntaxHighlighting(appJsHighlight)

const CM_TOOLTIP_HOST_ID = 'postwoman-cm-tooltip-host'

/**
 * CodeMirror's `tooltips({ parent })` appends a `position: relative` wrapper to `parent`.
 * Using `document.body` makes that wrapper a **flow** sibling of `#root`, which breaks the
 * `height: 100%` shell (layout compresses / spurious scroll when hovers open).
 * A fixed 0×0 host removes the wrapper from normal flow while still allowing unclipped tooltips.
 */
function ensureCmTooltipHost(): HTMLElement | undefined {
    if (typeof document === 'undefined' || !document.body) return undefined
    let el = document.getElementById(CM_TOOLTIP_HOST_ID) as HTMLElement | null
    if (!el) {
        el = document.createElement('div')
        el.id = CM_TOOLTIP_HOST_ID
        el.setAttribute('aria-hidden', 'true')
        Object.assign(el.style, {
            position: 'fixed',
            inset: '0',
            width: '0',
            height: '0',
            margin: '0',
            padding: '0',
            border: 'none',
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: '20000',
        })
        document.body.appendChild(el)
    }
    return el
}

/** Mount tooltips outside overflow-hidden panels without affecting `#root` height. */
export const appCodeMirrorBodyTooltips = tooltips({
    parent: ensureCmTooltipHost(),
})
