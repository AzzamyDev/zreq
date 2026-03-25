import type { Collection, RequestBody } from '../types'
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
    return JSON.stringify({ zreq: true, zreq: true, version: 1, collection }, null, 2)
}

export function importCollection(
    jsonStr: string
): Omit<Collection, 'id' | 'userId' | 'workspaceId' | 'createdAt' | 'updatedAt'> {
    const data = JSON.parse(jsonStr)
    // ZReq / legacy zreq format and Postman v2.1
    if (data.zreq || data.zreq) {
        return {
            name: data.collection.name,
            items: reassignIds(data.collection.items || []),
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
