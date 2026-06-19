import type { Collection, Environment, RequestBody } from '../types'
import { nanoid } from 'nanoid'
import { normalizeRequestQuery, splitUrlQuery } from './query-params'

type ImportedCollection = Omit<Collection, 'id' | 'userId' | 'workspaceId' | 'createdAt' | 'updatedAt'>
type ImportedEnvironment = { name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }

function parsePostmanEnvironment(data: Record<string, unknown>): ImportedEnvironment {
    const values = data.values
    if (!Array.isArray(values)) {
        throw new Error('Not a Postman environment file (missing "values" array)')
    }
    const name =
        typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported environment'
    return { name, variables: parseEnvVariables(values) }
}

/** Normalize Postman request (object or URL string) for import. */
function normalizePostmanRequest(item: any): any {
    const r = item.request
    if (typeof r === 'string') {
        return { method: 'GET', url: r, header: [], body: undefined }
    }
    return r || {}
}

function importPostmanBody(req: any): RequestBody {
    const b = req.body
    if (!b || typeof b.mode !== 'string') {
        return { type: 'none', content: '' }
    }
    const { mode } = b

    if (mode === 'raw') {
        const raw = typeof b.raw === 'string' ? b.raw : ''
        if (!raw.trim()) return { type: 'none', content: '' }
        const lang = b.options?.raw?.language
        const type = lang === 'json' ? 'json' : 'raw'
        return { type, content: raw }
    }

    if (mode === 'urlencoded') {
        const pairs = (b.urlencoded || []).map((q: any) => ({
            id: nanoid(),
            key: q.key ?? '',
            value: q.value ?? '',
            enabled: !q.disabled,
        }))
        if (pairs.length === 0) return { type: 'none', content: '' }
        return { type: 'urlencoded', content: JSON.stringify(pairs) }
    }

    if (mode === 'formdata') {
        const pairs = (b.formdata || [])
            .filter((f: any) => f.type !== 'file')
            .map((f: any) => ({
                id: nanoid(),
                key: f.key ?? '',
                value: f.value ?? '',
                enabled: !f.disabled,
            }))
        if (pairs.length === 0) return { type: 'none', content: '' }
        return { type: 'form-data', content: JSON.stringify(pairs) }
    }

    if (mode === 'graphql') {
        const gql = b.graphql
        if (gql?.query != null || gql?.variables != null) {
            let variables: unknown = {}
            const v = gql.variables
            if (typeof v === 'string' && v.trim()) {
                try {
                    variables = JSON.parse(v)
                } catch {
                    variables = {}
                }
            } else if (v && typeof v === 'object') {
                variables = v
            }
            const payload = {
                query: gql.query ?? '',
                variables,
            }
            return { type: 'json', content: JSON.stringify(payload, null, 2) }
        }
    }

    return { type: 'none', content: '' }
}

export function exportCollection(collection: Collection): string {
    return JSON.stringify({ zreq: true, version: 1, collection }, null, 2)
}

export function exportCollections(collections: Collection[]): string {
    return JSON.stringify(
        {
            zreq: true,
            version: 1,
            type: 'collections',
            collections,
        },
        null,
        2
    )
}

export function exportEnvironment(env: Environment): string {
    return JSON.stringify(
        {
            zreq: true,
            version: 1,
            type: 'environment',
            environment: {
                name: env.name,
                variables: (env.variables ?? []).map(({ key, value, enabled }) => ({
                    key,
                    value,
                    enabled,
                })),
            },
        },
        null,
        2
    )
}

function parseEnvVariables(input: unknown): Array<{ key: string; value: string; enabled: boolean }> {
    return (Array.isArray(input) ? input : [])
        .map((v) => {
            if (!v || typeof v !== 'object') return null
            const row = v as Record<string, unknown>
            const key = typeof row.key === 'string' ? row.key.trim() : ''
            if (!key) return null
            const enabled = 'disabled' in row ? row.disabled !== true : row.enabled !== false
            return {
                key,
                value: row.value === null || row.value === undefined ? '' : String(row.value),
                enabled,
            }
        })
        .filter((v): v is { key: string; value: string; enabled: boolean } => v !== null)
}

function parseDotEnv(input: string): ImportedEnvironment {
    const variables: Array<{ key: string; value: string; enabled: boolean }> = []
    for (const raw of input.split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq === -1) continue
        let key = line.slice(0, eq).trim()
        if (key.toLowerCase().startsWith('export ')) key = key.slice('export '.length).trim()
        if (!key) continue
        let value = line.slice(eq + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }
        variables.push({ key, value, enabled: true })
    }
    if (variables.length === 0) throw new Error('No variables found in .env file')
    return { name: 'Imported environment', variables }
}

function parseEnvironmentObject(data: unknown): ImportedEnvironment | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const row = data as Record<string, unknown>

    if (row.zreq && row.type === 'environment' && row.environment && typeof row.environment === 'object') {
        const env = row.environment as { name?: string; variables?: unknown[] }
        return {
            name: typeof env.name === 'string' && env.name.trim() ? env.name.trim() : 'Imported environment',
            variables: parseEnvVariables(env.variables ?? []),
        }
    }

    if (Array.isArray(row.values)) {
        return parsePostmanEnvironment(row)
    }

    // ZReq bundle entries / inline: { name?, variables: [...] }
    if (Array.isArray(row.variables)) {
        const name =
            typeof row.name === 'string' && row.name.trim()
                ? row.name.trim()
                : 'Imported environment'
        return { name, variables: parseEnvVariables(row.variables) }
    }

    return null
}

export function importEnvironments(input: string): ImportedEnvironment[] {
    const trimmed = input.trimStart()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return [parseDotEnv(input)]
    }

    const data = JSON.parse(input) as unknown
    if (Array.isArray(data)) {
        if (data.length === 0) throw new Error('No environments found in file')
        const list = data.map((entry) => parseEnvironmentObject(entry))
        if (list.some((item) => item == null)) {
            throw new Error('Unknown environment format in array entry')
        }
        const result = list as ImportedEnvironment[]
        if (result.length === 0) throw new Error('No environments found in file')
        return result
    }

    if (data && typeof data === 'object') {
        const row = data as Record<string, unknown>
        if (
            row.zreq &&
            row.type === 'environments' &&
            Array.isArray(row.environments)
        ) {
            const list = row.environments.map((entry) => parseEnvironmentObject(entry))
            if (list.some((item) => item == null)) {
                throw new Error('Unknown environment format in bundle entry')
            }
            const result = list as ImportedEnvironment[]
            if (result.length === 0) throw new Error('No environments found in file')
            return result
        }
        // Postman-style dump: { environments: [ { name, values }, ... ] }
        if (Array.isArray(row.environments)) {
            const list = row.environments.map((entry) => parseEnvironmentObject(entry))
            if (list.some((item) => item == null)) {
                throw new Error('Unknown environment format in bundle entry')
            }
            const result = list as ImportedEnvironment[]
            if (result.length === 0) throw new Error('No environments found in file')
            return result
        }
        const single = parseEnvironmentObject(row)
        if (single) return [single]
    }

    throw new Error('Unknown environment format. Supported: Postwoman export, Postman environment, .env file')
}

export function importEnvironment(input: string): ImportedEnvironment {
    const list = importEnvironments(input)
    return list[0]
}

function parseCollectionObject(data: unknown): ImportedCollection | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const row = data as Record<string, any>

    if (row.zreq && row.collection) {
        const col = row.collection
        return {
            name: col.name,
            ...(col.description != null ? { description: col.description } : {}),
            ...(col.auth != null ? { auth: col.auth } : {}),
            ...(col.variables != null ? { variables: col.variables } : {}),
            items: reassignIds(col.items || []),
        }
    }
    if (row.zreq && row.name && row.items) {
        return {
            name: row.name,
            ...(row.description != null ? { description: row.description } : {}),
            ...(row.auth != null ? { auth: row.auth } : {}),
            ...(row.variables != null ? { variables: row.variables } : {}),
            items: reassignIds(row.items || []),
        }
    }
    if (row.info && row.item) {
        return { name: row.info.name, items: importPostmanItems(row.item) }
    }
    return null
}

export function importCollections(jsonStr: string): ImportedCollection[] {
    const data = JSON.parse(jsonStr) as unknown
    if (Array.isArray(data)) {
        const list = data.map((entry) => parseCollectionObject(entry))
        if (list.some((item) => item == null)) {
            throw new Error('Unknown collection format in array entry')
        }
        return list as ImportedCollection[]
    }
    if (data && typeof data === 'object') {
        const row = data as Record<string, unknown>
        if (row.zreq && Array.isArray(row.collections)) {
            const list = row.collections.map((entry) => parseCollectionObject({ zreq: true, collection: entry }))
            if (list.some((item) => item == null)) {
                throw new Error('Unknown collection format in bundle entry')
            }
            return list as ImportedCollection[]
        }
        if (Array.isArray(row.collections)) {
            const list = row.collections.map((entry) => parseCollectionObject(entry))
            if (list.some((item) => item == null)) {
                throw new Error('Unknown collection format in bundle entry')
            }
            return list as ImportedCollection[]
        }
        const single = parseCollectionObject(row)
        if (single) return [single]
    }
    throw new Error('Unknown collection format')
}

export function importCollection(jsonStr: string): ImportedCollection {
    const list = importCollections(jsonStr)
    return list[0]
}

function reassignIds(items: any[]): any[] {
    return items.map((item) => ({
        ...item,
        id: nanoid(),
        items: item.items ? reassignIds(item.items) : undefined,
    }))
}

function importPostmanItems(items: any[]): any[] {
    return items.map((item) => {
        if (item.item) {
            // It's a folder
            return {
                id: nanoid(),
                type: 'folder',
                name: item.name ?? 'Folder',
                items: importPostmanItems(item.item),
            }
        }
        // It's a request
        const req = normalizePostmanRequest(item)
        const method = req.method || 'GET'
        const rawUrl = typeof req.url === 'string' ? req.url : req.url?.raw || ''
        const headerList = Array.isArray(req.header) ? req.header : []
        const queryList = Array.isArray(req.url?.query) ? req.url.query : []
        const paramsFromList = queryList.map((q: any) => ({
            id: nanoid(),
            key: q.key,
            value: q.value,
            enabled: !q.disabled,
        }))
        const normalized =
            queryList.length > 0
                ? { url: splitUrlQuery(rawUrl).baseUrl, params: paramsFromList }
                : normalizeRequestQuery({ url: rawUrl, params: [] })
        const isWs = /^wss?:\/\//i.test(normalized.url)
        return {
            id: nanoid(),
            type: 'request',
            name: item.name ?? 'Untitled',
            method,
            url: normalized.url,
            protocol: isWs ? 'ws' : 'http',
            headers: headerList.map((h: any) => ({
                id: nanoid(),
                key: h.key,
                value: h.value,
                enabled: !h.disabled,
            })),
            params: normalized.params,
            body: importPostmanBody(req),
            auth: { type: 'none' },
        }
    })
}
