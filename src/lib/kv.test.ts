import { describe, expect, it } from 'vitest'
import { isKvEnabled, normalizeKV, normalizeKvList } from './kv'

describe('isKvEnabled', () => {
    it('treats missing enabled as on', () => {
        expect(isKvEnabled({})).toBe(true)
        expect(isKvEnabled({ enabled: undefined })).toBe(true)
    })

    it('respects explicit boolean', () => {
        expect(isKvEnabled({ enabled: true })).toBe(true)
        expect(isKvEnabled({ enabled: false })).toBe(false)
    })
})

describe('normalizeKV', () => {
    it('defaults enabled true and fills id/key/value', () => {
        const row = normalizeKV({ key: 'Accept', value: 'application/json' })
        expect(row).toMatchObject({ key: 'Accept', value: 'application/json', enabled: true })
        expect(row.id).toBeTruthy()
    })

    it('preserves explicit enabled false', () => {
        expect(normalizeKV({ key: 'x', value: '1', enabled: false }).enabled).toBe(false)
    })

    it('maps Postman disabled to enabled false', () => {
        expect(normalizeKV({ key: 'x', value: '1', disabled: true }).enabled).toBe(false)
    })

    it('keeps existing id', () => {
        expect(normalizeKV({ id: 'keep', key: 'a', value: '' }).id).toBe('keep')
    })
})

describe('normalizeKvList', () => {
    it('returns empty for non-arrays', () => {
        expect(normalizeKvList(undefined)).toEqual([])
        expect(normalizeKvList(null)).toEqual([])
    })

    it('normalizes each row', () => {
        const list = normalizeKvList([{ key: 'a', value: '1' }, { key: 'b', value: '2', enabled: false }])
        expect(list).toHaveLength(2)
        expect(list[0]).toMatchObject({ key: 'a', value: '1', enabled: true })
        expect(list[1]).toMatchObject({ key: 'b', value: '2', enabled: false })
    })
})
