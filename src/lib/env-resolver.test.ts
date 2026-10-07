import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ActiveRequest } from '../types'
import { MOCK_RANDOM_INT_MAX } from './mock-template-vars'
import { getVariableSource, resolveEnvVars, resolveRequest, resolveWebSocketRequest } from './env-resolver'

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

describe('resolveEnvVars mock template variables', () => {
    const fixedMs = 1_700_000_000_123

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(fixedMs)
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        vi.stubGlobal('crypto', {
            randomUUID: () => '11111111-2222-4333-8444-555555555555',
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('resolves each built-in mock', () => {
        expect(resolveEnvVars('t={{$timestamp}}', {})).toBe(`t=${fixedMs}`)
        expect(resolveEnvVars('{{$isoTimestamp}}', {})).toBe(new Date(fixedMs).toISOString())
        expect(resolveEnvVars('{{$guid}}', {})).toBe('11111111-2222-4333-8444-555555555555')
        expect(resolveEnvVars('{{$randomInt}}', {})).toBe(
            String(Math.floor(0.5 * (MOCK_RANDOM_INT_MAX + 1))),
        )
        expect(resolveEnvVars('{{$randomStreetAddress}}', {})).toMatch(/^\d+ \w+ St$/)
    })

    it('leaves unknown {{$x}} literals unchanged', () => {
        expect(resolveEnvVars('{{$notARealMock}}', {})).toBe('{{$notARealMock}}')
    })

    it('coexists with normal env vars', () => {
        expect(resolveEnvVars('{{host}}/{{$timestamp}}', { host: 'api.test' })).toBe(
            `api.test/${fixedMs}`,
        )
        expect(resolveEnvVars('{{$timestamp}} and {{name}}', { name: 'ok' })).toBe(`${fixedMs} and ok`)
    })

    it('does not treat env keys with $ prefix as mocks unless known', () => {
        expect(resolveEnvVars('{{$custom}}', { $custom: 'from-env' })).toBe('{{$custom}}')
        expect(resolveEnvVars('{{custom}}', { custom: 'plain' })).toBe('plain')
    })
})

describe('getVariableSource for mocks', () => {
    it('marks known mocks as mock source', () => {
        expect(getVariableSource('$timestamp')).toBe('mock')
        expect(getVariableSource('$unknownMock')).toBe('none')
    })
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
