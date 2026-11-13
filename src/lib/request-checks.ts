import type { ActiveRequest, Folder, HttpResponse, RequestCheck, RequestItem } from '../types'

export type { RequestCheck }

export type CheckVerdict = {
    id: string
    kind: 'status' | 'json'
    pass: boolean
    expected: string
    actual: string
    missing: boolean
    path?: string
}

export function readChecks(value: unknown): RequestCheck[] {
    if (!Array.isArray(value)) return []
    const checks: RequestCheck[] = []
    for (const row of value) {
        if (!row || typeof row !== 'object') continue
        const rec = row as Record<string, unknown>
        const id = typeof rec.id === 'string' ? rec.id : ''
        if (!id) continue
        if (rec.kind === 'status') {
            const expected = Number(rec.expected)
            if (!Number.isFinite(expected)) continue
            checks.push({ id, kind: 'status', expected: Math.trunc(expected) })
        } else if (rec.kind === 'json') {
            checks.push({
                id,
                kind: 'json',
                path: typeof rec.path === 'string' ? rec.path : '',
                expected: rec.expected == null ? '' : String(rec.expected),
            })
        }
    }
    return checks
}

function readJsonPath(value: unknown, path: string): { missing: boolean; value: unknown } {
    const parts = path
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean)
    if (parts.length === 0) return { missing: true, value: undefined }
    let current = value
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return { missing: true, value: undefined }
        if (!Object.prototype.hasOwnProperty.call(current, part)) return { missing: true, value: undefined }
        current = (current as Record<string, unknown>)[part]
    }
    return { missing: false, value: current }
}

function actualText(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (value == null) return ''
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function matches(actual: unknown, expected: string): boolean {
    const text = actualText(actual)
    const wanted = expected.trim()
    if (text === wanted || text === expected) return true
    if (typeof actual === 'number' && wanted !== '' && Number(wanted) === actual) return true
    if (typeof actual === 'boolean' && (wanted === 'true' || wanted === 'false') && String(actual) === wanted) return true
    return false
}

export function evaluateChecks(checks: RequestCheck[], response: HttpResponse): CheckVerdict[] {
    let parsed: unknown
    let parsedOk = false
    if (checks.some((check) => check.kind === 'json')) {
        try {
            parsed = JSON.parse(response.body || '')
            parsedOk = true
        } catch {
            parsedOk = false
        }
    }

    return checks.map((check) => {
        if (check.kind === 'status') {
            return {
                id: check.id,
                kind: 'status',
                pass: response.status === check.expected,
                expected: String(check.expected),
                actual: String(response.status),
                missing: false,
            }
        }
        if (!parsedOk) {
            return {
                id: check.id,
                kind: 'json',
                pass: false,
                expected: check.expected,
                actual: '',
                missing: true,
                path: check.path,
            }
        }
        const found = readJsonPath(parsed, check.path)
        return {
            id: check.id,
            kind: 'json',
            pass: !found.missing && matches(found.value, check.expected),
            expected: check.expected,
            actual: found.missing ? '' : actualText(found.value),
            missing: found.missing,
            path: check.path,
        }
    })
}

export function collectHttpRequests(
    items: Array<Folder | RequestItem> | undefined,
    collectionId: number,
    parentFolderId?: string,
): ActiveRequest[] {
    const requests: ActiveRequest[] = []
    for (const node of items ?? []) {
        if (node.type === 'folder') {
            requests.push(...collectHttpRequests(node.items, collectionId, node.id))
            continue
        }
        const url = node.url ?? ''
        if (node.protocol === 'ws' || /^wss?:\/\//i.test(url)) continue
        requests.push({
            name: node.name || 'Request',
            method: node.method || 'GET',
            url,
            headers: node.headers ?? [],
            params: node.params ?? [],
            body: node.body ?? { type: 'none', content: '' },
            auth: node.auth ?? (parentFolderId ? { type: 'inherit' } : { type: 'none' }),
            scripts: node.scripts,
            protocol: 'http',
            collectionId,
            folderId: parentFolderId,
            itemId: node.id,
        })
    }
    return requests
}
