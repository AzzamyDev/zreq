import type { AuthConfig, BodyType, HttpMethod, KV, RequestBody } from '../types'

const BODY_TYPES = new Set<BodyType>(['json', 'form-data', 'urlencoded', 'raw', 'none'])

const STORAGE_KEY = 'zreq_http_history_v1'
const MAX_ENTRIES = 80
const MAX_TEXT = 20_000

export type HistoryStore = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

export type HistoryEntry = {
    id: string
    sentAt: number
    name: string
    method: HttpMethod
    url: string
    headers: KV[]
    params: KV[]
    body: RequestBody
    auth: AuthConfig
    scripts?: {
        preRequest?: string
        postResponse?: string
    }
    status: number
    statusText: string
    durationMs: number
}

type HistoryFile = Record<string, HistoryEntry[]>

const listeners = new Set<() => void>()

export function subscribeHistory(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function emitHistory(): void {
    for (const listener of listeners) listener()
}

export function workspaceHistoryKey(workspaceId: number | null): string {
    return workspaceId == null ? 'none' : String(workspaceId)
}

function browserStore(): HistoryStore | null {
    try {
        if (typeof localStorage === 'undefined') return null
        return localStorage
    } catch {
        return null
    }
}

function asBody(body: RequestBody | undefined): RequestBody {
    if (!body || typeof body !== 'object' || !BODY_TYPES.has(body.type)) return { type: 'none', content: '' }
    return { type: body.type, content: clip(body.content) }
}

function clip(value: string | undefined): string {
    if (!value) return ''
    return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value
}

function clonePairs(pairs: KV[] | undefined): KV[] {
    return (pairs ?? []).map((pair) => ({
        id: pair.id,
        key: pair.key,
        value: clip(pair.value),
        enabled: pair.enabled !== false,
    }))
}

function isMethod(value: unknown): value is HttpMethod {
    return (
        value === 'GET' ||
        value === 'POST' ||
        value === 'PUT' ||
        value === 'PATCH' ||
        value === 'DELETE' ||
        value === 'HEAD' ||
        value === 'OPTIONS'
    )
}

function readFile(store: HistoryStore): HistoryFile {
    try {
        const raw = store.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        return parsed as HistoryFile
    } catch {
        return {}
    }
}

function writeFile(store: HistoryStore, file: HistoryFile): void {
    const payload = JSON.stringify(file)
    try {
        store.setItem(STORAGE_KEY, payload)
    } catch {
        const smaller: HistoryFile = {}
        for (const [key, rows] of Object.entries(file)) {
            smaller[key] = rows.slice(0, 20)
        }
        try {
            store.setItem(STORAGE_KEY, JSON.stringify(smaller))
        } catch {
            /* the browser refused to store more history */
        }
    }
}

function asEntry(value: unknown): HistoryEntry | null {
    if (!value || typeof value !== 'object') return null
    const row = value as Partial<HistoryEntry>
    if (typeof row.id !== 'string' || !isMethod(row.method) || typeof row.url !== 'string') return null
    return {
        id: row.id,
        sentAt: typeof row.sentAt === 'number' ? row.sentAt : Date.now(),
        name: typeof row.name === 'string' && row.name.trim() ? row.name : row.method,
        method: row.method,
        url: row.url,
        headers: Array.isArray(row.headers) ? clonePairs(row.headers) : [],
        params: Array.isArray(row.params) ? clonePairs(row.params) : [],
        body: asBody(row.body),
        auth: row.auth && typeof row.auth === 'object' && 'type' in row.auth ? row.auth : { type: 'none' },
        scripts: row.scripts,
        status: typeof row.status === 'number' ? row.status : 0,
        statusText: typeof row.statusText === 'string' ? row.statusText : '',
        durationMs: typeof row.durationMs === 'number' ? row.durationMs : 0,
    }
}

export function loadHistory(workspaceId: number | null, store: HistoryStore | null = browserStore()): HistoryEntry[] {
    if (!store) return []
    const rows = readFile(store)[workspaceHistoryKey(workspaceId)]
    if (!Array.isArray(rows)) return []
    return rows.map(asEntry).filter((row): row is HistoryEntry => row !== null)
}

export function recordSentRequest(
    workspaceId: number | null,
    entry: Omit<HistoryEntry, 'id' | 'sentAt'> & { sentAt?: number },
    store: HistoryStore | null = browserStore(),
): HistoryEntry | null {
    if (!store) return null
    if (!entry.url.trim()) return null
    const next: HistoryEntry = {
        ...entry,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        sentAt: entry.sentAt ?? Date.now(),
        name: entry.name.trim() || entry.method,
        headers: clonePairs(entry.headers),
        params: clonePairs(entry.params),
        body: { type: entry.body.type, content: clip(entry.body.content) },
        scripts: entry.scripts
            ? {
                  preRequest: clip(entry.scripts.preRequest),
                  postResponse: clip(entry.scripts.postResponse),
              }
            : undefined,
    }
    const file = readFile(store)
    const key = workspaceHistoryKey(workspaceId)
    const prev = Array.isArray(file[key]) ? file[key].map(asEntry).filter((row): row is HistoryEntry => row !== null) : []
    file[key] = [next, ...prev].slice(0, MAX_ENTRIES)
    writeFile(store, file)
    emitHistory()
    return next
}

export function removeHistoryEntry(
    workspaceId: number | null,
    id: string,
    store: HistoryStore | null = browserStore(),
): void {
    if (!store) return
    const file = readFile(store)
    const key = workspaceHistoryKey(workspaceId)
    const prev = Array.isArray(file[key]) ? file[key] : []
    file[key] = prev.filter((row) => !row || typeof row !== 'object' || (row as HistoryEntry).id !== id)
    writeFile(store, file)
    emitHistory()
}

export function clearHistory(workspaceId: number | null, store: HistoryStore | null = browserStore()): void {
    if (!store) return
    const file = readFile(store)
    delete file[workspaceHistoryKey(workspaceId)]
    writeFile(store, file)
    emitHistory()
}
