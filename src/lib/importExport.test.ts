import { describe, expect, it } from 'vitest'
import {
    convertHoppscotchTemplates,
    importCollections,
    importEnvironments,
} from './importExport'

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

    it('parses Hoppscotch environment with currentValue and template conversion', () => {
        const json = JSON.stringify({
            id: 'hoppscotch-env-test',
            v: 2,
            name: 'Consdoc (Local)',
            variables: [
                {
                    key: 'base_url',
                    secret: false,
                    initialValue: 'http://127.0.0.1:3000',
                    currentValue: 'http://127.0.0.1:3000',
                },
                {
                    key: 'service_auth',
                    secret: false,
                    initialValue: '<<base_url>>/auth',
                    currentValue: '<<base_url>>/auth',
                },
            ],
        })
        const result = importEnvironments(json, 'hoppscotch')
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('Consdoc (Local)')
        expect(result[0].variables[0]).toEqual({
            key: 'base_url',
            value: 'http://127.0.0.1:3000',
            enabled: true,
        })
        expect(result[0].variables[1]).toEqual({
            key: 'service_auth',
            value: '{{base_url}}/auth',
            enabled: true,
        })
    })

    it('throws when Hoppscotch env imported as Postman', () => {
        const json = JSON.stringify({
            v: 2,
            name: 'Hoppscotch Env',
            variables: [{ key: 'x', currentValue: '1', initialValue: '1' }],
        })
        expect(() => importEnvironments(json, 'postman')).toThrow(/Postman environment format/)
    })
})

describe('convertHoppscotchTemplates', () => {
    it('converts <<var>> to {{var}}', () => {
        expect(convertHoppscotchTemplates('<<service_auth>>/users/login')).toBe(
            '{{service_auth}}/users/login'
        )
    })
})

describe('importCollections hoppscotch', () => {
    const tesCollection = {
        v: 11,
        id: 'cmsqc5dl8000t2cme2lw0e18b',
        name: 'Tes Collection',
        folders: [
            {
                v: 11,
                id: 'cmsqc5jge000u2cme2c7mfekk',
                name: 'Folder 1',
                folders: [],
                requests: [
                    {
                        v: '17',
                        name: 'Request 1',
                        method: 'GET',
                        endpoint: 'https://echo.hoppscotch.io',
                        params: [],
                        headers: [],
                        preRequestScript: '',
                        testScript: '',
                        auth: { authType: 'inherit', authActive: true },
                        body: { contentType: null, body: null },
                        requestVariables: [],
                        responses: {},
                        description: null,
                    },
                ],
                auth: { authType: 'inherit', authActive: true },
                headers: [],
                variables: [],
                description: null,
            },
        ],
        requests: [],
        auth: { authType: 'inherit', authActive: true },
        headers: [],
        variables: [],
        description: null,
    }

    it('parses Tes Collection.json shape', () => {
        const result = importCollections(JSON.stringify(tesCollection), 'hoppscotch')
        expect(result).toHaveLength(1)
        expect(result[0].name).toBe('Tes Collection')
        expect(result[0].items).toHaveLength(1)
        const folder = result[0].items[0]
        expect(folder.type).toBe('folder')
        expect(folder.name).toBe('Folder 1')
        if (folder.type !== 'folder') return
        expect(folder.items).toHaveLength(1)
        const req = folder.items[0]
        expect(req.type).toBe('request')
        if (req.type !== 'request') return
        expect(req.method).toBe('GET')
        expect(req.url).toBe('https://echo.hoppscotch.io')
        expect(req.auth).toEqual({ type: 'inherit' })
        expect(req.body).toEqual({ type: 'none', content: '' })
    })

    it('maps JSON body and converts endpoint templates', () => {
        const collection = {
            v: 11,
            name: 'API',
            folders: [],
            requests: [
                {
                    name: 'User Login',
                    method: 'POST',
                    endpoint: '<<service_auth>>/users/login',
                    params: [],
                    headers: [
                        { key: 'Content-Type', value: 'application/json', active: true },
                    ],
                    auth: { authType: 'inherit', authActive: true },
                    body: {
                        contentType: 'application/json',
                        body: '{\n  "email": "test@example.com"\n}',
                    },
                },
            ],
        }
        const result = importCollections(JSON.stringify(collection), 'hoppscotch')
        const req = result[0].items[0]
        if (req.type !== 'request') return
        expect(req.url).toBe('{{service_auth}}/users/login')
        expect(req.body.type).toBe('json')
        expect(req.body.content).toContain('test@example.com')
        expect(req.headers[0].key).toBe('Content-Type')
    })

    it('maps multipart form-data body', () => {
        const collection = {
            v: 11,
            name: 'Upload',
            folders: [],
            requests: [
                {
                    name: 'Upload Signature',
                    method: 'POST',
                    endpoint: '<<service_auth>>/users/me/signatures',
                    params: [],
                    headers: [],
                    auth: { authType: 'inherit', authActive: true },
                    body: {
                        contentType: 'multipart/form-data',
                        body: [{ key: 'file', active: true, isFile: false, value: '' }],
                    },
                },
            ],
        }
        const result = importCollections(JSON.stringify(collection), 'hoppscotch')
        const req = result[0].items[0]
        if (req.type !== 'request') return
        expect(req.body.type).toBe('form-data')
        const pairs = JSON.parse(req.body.content)
        expect(pairs).toHaveLength(1)
        expect(pairs[0].key).toBe('file')
    })

    it('imports test scripts as postResponse', () => {
        const collection = {
            v: 11,
            name: 'Scripts',
            folders: [],
            requests: [
                {
                    name: 'With Script',
                    method: 'GET',
                    endpoint: 'https://example.com',
                    params: [],
                    headers: [],
                    auth: { authType: 'inherit', authActive: true },
                    body: { contentType: null, body: null },
                    testScript: "pw.env.set('token', 'abc')",
                },
            ],
        }
        const result = importCollections(JSON.stringify(collection), 'hoppscotch')
        const req = result[0].items[0]
        if (req.type !== 'request') return
        expect(req.scripts?.postResponse).toBe("pw.env.set('token', 'abc')")
    })

    it('throws when Hoppscotch collection imported as Postman', () => {
        expect(() => importCollections(JSON.stringify(tesCollection), 'postman')).toThrow(
            /Postman collection format/
        )
    })

    it('throws when Postman collection imported as Hoppscotch', () => {
        const postman = {
            info: { name: 'Postman Collection' },
            item: [{ name: 'Req', request: { method: 'GET', url: 'https://example.com' } }],
        }
        expect(() => importCollections(JSON.stringify(postman), 'hoppscotch')).toThrow(
            /Hoppscotch collection format/
        )
    })
})
