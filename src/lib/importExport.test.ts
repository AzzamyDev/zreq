import { describe, expect, it } from 'vitest'
import { importEnvironments } from './importExport'

describe('importEnvironments', () => {
    it('parses Postman single environment', () => {
        const json = JSON.stringify({
            name: 'My API',
            values: [
                { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
                { key: 'token', value: 'secret', disabled: true },
            ],
        })
        const result = importEnvironments(json)
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('My API')
        expect(result[0].variables).toEqual([
            { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
            { key: 'token', value: 'secret', enabled: false },
        ])
    })

    it('parses ZReq single environment export', () => {
        const json = JSON.stringify({
            zreq: true,
            version: 1,
            type: 'environment',
            environment: {
                name: 'Staging',
                variables: [{ key: 'host', value: 'staging.local', enabled: true }],
            },
        })
        const result = importEnvironments(json)
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('Staging')
        expect(result[0].variables[0].key).toBe('host')
    })

    it('parses ZReq environments bundle', () => {
        const json = JSON.stringify({
            zreq: true,
            version: 1,
            type: 'environments',
            environments: [
                { name: 'A', variables: [{ key: 'x', value: '1', enabled: true }] },
                { name: 'B', variables: [{ key: 'y', value: '2', enabled: true }] },
            ],
        })
        const result = importEnvironments(json)
        expect(result).toHaveLength(2)
        expect(result.map((e) => e.name)).toEqual(['A', 'B'])
    })

    it('parses plain .env file', () => {
        const env = 'FOO=bar\n# comment\nBAZ=qux\n'
        const result = importEnvironments(env)
        expect(result).toHaveLength(1)
        expect(result[0].variables).toEqual([
            { key: 'FOO', value: 'bar', enabled: true },
            { key: 'BAZ', value: 'qux', enabled: true },
        ])
    })

    it('parses .env with export prefix', () => {
        const env = 'export API_KEY=abc123\n'
        const result = importEnvironments(env)
        expect(result[0].variables[0]).toEqual({ key: 'API_KEY', value: 'abc123', enabled: true })
    })

    it('throws on empty JSON array', () => {
        expect(() => importEnvironments('[]')).toThrow(/No environments found/)
    })
})
