import { describe, expect, it } from 'vitest'
import { parseCurl } from './curl-import'

describe('parseCurl', () => {
    it('reads a simple GET', () => {
        const parsed = parseCurl('curl https://example.com/items')
        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.draft.method).toBe('GET')
        expect(parsed.draft.url).toBe('https://example.com/items')
        expect(parsed.draft.body.type).toBe('none')
    })

    it('reads method, json body, and headers across continued lines', () => {
        const parsed = parseCurl(`curl -X POST https://example.com/items \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json' \\
  --data-raw '{"name":"Ada"}'`)
        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.draft.method).toBe('POST')
        expect(parsed.draft.body.type).toBe('json')
        expect(parsed.draft.body.content).toBe('{"name":"Ada"}')
        expect(parsed.draft.headers.map((header) => header.key)).toEqual(['Content-Type', 'Accept'])
    })

    it('turns form data into urlencoded rows and basic auth', () => {
        const parsed = parseCurl(`curl -u 'ada:secret' --data 'name=Ada&city=Bali' https://example.com/form`)
        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.draft.method).toBe('POST')
        expect(parsed.draft.auth).toEqual({ type: 'basic', username: 'ada', password: 'secret' })
        expect(parsed.draft.body.type).toBe('urlencoded')
        expect(JSON.parse(parsed.draft.body.content)).toEqual([
            { id: 'p1', key: 'name', value: 'Ada', enabled: true },
            { id: 'p2', key: 'city', value: 'Bali', enabled: true },
        ])
    })

    it('keeps an explicit authorization header instead of basic auth', () => {
        const parsed = parseCurl(`curl -u ada:secret -H 'Authorization: Bearer tok' https://example.com`)
        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.draft.auth).toEqual({ type: 'none' })
        expect(parsed.draft.headers.some((header) => header.key === 'Authorization')).toBe(true)
    })

    it('moves -G data onto the query string', () => {
        const parsed = parseCurl(`curl -G -d 'q=hello world' https://example.com/search`)
        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.draft.method).toBe('GET')
        expect(parsed.draft.url).toBe('https://example.com/search?q=hello world')
        expect(parsed.draft.body.type).toBe('none')
    })

    it('rejects a command with no URL', () => {
        expect(parseCurl('curl -X POST')).toEqual({ ok: false, error: 'no-url' })
        expect(parseCurl('   ')).toEqual({ ok: false, error: 'empty' })
    })
})
