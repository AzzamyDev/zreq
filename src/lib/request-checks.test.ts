import { describe, expect, it } from 'vitest'
import { collectHttpRequests, evaluateChecks, readChecks } from './request-checks'
import type { HttpResponse } from '../types'

const response = (status: number, body: string): HttpResponse => ({
    status,
    statusText: 'OK',
    headers: {},
    body,
    durationMs: 1,
    sizeBytes: body.length,
})

describe('request checks', () => {
    it('passes a status check only when the code matches', () => {
        const checks = readChecks([{ id: 'a', kind: 'status', expected: 200 }])
        expect(evaluateChecks(checks, response(200, ''))[0].pass).toBe(true)
        expect(evaluateChecks(checks, response(404, ''))[0].pass).toBe(false)
    })

    it('matches a JSON value by path, including a list index', () => {
        const checks = readChecks([
            { id: 'b', kind: 'json', path: 'user.id', expected: '7' },
            { id: 'c', kind: 'json', path: 'tags[1]', expected: 'b' },
        ])
        const verdicts = evaluateChecks(checks, response(200, '{"user":{"id":7},"tags":["a","b"]}'))
        expect(verdicts.map((row) => row.pass)).toEqual([true, true])
    })

    it('fails a JSON check when the body is not JSON or the path is missing', () => {
        const checks = readChecks([{ id: 'd', kind: 'json', path: 'data.id', expected: '1' }])
        expect(evaluateChecks(checks, response(200, 'hello'))[0].missing).toBe(true)
        expect(evaluateChecks(checks, response(200, '{"data":{}}'))[0].pass).toBe(false)
    })

    it('lists HTTP requests in folder order and skips WebSocket', () => {
        const rows = collectHttpRequests(
            [
                {
                    id: 'f',
                    type: 'folder',
                    name: 'Auth',
                    items: [
                        {
                            id: 'ws',
                            type: 'request',
                            name: 'Socket',
                            method: 'GET',
                            url: 'wss://example.com',
                            headers: [],
                            params: [],
                            body: { type: 'none', content: '' },
                            auth: { type: 'none' },
                            protocol: 'ws',
                        },
                        {
                            id: 'login',
                            type: 'request',
                            name: 'Login',
                            method: 'POST',
                            url: 'https://example.com/login',
                            headers: [],
                            params: [],
                            body: { type: 'none', content: '' },
                            auth: { type: 'inherit' },
                        },
                    ],
                },
            ],
            4,
        )
        expect(rows.map((row) => row.name)).toEqual(['Login'])
        expect(rows[0].folderId).toBe('f')
        expect(rows[0].collectionId).toBe(4)
    })
})
