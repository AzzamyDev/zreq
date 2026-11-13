import type { AuthConfig, BodyType, HttpMethod, RequestBody } from '../types'

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const LONG_WITH_ARG = new Set([
    'request',
    'header',
    'data',
    'data-raw',
    'data-binary',
    'data-ascii',
    'data-urlencode',
    'user',
    'user-agent',
    'cookie',
    'referer',
    'url',
])

const SHORT_WITH_ARG: Record<string, string> = {
    X: 'request',
    H: 'header',
    d: 'data',
    u: 'user',
    A: 'user-agent',
    b: 'cookie',
    e: 'referer',
}

const LONG_FLAGS = new Set([
    'location',
    'insecure',
    'silent',
    'verbose',
    'include',
    'compressed',
    'get',
    'no-buffer',
    'fail',
    'show-error',
    'http1.1',
    'http1.0',
    'http2',
    'globoff',
])

const SHORT_FLAGS = new Set(['L', 'k', 's', 'v', 'i', 'S', 'f', 'G', 'N'])

export type CurlDraft = {
    method: HttpMethod
    url: string
    headers: { id: string; key: string; value: string; enabled: boolean }[]
    body: RequestBody
    auth: AuthConfig
    name: string
}

export type CurlParseResult = { ok: true; draft: CurlDraft } | { ok: false; error: 'empty' | 'no-url' }

function decodeURIComponentSafe(value: string): string {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '))
    } catch {
        return value
    }
}

function looksLikeJson(value: string): boolean {
    const trimmed = value.trim()
    return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function looksLikeForm(value: string): boolean {
    return value.includes('=') && !value.includes('\n')
}

/** Split a shell-ish command into words, keeping quotes and curl's `'\''` escape. */
export function tokenizeCurl(input: string): string[] {
    const tokens: string[] = []
    let current = ''
    let quote: '"' | "'" | null = null
    let hasToken = false

    const push = () => {
        if (hasToken) tokens.push(current)
        current = ''
        hasToken = false
    }

    for (let i = 0; i < input.length; i++) {
        const char = input[i]
        if (quote === "'") {
            if (char === "'" && input[i + 1] === '\\' && input[i + 2] === "'") {
                current += "'"
                hasToken = true
                i += 2
                continue
            }
            if (char === "'") {
                quote = null
                continue
            }
            current += char
            hasToken = true
            continue
        }
        if (quote === '"') {
            if (char === '\\' && i + 1 < input.length) {
                const next = input[i + 1]
                if (next === 'n') current += '\n'
                else if (next === 'r') current += '\r'
                else if (next === 't') current += '\t'
                else current += next
                hasToken = true
                i += 1
                continue
            }
            if (char === '"') {
                quote = null
                continue
            }
            current += char
            hasToken = true
            continue
        }
        if (char === "'" || char === '"') {
            quote = char
            hasToken = true
            continue
        }
        if (/\s/.test(char)) {
            push()
            continue
        }
        current += char
        hasToken = true
    }
    push()
    return tokens
}

function prepareCommand(input: string): string {
    return input
        .replace(/\r\n/g, '\n')
        .replace(/\\\n/g, ' ')
        .replace(/\^\n/g, ' ')
        .replace(/`\n/g, ' ')
        .trim()
}

function asMethod(value: string, fallback: HttpMethod): HttpMethod {
    const upper = value.toUpperCase()
    return (METHODS as readonly string[]).includes(upper) ? (upper as HttpMethod) : fallback
}

function headerPair(raw: string, index: number): CurlDraft['headers'][number] | null {
    const colon = raw.indexOf(':')
    if (colon <= 0) return null
    const key = raw.slice(0, colon).trim()
    if (!key) return null
    return { id: `h${index}`, key, value: raw.slice(colon + 1).trim(), enabled: true }
}

function bodyFromData(raw: string, headers: CurlDraft['headers']): RequestBody {
    if (!raw) return { type: 'none', content: '' }
    const contentType = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value.toLowerCase() ?? ''
    let type: BodyType = 'raw'
    if (contentType.includes('application/json') || (!contentType && looksLikeJson(raw))) type = 'json'
    else if (contentType.includes('application/x-www-form-urlencoded') || (!contentType && looksLikeForm(raw))) {
        type = 'urlencoded'
    }
    if (type === 'urlencoded') {
        const pairs = raw
            .split('&')
            .filter((part) => part.length > 0)
            .map((part, index) => {
                const eq = part.indexOf('=')
                const key = eq === -1 ? part : part.slice(0, eq)
                const value = eq === -1 ? '' : part.slice(eq + 1)
                return {
                    id: `p${index + 1}`,
                    key: decodeURIComponentSafe(key),
                    value: decodeURIComponentSafe(value),
                    enabled: true,
                }
            })
        return { type, content: JSON.stringify(pairs) }
    }
    return { type, content: raw }
}

function consumeOption(token: string): { name: string; inline?: string; get: boolean } | { skip: true } | null {
    if (token === 'curl' || token === 'curl.exe') return { skip: true }
    if (!token.startsWith('-') || token === '-') return null

    if (token.startsWith('--')) {
        const body = token.slice(2)
        const eq = body.indexOf('=')
        const name = (eq === -1 ? body : body.slice(0, eq)).toLowerCase()
        const inline = eq === -1 ? undefined : body.slice(eq + 1)
        if (name === 'get') return { name, inline, get: true }
        if (LONG_WITH_ARG.has(name)) return { name, inline, get: false }
        if (LONG_FLAGS.has(name) || inline !== undefined) return { skip: true }
        return { skip: true }
    }

    const cluster = token.slice(1)
    if (cluster.length === 1 && SHORT_WITH_ARG[cluster]) {
        return { name: SHORT_WITH_ARG[cluster], get: false }
    }
    if (cluster.length > 1 && SHORT_WITH_ARG[cluster[0]]) {
        return { name: SHORT_WITH_ARG[cluster[0]], inline: cluster.slice(1), get: false }
    }
    let get = false
    for (const letter of cluster) {
        if (letter === 'G') get = true
        else if (!SHORT_FLAGS.has(letter) && !SHORT_WITH_ARG[letter]) return { skip: true }
    }
    const last = cluster[cluster.length - 1]
    if (SHORT_WITH_ARG[last] && cluster.slice(0, -1).split('').every((letter) => SHORT_FLAGS.has(letter))) {
        return { name: SHORT_WITH_ARG[last], get }
    }
    return get ? { name: 'get', get: true } : { skip: true }
}

export function parseCurl(input: string): CurlParseResult {
    const prepared = prepareCommand(input)
    if (!prepared) return { ok: false, error: 'empty' }
    const tokens = tokenizeCurl(prepared).filter((token) => token !== '\\' && token !== '^')
    if (tokens.length === 0) return { ok: false, error: 'empty' }

    let method: HttpMethod | null = null
    let explicitMethod = false
    let url = ''
    let user: string | null = null
    let getQuery = false
    const headers: CurlDraft['headers'] = []
    const dataParts: string[] = []

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const option = consumeOption(token)
        if (option && 'skip' in option) continue
        if (option && option.get && option.name === 'get') {
            getQuery = true
            continue
        }
        if (option && 'name' in option) {
            let value = option.inline
            if (value === undefined) {
                const next = tokens[i + 1]
                if (next === undefined || next.startsWith('-')) continue
                value = next
                i += 1
            }
            if (option.get) getQuery = true
            if (option.name === 'request') {
                method = asMethod(value, 'POST')
                explicitMethod = true
            } else if (option.name === 'url') {
                url = value
            } else if (option.name === 'header') {
                const pair = headerPair(value, headers.length + 1)
                if (pair) headers.push(pair)
            } else if (option.name === 'user') {
                user = value
            } else if (option.name === 'user-agent') {
                headers.push({ id: `h${headers.length + 1}`, key: 'User-Agent', value, enabled: true })
            } else if (option.name === 'cookie') {
                headers.push({ id: `h${headers.length + 1}`, key: 'Cookie', value, enabled: true })
            } else if (option.name === 'referer') {
                headers.push({ id: `h${headers.length + 1}`, key: 'Referer', value, enabled: true })
            } else if (option.name.startsWith('data')) {
                dataParts.push(value)
            }
            continue
        }
        if (!url) url = token.replace(/^curl(?:\.exe)?$/i, '')
    }

    url = url.trim()
    if (!url || url === 'curl' || url === 'curl.exe') return { ok: false, error: 'no-url' }

    const rawBody = dataParts.join('&')
    let body = bodyFromData(rawBody, headers)
    if (getQuery && rawBody) {
        url += (url.includes('?') ? '&' : '?') + rawBody
        body = { type: 'none', content: '' }
        if (!explicitMethod) method = 'GET'
    }
    if (!method) method = rawBody ? 'POST' : 'GET'

    const hasAuthorization = headers.some((header) => header.key.toLowerCase() === 'authorization')
    let auth: AuthConfig = { type: 'none' }
    if (user && !hasAuthorization) {
        const colon = user.indexOf(':')
        auth = {
            type: 'basic',
            username: colon === -1 ? user : user.slice(0, colon),
            password: colon === -1 ? '' : user.slice(colon + 1),
        }
    }

    return {
        ok: true,
        draft: {
            method,
            url,
            headers,
            body,
            auth,
            name: 'Imported request',
        },
    }
}
