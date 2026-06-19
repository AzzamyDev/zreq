import { indentUnit } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'

/** One indent level for pretty-printed JSON (4 spaces — reliable vs `\t` in CodeMirror). */
export const JSON_INDENT = '    '

export const JSON_INDENT_TAB_SIZE = 4

const INDENT_GUIDE_COLOR = 'color-mix(in srgb, var(--muted-foreground) 28%, transparent)'

export const jsonIndentGuideExtensions = indentationMarkers({
    highlightActiveBlock: false,
    markerType: 'fullScope',
    hideFirstIndent: false,
    thickness: 1,
    colors: {
        light: INDENT_GUIDE_COLOR,
        dark: INDENT_GUIDE_COLOR,
        activeLight: INDENT_GUIDE_COLOR,
        activeDark: INDENT_GUIDE_COLOR,
    },
})

export const jsonEditorIndentExtensions: Extension[] = [
    ...jsonIndentGuideExtensions,
    EditorState.tabSize.of(JSON_INDENT_TAB_SIZE),
    indentUnit.of(JSON_INDENT),
]

/** Shared JSON viewer/editor chrome (indent guides, horizontal scroll for long lines). */
export const jsonEditorViewChrome = EditorView.theme({
    '&': { height: '100%', overflow: 'hidden' },
    '.cm-scroller': { overflowX: 'auto', overflowY: 'auto' },
    '.cm-content': {
        paddingTop: '0',
        paddingBottom: '0',
        minWidth: '0',
        maxWidth: '100%',
    },
    '.cm-gutters': {
        flexShrink: '0',
    },
    '.cm-lineNumbers .cm-gutterElement': {
        minWidth: '2.25rem',
        padding: '0 6px 0 4px',
    },
    '.cm-line': {
        whiteSpace: 'pre',
    },
})
