import type { Collection, Environment, RequestBody } from '../types'
import { nanoid } from 'nanoid'

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

export function importEnvironment(
    input: string
): { name: string; variables: Array<{ key: string; value: string; enabled: boolean }> } {
    // Try .env file format (KEY=VALUE)
    if (!input.trimStart().startsWith('{')) {
        const variables: Array<{ key: string; value: string; enabled: boolean }> = []
        for (const raw of input.split('\n')) {
            const line = raw.trim()
            if (!line || line.startsWith('#')) continue
            const eq = line.indexOf('=')
            if (eq === -1) continue
            const key = line.slice(0, eq).trim()
            if (!key) continue
            let value = line.slice(eq + 1).trim()
            // Strip surrounding quotes
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1)
            }
            variables.push({ key, value, enabled: true })
        }
        if (variables.length === 0) throw new Error('No variables found in .env file')
        return { name: 'Imported environment', variables }
    }

    const data = JSON.parse(input) as Record<string, unknown>

    // Native zreq format
    if (data.zreq && data.type === 'environment' && data.environment) {
        const env = data.environment as { name?: string; variables?: unknown[] }
        return {
            name: typeof env.name === 'string' && env.name.trim() ? env.name.trim() : 'Imported environment',
            variables: (env.variables ?? [])
                .map((v) => {
                    if (!v || typeof v !== 'object') return null
                    const row = v as Record<string, unknown>
                    const key = typeof row.key === 'string' ? row.key.trim() : ''
                    if (!key) return null
                    return {
                        key,
                        value: row.value === null || row.value === undefined ? '' : String(row.value),
                        enabled: row.enabled !== false,
                    }
                })
                .filter((v): v is { key: string; value: string; enabled: boolean } => v !== null),
        }
    }

    // Postman environment format
    if (Array.isArray(data.values)) {
        const name =
            typeof data.name === 'string' && (data.name as string).trim()
                ? (data.name as string).trim()
                : 'Imported environment'
        const variables = (data.values as unknown[])
            .map((raw) => {
                if (!raw || typeof raw !== 'object') return null
                const row = raw as Record<string, unknown>
                const key = typeof row.key === 'string' ? row.key.trim() : ''
                if (!key) return null
                const value = row.value === null || row.value === undefined ? '' : String(row.value)
                return { key, value, enabled: row.enabled !== false }
            })
            .filter((v): v is { key: string; value: string; enabled: boolean } => v !== null)
        return { name, variables }
    }

    throw new Error('Unknown environment format. Supported: Postwoman export, Postman environment, .env file')
}

export function importCollection(
    jsonStr: string
): Omit<Collection, 'id' | 'userId' | 'workspaceId' | 'createdAt' | 'updatedAt'> {
    const data = JSON.parse(jsonStr)
    // ZReq / legacy zreq format and Postman v2.1
    if (data.zreq) {
        const col = data.collection
        return {
            name: col.name,
            ...(col.description != null ? { description: col.description } : {}),
            ...(col.auth != null ? { auth: col.auth } : {}),
            ...(col.variables != null ? { variables: col.variables } : {}),
            items: reassignIds(col.items || []),
        }
    }
    if (data.info && data.item) {
        // Postman v2.1
        return { name: data.info.name, items: importPostmanItems(data.item) }
    }
    throw new Error('Unknown collection format')
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
        const url = typeof req.url === 'string' ? req.url : req.url?.raw || ''
        const headerList = Array.isArray(req.header) ? req.header : []
        const queryList = Array.isArray(req.url?.query) ? req.url.query : []
        return {
            id: nanoid(),
            type: 'request',
            name: item.name ?? 'Untitled',
            method,
            url,
            headers: headerList.map((h: any) => ({
                id: nanoid(),
                key: h.key,
                value: h.value,
                enabled: !h.disabled,
            })),
            params: queryList.map((q: any) => ({
                id: nanoid(),
                key: q.key,
                value: q.value,
                enabled: !q.disabled,
            })),
            body: importPostmanBody(req),
            auth: { type: 'none' },
        }
    })
}
