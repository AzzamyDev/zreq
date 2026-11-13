import { describe, expect, it } from 'vitest'
import { clearHistory, loadHistory, recordSentRequest, removeHistoryEntry, type HistoryStore } from './request-history'

function memoryStore(): HistoryStore {
    const data = new Map<string, string>()
    return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value)
        },
    }
}

const sample = {
    name: 'List items',
    method: 'GET' as const,
    url: 'https://example.com/items',
    headers: [],
    params: [],
    body: { type: 'none' as const, content: '' },
    auth: { type: 'none' as const },
    status: 200,
    statusText: 'OK',
    durationMs: 12,
}

describe('request history', () => {
    it('keeps newest requests first for one workspace', () => {
        const store = memoryStore()
        recordSentRequest(4, sample, store)
        recordSentRequest(4, { ...sample, url: 'https://example.com/other', status: 404 }, store)
        recordSentRequest(9, { ...sample, url: 'https://other.example/ws' }, store)

        const rows = loadHistory(4, store)
        expect(rows.map((row) => row.url)).toEqual(['https://example.com/other', 'https://example.com/items'])
        expect(loadHistory(9, store)).toHaveLength(1)
    })

    it('removes one entry and can clear a workspace', () => {
        const store = memoryStore()
        const saved = recordSentRequest(1, sample, store)
        expect(saved).not.toBeNull()
        removeHistoryEntry(1, saved!.id, store)
        expect(loadHistory(1, store)).toEqual([])
        recordSentRequest(1, sample, store)
        clearHistory(1, store)
        expect(loadHistory(1, store)).toEqual([])
    })

    it('ignores a blank URL', () => {
        const store = memoryStore()
        expect(recordSentRequest(1, { ...sample, url: '   ' }, store)).toBeNull()
        expect(loadHistory(1, store)).toEqual([])
    })
})
