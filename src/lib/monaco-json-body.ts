import type * as Monaco from 'monaco-editor'
import { tryFormatJsoncBody } from './format-jsonc-body'
import { attachJsonTemplateFeatures } from './monaco-json-template'
import { updateJsonBodyMarkers, updateJsoncCommentDecorations } from './monaco-jsonc'
import type { VariableSuggestionScope } from './env-resolver'

/** Full JSON body editor feature set: JSONC comments, {{var}} chips, lint markers, format shortcut. */
export function attachJsonBodyFeatures(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
    onFormat?: (formatted: string) => void,
    scope?: VariableSuggestionScope,
): () => void {
    let commentDecorationIds: string[] = []

    const refreshComments = () => {
        commentDecorationIds = updateJsoncCommentDecorations(editor, monaco, commentDecorationIds)
    }

    const refreshMarkers = () => {
        updateJsonBodyMarkers(editor, monaco)
    }

    const onContentChange = editor.onDidChangeModelContent(() => {
        refreshComments()
        refreshMarkers()
    })

    const cleanupTemplate = attachJsonTemplateFeatures(editor, monaco, scope)

    const formatAction = editor.addAction({
        id: 'zreq-format-json',
        label: 'Format JSON',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL],
        run: (ed: Monaco.editor.ICodeEditor) => {
            const result = tryFormatJsoncBody(ed.getModel()?.getValue() ?? '')
            if (!result.ok) return
            const model = ed.getModel()
            if (model) {
                ed.executeEdits('format-json', [
                    { range: model.getFullModelRange(), text: result.formatted },
                ])
            }
            onFormat?.(result.formatted)
            return undefined
        },
    })

    refreshComments()
    refreshMarkers()

    return () => {
        cleanupTemplate()
        onContentChange.dispose()
        formatAction.dispose()
        editor.deltaDecorations(commentDecorationIds, [])
    }
}
