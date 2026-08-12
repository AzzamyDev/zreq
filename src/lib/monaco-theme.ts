import type { editor } from 'monaco-editor'

export const ZREQ_MONACO_THEME = 'zreq-dracula'

let themeDefined = false

function readCssVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
}

/** Dracula-ish theme aligned with app CSS variables in index.css. */
export function ensureZreqMonacoTheme(monaco: typeof import('monaco-editor')): void {
    if (themeDefined) return
    themeDefined = true

    const bg = readCssVar('--background', '#282a36')
    const fg = readCssVar('--foreground', '#f8f8f2')
    const muted = readCssVar('--muted-foreground', '#6272a4')
    const orange = readCssVar('--dracula-orange', '#ffb86c')
    const cyan = readCssVar('--dracula-cyan', '#8be9fd')
    const yellow = readCssVar('--dracula-yellow', '#f1fa8c')
    const purple = readCssVar('--dracula-purple', '#bd93f9')
    const green = readCssVar('--dracula-green', '#50fa7b')
    const pink = readCssVar('--dracula-pink', '#ff79c6')
    const red = readCssVar('--destructive', '#ff5555')
    const border = readCssVar('--border', '#44475a')
    const ring = readCssVar('--ring', '#8be9fd')

    monaco.editor.defineTheme(ZREQ_MONACO_THEME, {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'string', foreground: orange.replace('#', '') },
            { token: 'number', foreground: yellow.replace('#', '') },
            { token: 'keyword', foreground: purple.replace('#', '') },
            { token: 'keyword.json', foreground: purple.replace('#', '') },
            { token: 'delimiter', foreground: fg.replace('#', '') },
            { token: 'delimiter.bracket', foreground: fg.replace('#', '') },
            { token: 'operator', foreground: muted.replace('#', '') },
            { token: 'comment', foreground: muted.replace('#', ''), fontStyle: 'italic' },
            { token: 'tag', foreground: pink.replace('#', '') },
            { token: 'attribute.name', foreground: green.replace('#', '') },
            { token: 'attribute.value', foreground: orange.replace('#', '') },
            { token: 'type', foreground: cyan.replace('#', '') },
            { token: 'identifier', foreground: fg.replace('#', '') },
            { token: 'variable', foreground: fg.replace('#', '') },
            { token: 'variable.predefined', foreground: cyan.replace('#', '') },
            { token: 'function', foreground: green.replace('#', '') },
        ],
        colors: {
            'editor.background': bg,
            'editor.foreground': fg,
            'editorLineNumber.foreground': muted,
            'editorLineNumber.activeForeground': fg,
            'editorCursor.foreground': ring,
            'editor.selectionBackground': `${ring}55`,
            'editor.inactiveSelectionBackground': `${ring}33`,
            'editor.lineHighlightBackground': '#00000000',
            'editor.lineHighlightBorder': '#00000000',
            'editorGutter.background': bg,
            'editorIndentGuide.background': `${muted}44`,
            'editorIndentGuide.activeBackground': `${muted}88`,
            'editorWidget.background': readCssVar('--popover', '#343746'),
            'editorWidget.foreground': readCssVar('--popover-foreground', fg),
            'editorWidget.border': border,
            'editorHoverWidget.background': readCssVar('--popover', '#343746'),
            'editorHoverWidget.border': border,
            'editorSuggestWidget.background': readCssVar('--popover', '#343746'),
            'editorSuggestWidget.border': border,
            'editorSuggestWidget.foreground': fg,
            'editorSuggestWidget.selectedBackground': `${cyan}33`,
            'scrollbarSlider.background': `${muted}55`,
            'scrollbarSlider.hoverBackground': `${muted}88`,
            'minimap.background': bg,
            'editorError.foreground': red,
        },
    })

}
export const defaultMonacoEditorOptions: editor.IStandaloneEditorConstructionOptions = {
    theme: ZREQ_MONACO_THEME,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 17,
    tabSize: 4,
    insertSpaces: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: true,
    padding: { top: 0, bottom: 16 },
    lineNumbers: 'on',
    glyphMargin: false,
    folding: false,
    renderLineHighlight: 'none',
    matchBrackets: 'always',
    bracketPairColorization: { enabled: false },
    guides: { indentation: true, bracketPairs: false },
    automaticLayout: true,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
}
