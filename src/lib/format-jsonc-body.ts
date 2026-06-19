import { applyEdits, format } from 'jsonc-parser'
import { JSON_INDENT_TAB_SIZE } from './json-codemirror-setup'
import { stripJsonComments } from './strip-json-comments'

/** Pretty-print JSONC (4 spaces); keeps line/block comments and `{{var}}` inside strings. */
export function formatJsoncPreserveComments(text: string): string {
    const edits = format(text, undefined, {
        tabSize: JSON_INDENT_TAB_SIZE,
        insertSpaces: true,
        insertFinalNewline: false,
    })
    return applyEdits(text, edits)
}

export type FormatJsoncResult =
    | { ok: true; formatted: string }
    | { ok: false; reason: 'empty' | 'invalid' }

/** Validate JSONC (comments stripped) then pretty-print; safe for UI actions and editor keymaps. */
export function tryFormatJsoncBody(text: string): FormatJsoncResult {
    const raw = text ?? ''
    if (!raw.trim()) return { ok: false, reason: 'empty' }
    try {
        JSON.parse(stripJsonComments(raw))
    } catch {
        return { ok: false, reason: 'invalid' }
    }
    try {
        return { ok: true, formatted: formatJsoncPreserveComments(raw) }
    } catch {
        return { ok: false, reason: 'invalid' }
    }
}
