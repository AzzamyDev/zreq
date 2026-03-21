import { applyEdits, format } from 'jsonc-parser'

/** Pretty-print JSONC (2 spaces); keeps line/block comments and `{{var}}` inside strings. */
export function formatJsoncPreserveComments(text: string): string {
    const edits = format(text, undefined, {
        tabSize: 2,
        insertSpaces: true,
        insertFinalNewline: false,
    })
    return applyEdits(text, edits)
}
