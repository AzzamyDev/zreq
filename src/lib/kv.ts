import { nanoid } from 'nanoid'
import type { KV } from '../types'

/** Missing `enabled` means on (MCP/import often omit the field). */
export function isKvEnabled(pair: { enabled?: boolean }): boolean {
    return pair.enabled !== false
}

/** Normalize a single header/param row to the UI KV shape. */
export function normalizeKV(raw: unknown): KV {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const disabled = row.disabled === true
    const enabled =
        typeof row.enabled === 'boolean' ? row.enabled : !disabled
    return {
        id: typeof row.id === 'string' && row.id.trim() ? row.id : nanoid(),
        key: typeof row.key === 'string' ? row.key : '',
        value: row.value == null ? '' : String(row.value),
        enabled,
    }
}

export function normalizeKvList(list: unknown): KV[] {
    return (Array.isArray(list) ? list : []).map((row) => normalizeKV(row))
}
