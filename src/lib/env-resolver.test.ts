import { describe, expect, it, vi } from 'vitest'
import type { ActiveRequest } from '../types'
import { resolveRequest, resolveWebSocketRequest } from './env-resolver'

vi.mock('../store', () => ({
    useAppStore: {
        getState: () => ({
            environments: [],
            activeEnvironmentId: null,
            collections: [],
            activeRequest: {},
        }),
    },
}))

const baseRequest = (): ActiveRequest => ({
    method: 'GET',
    url: 'https://api.example.com/items',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    auth: { type: 'none' },
    name: 'Test',
})

describe('resolveRequest apikey auth', () => {
    it('adds API key to headers when addTo is header', () => {
        const req: ActiveRequest = {
            ...baseRequest(),
            auth: { type: 'apikey', key: 'X-API-Key', value: 'secret-123', addTo: 'header' },
        }
        const resolved = resolveRequest(req, {})
        expect(resolved.headers['X-API-Key']).toBe('secret-123')
        expect(resolved.url).toBe('https://api.example.com/items')
    })

    it('appends API key to query string when addTo is query', () => {
        const req: ActiveRequest = {
            ...baseRequest(),
            auth: { type: 'apikey', key: 'api_key', value: 'my value', addTo: 'query' },
        }
        const resolved = resolveRequest(req, {})
        expect(resolved.headers['api_key']).toBeUndefined()
        expect(resolved.url).toBe('https://api.example.com/items?api_key=my%20value')
    })

    it('resolves {{var}} in key and value', () => {
        const req: ActiveRequest = {
            ...baseRequest(),
            auth: { type: 'apikey', key: '{{hdr}}', value: '{{tok}}', addTo: 'header' },
        }
        const resolved = resolveRequest(req, { hdr: 'X-Custom', tok: 'resolved' })
        expect(resolved.headers['X-Custom']).toBe('resolved')
    })

    it('defaults addTo to header when omitted', () => {
        const req: ActiveRequest = {
            ...baseRequest(),
            auth: { type: 'apikey', key: 'key', value: 'v', addTo: 'header' },
        }
        const resolved = resolveRequest(req, {})
        expect(resolved.headers['key']).toBe('v')
    })
})

describe('resolveWebSocketRequest apikey auth', () => {
    it('appends API key to WebSocket URL query', () => {
        const req: ActiveRequest = {
            ...baseRequest(),
            protocol: 'ws',
            url: 'wss://echo.example.com/socket',
            auth: { type: 'apikey', key: 'token', value: 'abc', addTo: 'query' },
        }
        const resolved = resolveWebSocketRequest(req, {})
        expect(resolved.url).toBe('wss://echo.example.com/socket?token=abc')
    })
})
