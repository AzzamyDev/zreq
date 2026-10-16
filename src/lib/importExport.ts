import type {
    AuthConfig,
    Collection,
    Environment,
    HttpMethod,
    KV,
    RequestBody,
    SavedResponse,
} from '../types'
import { nanoid } from 'nanoid'
import { normalizeRequestQuery, splitUrlQuery } from './query-params'

export type ImportFormat = 'postman' | 'hoppscotch' | 'zreq'

type ImportedCollection = Omit<Collection, 'id' | 'userId' | 'workspaceId' | 'createdAt' | 'updatedAt'>
type ImportedEnvironment = { name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }

/** Convert Hoppscotch `<<var>>` templates to Postwoman `{{var}}`. */
export function convertHoppscotchTemplates(text: string): string {
    return text.replace(/<<([^>]+)>>/g, '{{$1}}')
}

function isHoppscotchCollection(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const row = data as Record<string, unknown>
    if (row.info && row.item) return false
    if (row.zreq) return false
    const hasTree = Array.isArray(row.folders) || Array.isArray(row.requests)
    return 'v' in row && typeof row.name === 'string' && hasTree
}

function isPostmanCollection(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const row = data as Record<string, unknown>
    return Boolean(row.info && row.item)
}

function isZreqCollection(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const row = data as Record<string, unknown>
    return Boolean(row.zreq)
}

function isHoppscotchEnvironment(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const row = data as Record<string, unknown>
    if (row.zreq || Array.isArray(row.values)) return false
    if (!('v' in row) || !Array.isArray(row.variables)) return false
    return (row.variables as unknown[]).some(
        (v) => v && typeof v === 'object' && ('currentValue' in v || 'initialValue' in v)
    )
}

function isPostmanEnvironment(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const row = data as Record<string, unknown>
    return Array.isArray(row.values)
}

function isZreqEnvironment(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const row = data as Record<string, unknown>
    return Boolean(row.zreq && row.type === 'environment' && row.environment)
}

function detectCollectionFormat(data: unknown): ImportFormat | null {
    if (isHoppscotchCollection(data)) return 'hoppscotch'
    if (isPostmanCollection(data)) return 'postman'
    if (isZreqCollection(data)) return 'zreq'
    return null
}

function detectEnvironmentFormat(data: unknown): ImportFormat | null {
    if (isHoppscotchEnvironment(data)) return 'hoppscotch'
    if (isPostmanEnvironment(data)) return 'postman'
    if (isZreqEnvironment(data)) return 'zreq'
    if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Array.isArray((data as Record<string, unknown>).variables) &&
        !(data as Record<string, unknown>).zreq &&
        !Array.isArray((data as Record<string, unknown>).values)
    ) {
        return 'zreq'
    }
    return null
}

function assertCollectionFormat(data: unknown, format: ImportFormat): void {
    const detected = detectCollectionFormat(data)
    if (detected !== format) {
        const label = format === 'postman' ? 'Postman' : format === 'hoppscotch' ? 'Hoppscotch' : 'Postwoman (.zreq)'
        throw new Error(`File does not match ${label} collection format`)
    }
}

function assertEnvironmentFormat(data: unknown, format: ImportFormat): void {
    const detected = detectEnvironmentFormat(data)
    if (detected !== format) {
        const label = format === 'postman' ? 'Postman' : format === 'hoppscotch' ? 'Hoppscotch' : 'Postwoman (.zreq)'
        throw new Error(`File does not match ${label} environment format`)
    }
}

function parsePostmanEnvironment(data: Record<string, unknown>): ImportedEnvironment {
    const values = data.values
    if (!Array.isArray(values)) {
        throw new Error('Not a Postman environment file (missing "values" array)')
    }
    const name =
        typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported environment'
    return { name, variables: parseEnvVariables(values) }
}

function parseHoppscotchEnvironment(data: Record<string, unknown>): ImportedEnvironment {
    const variables = data.variables
    if (!Array.isArray(variables)) {
        throw new Error('Not a Hoppscotch environment file (missing "variables" array)')
    }
    const name =
        typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported environment'
    return { name, variables: parseHoppscotchEnvVariables(variables) }
}

function parseHoppscotchEnvVariables(
    input: unknown
): Array<{ key: string; value: string; enabled: boolean }> {
    return (Array.isArray(input) ? input : [])
        .map((v) => {
            if (!v || typeof v !== 'object') return null
            const row = v as Record<string, unknown>
            const key = typeof row.key === 'string' ? row.key.trim() : ''
            if (!key) return null
            const raw =
                row.currentValue !== undefined && row.currentValue !== null
                    ? row.currentValue
                    : row.initialValue !== undefined && row.initialValue !== null
                      ? row.initialValue
                      : row.value ?? ''
            return {
                key,
                value: convertHoppscotchTemplates(String(raw)),
                enabled: true,
            }
        })
        .filter((v): v is { key: string; value: string; enabled: boolean } => v !== null)
}

function importHoppscotchAuth(auth: unknown): AuthConfig {
    if (!auth || typeof auth !== 'object') return { type: 'inherit' }
    const row = auth as Record<string, unknown>
    const authType = typeof row.authType === 'string' ? row.authType : 'inherit'

    if (authType === 'none') return { type: 'none' }
    if (authType === 'inherit' || row.authActive === false) return { type: 'inherit' }
    if (authType === 'bearer') {
        return { type: 'bearer', token: convertHoppscotchTemplates(String(row.token ?? '')) }
    }
    if (authType === 'basic') {
        return {
            type: 'basic',
            username: convertHoppscotchTemplates(String(row.username ?? '')),
            password: convertHoppscotchTemplates(String(row.password ?? '')),
        }
    }
    return { type: 'inherit' }
}

function mapHoppscotchKvList(list: unknown): Array<{ id: string; key: string; value: string; enabled: boolean }> {
    return (Array.isArray(list) ? list : []).map((entry) => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
        return {
            id: nanoid(),
            key: typeof row.key === 'string' ? row.key : '',
            value: convertHoppscotchTemplates(row.value == null ? '' : String(row.value)),
            enabled: row.active !== false && row.enabled !== false && row.disabled !== true,
        }
    })
}

function importHoppscotchBody(body: unknown): RequestBody {
    if (!body || typeof body !== 'object') return { type: 'none', content: '' }
    const row = body as { contentType?: string | null; body?: unknown }
    if (row.contentType == null || row.body == null) return { type: 'none', content: '' }

    const contentType = row.contentType

    if (contentType === 'application/json') {
        const content =
            typeof row.body === 'string'
                ? convertHoppscotchTemplates(row.body)
                : JSON.stringify(row.body, null, 2)
        if (!content.trim()) return { type: 'none', content: '' }
        return { type: 'json', content }
    }

    if (contentType === 'multipart/form-data') {
        const pairs = (Array.isArray(row.body) ? row.body : [])
            .filter((f) => {
                const item = f as Record<string, unknown>
                return item.isFile !== true
            })
            .map((f) => {
                const item = f as Record<string, unknown>
                return {
                    id: nanoid(),
                    key: typeof item.key === 'string' ? item.key : '',
                    value: convertHoppscotchTemplates(item.value == null ? '' : String(item.value)),
                    enabled: item.active !== false,
                }
            })
        if (pairs.length === 0) return { type: 'none', content: '' }
        return { type: 'form-data', content: JSON.stringify(pairs) }
    }

    if (contentType === 'application/x-www-form-urlencoded') {
        const pairs = (Array.isArray(row.body) ? row.body : []).map((f) => {
            const item = f as Record<string, unknown>
            return {
                id: nanoid(),
                key: typeof item.key === 'string' ? item.key : '',
                value: convertHoppscotchTemplates(item.value == null ? '' : String(item.value)),
                enabled: item.active !== false,
            }
        })
        if (pairs.length === 0) return { type: 'none', content: '' }
        return { type: 'urlencoded', content: JSON.stringify(pairs) }
    }

    const raw =
        typeof row.body === 'string'
            ? convertHoppscotchTemplates(row.body)
            : JSON.stringify(row.body ?? '')
    if (!raw.trim()) return { type: 'none', content: '' }
    return { type: 'raw', content: raw }
}

function importHoppscotchRequest(req: Record<string, unknown>): Record<string, unknown> {
    const rawUrl = convertHoppscotchTemplates(typeof req.endpoint === 'string' ? req.endpoint : '')
    const paramsFromList = mapHoppscotchKvList(req.params)
    const normalized =
        paramsFromList.length > 0
            ? { url: splitUrlQuery(rawUrl).baseUrl, params: paramsFromList }
            : normalizeRequestQuery({ url: rawUrl, params: [] })
    const isWs = /^wss?:\/\//i.test(normalized.url)

    const scripts: { preRequest?: string; postResponse?: string } = {}
    if (typeof req.preRequestScript === 'string' && req.preRequestScript.trim()) {
        scripts.preRequest = convertHoppscotchTemplates(req.preRequestScript)
    }
    if (typeof req.testScript === 'string' && req.testScript.trim()) {
        scripts.postResponse = convertHoppscotchTemplates(req.testScript)
    }

    return {
        id: nanoid(),
        type: 'request',
        name: typeof req.name === 'string' ? req.name : 'Untitled',
        method: typeof req.method === 'string' ? req.method : 'GET',
        url: normalized.url,
        protocol: isWs ? 'ws' : 'http',
        headers: mapHoppscotchKvList(req.headers),
        params: normalized.params,
        body: importHoppscotchBody(req.body),
        auth: importHoppscotchAuth(req.auth),
        ...(Object.keys(scripts).length > 0 ? { scripts } : {}),
    }
}

function importHoppscotchFolder(folder: Record<string, unknown>): Record<string, unknown> {
    const subfolders = (Array.isArray(folder.folders) ? folder.folders : []).map((f) =>
        importHoppscotchFolder(f as Record<string, unknown>)
    )
    const requests = (Array.isArray(folder.requests) ? folder.requests : []).map((r) =>
        importHoppscotchRequest(r as Record<string, unknown>)
    )
    return {
        id: nanoid(),
        type: 'folder',
        name: typeof folder.name === 'string' ? folder.name : 'Folder',
        ...(typeof folder.description === 'string' && folder.description
            ? { description: folder.description }
            : {}),
        ...(folder.auth ? { auth: importHoppscotchAuth(folder.auth) } : {}),
        items: [...subfolders, ...requests],
    }
}

function parseHoppscotchCollection(data: Record<string, unknown>): ImportedCollection {
    const folders = (Array.isArray(data.folders) ? data.folders : []).map((f) =>
        importHoppscotchFolder(f as Record<string, unknown>)
    )
    const requests = (Array.isArray(data.requests) ? data.requests : []).map((r) =>
        importHoppscotchRequest(r as Record<string, unknown>)
    )
    return {
        name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported collection',
        ...(typeof data.description === 'string' && data.description ? { description: data.description } : {}),
        ...(data.auth ? { auth: importHoppscotchAuth(data.auth) } : {}),
        items: [...folders, ...requests] as ImportedCollection['items'],
    }
}

/** Normalize Postman request (object or URL string) for import. */
function normalizePostmanRequest(item: any): any {
    const r = item.request
    if (typeof r === 'string') {
        return { method: 'GET', url: r, header: [], body: undefined }
    }
    return r || {}
}

function postmanAuthParam(list: unknown, key: string): string {
    if (!Array.isArray(list)) return ''
    const row = list.find(
        (entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).key === key
    ) as Record<string, unknown> | undefined
    if (!row || row.value == null) return ''
    return String(row.value)
}

function importPostmanAuth(auth: unknown): AuthConfig {
    if (!auth || typeof auth !== 'object') return { type: 'inherit' }
    const row = auth as Record<string, unknown>
    const type = typeof row.type === 'string' ? row.type : ''

    if (type === 'noauth') return { type: 'none' }
    if (type === 'bearer') {
        return { type: 'bearer', token: postmanAuthParam(row.bearer, 'token') }
    }
    if (type === 'basic') {
        return {
            type: 'basic',
            username: postmanAuthParam(row.basic, 'username'),
            password: postmanAuthParam(row.basic, 'password'),
        }
    }
    if (type === 'apikey') {
        const inLoc = postmanAuthParam(row.apikey, 'in')
        return {
            type: 'apikey',
            key: postmanAuthParam(row.apikey, 'key'),
            value: postmanAuthParam(row.apikey, 'value'),
            addTo: inLoc === 'query' ? 'query' : 'header',
        }
    }
    if (type === 'jwt') {
        return {
            type: 'jwt',
            token: postmanAuthParam(row.jwt, 'token'),
            prefix: postmanAuthParam(row.jwt, 'prefix') || 'Bearer',
        }
    }
    return { type: 'inherit' }
}

function joinPostmanScriptExec(exec: unknown): string {
    if (Array.isArray(exec)) return exec.map((line) => (line == null ? '' : String(line))).join('\n')
    if (typeof exec === 'string') return exec
    return ''
}

function importPostmanScripts(item: Record<string, unknown>): {
    preRequest?: string
    postResponse?: string
} | undefined {
    const events = Array.isArray(item.event) ? item.event : []
    const scripts: { preRequest?: string; postResponse?: string } = {}
    for (const ev of events) {
        if (!ev || typeof ev !== 'object') continue
        const row = ev as Record<string, unknown>
        const script = row.script && typeof row.script === 'object' ? (row.script as Record<string, unknown>) : null
        const code = joinPostmanScriptExec(script?.exec).trim()
        if (!code) continue
        if (row.listen === 'prerequest') scripts.preRequest = joinPostmanScriptExec(script?.exec)
        else if (row.listen === 'test') scripts.postResponse = joinPostmanScriptExec(script?.exec)
    }
    return Object.keys(scripts).length > 0 ? scripts : undefined
}

function mapPostmanHeaders(headerList: unknown): KV[] {
    return (Array.isArray(headerList) ? headerList : []).map((h: any) => ({
        id: nanoid(),
        key: h?.key ?? '',
        value: h?.value == null ? '' : String(h.value),
        // Postman uses `disabled`; missing means enabled. Prefer explicit `enabled` if present.
        enabled: typeof h?.enabled === 'boolean' ? h.enabled : h?.disabled !== true,
    }))
}

function buildPostmanRequestFields(req: any): {
    method: HttpMethod | string
    url: string
    headers: KV[]
    params: KV[]
    body: RequestBody
    auth: AuthConfig
    protocol: 'http' | 'ws'
} {
    const method = req.method || 'GET'
    const rawUrl = typeof req.url === 'string' ? req.url : req.url?.raw || ''
    const queryList = Array.isArray(req.url?.query) ? req.url.query : []
    const paramsFromList = queryList.map((q: any) => ({
        id: nanoid(),
        key: q.key ?? '',
        value: q.value == null ? '' : String(q.value),
        enabled: typeof q.enabled === 'boolean' ? q.enabled : q.disabled !== true,
    }))
    const normalized =
        queryList.length > 0
            ? { url: splitUrlQuery(rawUrl).baseUrl, params: paramsFromList }
            : normalizeRequestQuery({ url: rawUrl, params: [] })
    const isWs = /^wss?:\/\//i.test(normalized.url)
    return {
        method,
        url: normalized.url,
        headers: mapPostmanHeaders(req.header),
        params: normalized.params,
        body: importPostmanBody(req),
        auth: req.auth != null ? importPostmanAuth(req.auth) : { type: 'inherit' },
        protocol: isWs ? 'ws' : 'http',
    }
}

function importPostmanSavedResponses(
    item: Record<string, unknown>,
    fallbackSnapshot: SavedResponse['requestSnapshot']
): SavedResponse[] | undefined {
    const examples = Array.isArray(item.response) ? item.response : []
    if (examples.length === 0) return undefined

    const saved = examples
        .filter((ex): ex is Record<string, unknown> => !!ex && typeof ex === 'object')
        .map((ex) => {
            const headersList = Array.isArray(ex.header) ? ex.header : []
            const headers: Record<string, string> = {}
            for (const h of headersList) {
                if (!h || typeof h !== 'object') continue
                const row = h as Record<string, unknown>
                const key = row.key == null ? '' : String(row.key)
                if (!key) continue
                headers[key] = row.value == null ? '' : String(row.value)
            }
            const body =
                typeof ex.body === 'string'
                    ? ex.body
                    : ex.body != null
                      ? JSON.stringify(ex.body)
                      : ''
            const sizeBytes =
                typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(body).length : body.length

            let requestSnapshot = fallbackSnapshot
            if (ex.originalRequest && typeof ex.originalRequest === 'object') {
                const fields = buildPostmanRequestFields(ex.originalRequest)
                requestSnapshot = {
                    method: (fields.method as HttpMethod) || fallbackSnapshot.method,
                    url: fields.url,
                    headers: fields.headers,
                    params: fields.params,
                    body: fields.body,
                    auth: fields.auth,
                }
            }

            return {
                id: nanoid(),
                ...(typeof ex.name === 'string' && ex.name ? { name: ex.name } : {}),
                response: {
                    status: typeof ex.code === 'number' ? ex.code : 0,
                    statusText: typeof ex.status === 'string' ? ex.status : '',
                    headers,
                    body,
                    durationMs: 0,
                    sizeBytes,
                },
                requestSnapshot,
                savedAt: Date.now(),
            } satisfies SavedResponse
        })

    return saved.length > 0 ? saved : undefined
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
            enabled: typeof q.enabled === 'boolean' ? q.enabled : q.disabled !== true,
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
                enabled: typeof f.enabled === 'boolean' ? f.enabled : f.disabled !== true,
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

function parseEnvironmentObject(data: unknown, format?: ImportFormat): ImportedEnvironment | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const row = data as Record<string, unknown>

    if (format === 'hoppscotch') {
        if (!isHoppscotchEnvironment(row)) return null
        return parseHoppscotchEnvironment(row)
    }

    if (format === 'postman') {
        if (!isPostmanEnvironment(row)) return null
        return parsePostmanEnvironment(row)
    }

    if (format === 'zreq') {
        if (row.zreq && row.type === 'environment' && row.environment && typeof row.environment === 'object') {
            const env = row.environment as { name?: string; variables?: unknown[] }
            return {
                name: typeof env.name === 'string' && env.name.trim() ? env.name.trim() : 'Imported environment',
                variables: parseEnvVariables(env.variables ?? []),
            }
        }
        if (Array.isArray(row.variables)) {
            const name =
                typeof row.name === 'string' && row.name.trim()
                    ? row.name.trim()
                    : 'Imported environment'
            return { name, variables: parseEnvVariables(row.variables) }
        }
        return null
    }

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

    if (isHoppscotchEnvironment(row)) {
        return parseHoppscotchEnvironment(row)
    }

    if (Array.isArray(row.variables)) {
        const name =
            typeof row.name === 'string' && row.name.trim()
                ? row.name.trim()
                : 'Imported environment'
        return { name, variables: parseEnvVariables(row.variables) }
    }

    return null
}

export function importEnvironments(input: string, format?: ImportFormat): ImportedEnvironment[] {
    const trimmed = input.trimStart()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return [parseDotEnv(input)]
    }

    const data = JSON.parse(input) as unknown

    const parseOne = (entry: unknown): ImportedEnvironment | null => {
        if (format) assertEnvironmentFormat(entry, format)
        return parseEnvironmentObject(entry, format)
    }

    if (Array.isArray(data)) {
        if (data.length === 0) throw new Error('No environments found in file')
        const list = data.map((entry) => parseOne(entry))
        if (list.some((item) => item == null)) {
            throw new Error('Unknown environment format in array entry')
        }
        const result = list as ImportedEnvironment[]
        if (result.length === 0) throw new Error('No environments found in file')
        return result
    }

    if (data && typeof data === 'object') {
        const row = data as Record<string, unknown>
        if (row.zreq && row.type === 'environments' && Array.isArray(row.environments)) {
            if (format && format !== 'zreq') {
                throw new Error('File does not match selected environment format')
            }
            const list = row.environments.map((entry) => parseEnvironmentObject(entry, format ?? 'zreq'))
            if (list.some((item) => item == null)) {
                throw new Error('Unknown environment format in bundle entry')
            }
            const result = list as ImportedEnvironment[]
            if (result.length === 0) throw new Error('No environments found in file')
            return result
        }
        if (Array.isArray(row.environments)) {
            const list = row.environments.map((entry) => parseOne(entry))
            if (list.some((item) => item == null)) {
                throw new Error('Unknown environment format in bundle entry')
            }
            const result = list as ImportedEnvironment[]
            if (result.length === 0) throw new Error('No environments found in file')
            return result
        }
        const single = parseOne(row)
        if (single) return [single]
    }

    throw new Error('Unknown environment format. Supported: Postwoman export, Postman environment, Hoppscotch environment, .env file')
}

export function importEnvironment(input: string, format?: ImportFormat): ImportedEnvironment {
    const list = importEnvironments(input, format)
    return list[0]
}

function parseCollectionObject(data: unknown, format: ImportFormat): ImportedCollection | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const row = data as Record<string, any>

    if (format === 'hoppscotch') {
        if (!isHoppscotchCollection(row)) return null
        return parseHoppscotchCollection(row)
    }

    if (format === 'postman') {
        if (!isPostmanCollection(row)) return null
        return { name: row.info.name, items: importPostmanItems(row.item) }
    }

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
    return null
}

export function importCollections(jsonStr: string, format: ImportFormat): ImportedCollection[] {
    const data = JSON.parse(jsonStr) as unknown

    const parseOne = (entry: unknown): ImportedCollection | null => {
        assertCollectionFormat(entry, format)
        return parseCollectionObject(entry, format)
    }

    if (Array.isArray(data)) {
        const list = data.map((entry) => parseOne(entry))
        if (list.some((item) => item == null)) {
            throw new Error('Unknown collection format in array entry')
        }
        return list as ImportedCollection[]
    }
    if (data && typeof data === 'object') {
        const row = data as Record<string, unknown>
        if (row.zreq && Array.isArray(row.collections)) {
            if (format !== 'zreq') {
                throw new Error('File does not match selected collection format')
            }
            const list = row.collections.map((entry) =>
                parseCollectionObject({ zreq: true, collection: entry }, 'zreq')
            )
            if (list.some((item) => item == null)) {
                throw new Error('Unknown collection format in bundle entry')
            }
            return list as ImportedCollection[]
        }
        if (Array.isArray(row.collections)) {
            const list = row.collections.map((entry) => parseOne(entry))
            if (list.some((item) => item == null)) {
                throw new Error('Unknown collection format in bundle entry')
            }
            return list as ImportedCollection[]
        }
        const single = parseOne(row)
        if (single) return [single]
    }
    throw new Error('Unknown collection format')
}

export function importCollection(jsonStr: string, format: ImportFormat): ImportedCollection {
    const list = importCollections(jsonStr, format)
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
            return {
                id: nanoid(),
                type: 'folder',
                name: item.name ?? 'Folder',
                items: importPostmanItems(item.item),
            }
        }
        const req = normalizePostmanRequest(item)
        const fields = buildPostmanRequestFields(req)
        const scripts = importPostmanScripts(item)
        const requestSnapshot: SavedResponse['requestSnapshot'] = {
            method: (fields.method as HttpMethod) || 'GET',
            url: fields.url,
            headers: fields.headers,
            params: fields.params,
            body: fields.body,
            auth: fields.auth,
        }
        const savedResponses = importPostmanSavedResponses(item, requestSnapshot)
        return {
            id: nanoid(),
            type: 'request',
            name: item.name ?? 'Untitled',
            method: fields.method,
            url: fields.url,
            protocol: fields.protocol,
            headers: fields.headers,
            params: fields.params,
            body: fields.body,
            auth: fields.auth,
            ...(scripts ? { scripts } : {}),
            ...(savedResponses ? { savedResponses } : {}),
        }
    })
}
