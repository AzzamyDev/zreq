import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { javascriptLanguage } from '@codemirror/lang-javascript'
import { jsonLanguage } from '@codemirror/lang-json'
import { EditorView, tooltips } from '@codemirror/view'
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
            caretColor: 'var(--foreground)',
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
            zIndex: 400,
            backgroundColor: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 4px 14px color-mix(in srgb, var(--foreground) 12%, transparent)',
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

/** Mount tooltips on `document.body` so completion/hover are not clipped by `overflow-hidden` parents. */
export const appCodeMirrorBodyTooltips = tooltips({
    parent: typeof document !== 'undefined' ? document.body : undefined,
})
