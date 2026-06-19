import { describe, expect, it } from 'vitest'
import type { KV } from '../types'
import {
    composeUrl,
    normalizeRequestQuery,
    parseQueryString,
    parseUrlToParams,
    splitUrlQuery,
} from './query-params'

const kv = (key: string, value: string, enabled = true, id?: string): KV => ({
    id: id ?? key,
    key,
    value,
    enabled,
})

describe('splitUrlQuery', () => {
    it('splits base URL and query string', () => {
        expect(splitUrlQuery('{{BaseUrl}}/auth/me?id=1&name=test')).toEqual({
            baseUrl: '{{BaseUrl}}/auth/me',
            queryString: 'id=1&name=test',
        })
    })

    it('does not treat ? inside {{var}} as query start', () => {
        expect(splitUrlQuery('{{BaseUrl?}}/path')).toEqual({
            baseUrl: '{{BaseUrl?}}/path',
            queryString: '',
        })
    })

    it('keeps hash on base URL', () => {
        expect(splitUrlQuery('/path?a=1#section')).toEqual({
            baseUrl: '/path#section',
            queryString: 'a=1',
        })
    })

    it('returns full URL when no query', () => {
        expect(splitUrlQuery('https://api.example.com/users')).toEqual({
            baseUrl: 'https://api.example.com/users',
            queryString: '',
        })
    })
})

describe('parseQueryString', () => {
    it('parses key=value pairs', () => {
        expect(parseQueryString('id=1&name=test')).toEqual([
            { key: 'id', value: '1' },
            { key: 'name', value: 'test' },
        ])
    })

    it('supports keys without values', () => {
        expect(parseQueryString('debug')).toEqual([{ key: 'debug', value: '' }])
    })

    it('decodes encoded values', () => {
        expect(parseQueryString('q=hello%20world')).toEqual([{ key: 'q', value: 'hello world' }])
    })
})

describe('composeUrl', () => {
    it('appends enabled params to base URL', () => {
        expect(
            composeUrl('{{BaseUrl}}/auth/me', [kv('id', '1'), kv('name', 'test')]),
        ).toBe('{{BaseUrl}}/auth/me?id=1&name=test')
    })

    it('omits disabled params', () => {
        expect(
            composeUrl('/path', [kv('id', '1', true), kv('hidden', 'x', false)]),
        ).toBe('/path?id=1')
    })

    it('returns base when no enabled params', () => {
        expect(composeUrl('/path', [kv('', 'x'), kv('a', '1', false)])).toBe('/path')
    })
})

describe('parseUrlToParams', () => {
    it('extracts params from URL and removes ones not in query', () => {
        const existing = [kv('id', '1', true, 'keep-id'), kv('removed', 'x', true, 'gone')]
        const { baseUrl, params } = parseUrlToParams('{{BaseUrl}}/me?id=2', existing)
        expect(baseUrl).toBe('{{BaseUrl}}/me')
        expect(params).toHaveLength(1)
        expect(params[0]).toMatchObject({ id: 'keep-id', key: 'id', value: '2', enabled: true })
    })

    it('creates new params with fresh ids', () => {
        const { params } = parseUrlToParams('/path?page=2', [])
        expect(params).toEqual([
            expect.objectContaining({ key: 'page', value: '2', enabled: true }),
        ])
        expect(params[0].id).toBeTruthy()
    })
})

describe('roundtrip', () => {
    it('compose then parse preserves base and params', () => {
        const base = '{{BaseUrl}}/auth/me'
        const params = [kv('id', '1'), kv('name', 'test')]
        const full = composeUrl(base, params)
        const parsed = parseUrlToParams(full, params)
        expect(parsed.baseUrl).toBe(base)
        expect(parsed.params.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled }))).toEqual(
            params.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled })),
        )
    })
})

describe('normalizeRequestQuery', () => {
    it('merges URL query into existing params without overwriting', () => {
        const normalized = normalizeRequestQuery({
            url: '/path?b=2&c=3',
            params: [kv('a', '1'), kv('b', 'from-tab')],
        })
        expect(normalized.url).toBe('/path')
        expect(normalized.params).toHaveLength(3)
        expect(normalized.params.find((p) => p.key === 'a')?.value).toBe('1')
        expect(normalized.params.find((p) => p.key === 'b')?.value).toBe('from-tab')
        expect(normalized.params.find((p) => p.key === 'c')?.value).toBe('3')
    })

    it('returns unchanged when URL has no query', () => {
        const params = [kv('a', '1')]
        expect(normalizeRequestQuery({ url: '/path', params })).toEqual({
            url: '/path',
            params,
        })
    })
})
