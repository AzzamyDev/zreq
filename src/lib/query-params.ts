import { nanoid } from 'nanoid'
import type { KV } from '../types'
import { parseUrlSegments, segmentsToUrl, type UrlSegment } from './urlSegments'

export type SplitUrlQuery = {
    baseUrl: string
    queryString: string
}

/** Split URL into base (no query) and query string. Respects `{{var}}` tokens. Hash stays on baseUrl. */
export function splitUrlQuery(url: string): SplitUrlQuery {
    const segments = parseUrlSegments(url || '')
    let found = false
    const baseParts: UrlSegment[] = []
    let queryAndHash = ''

    for (const seg of segments) {
        if (!found && seg.type === 'text') {
            const qIdx = seg.value.indexOf('?')
            if (qIdx !== -1) {
                baseParts.push({ type: 'text', value: seg.value.slice(0, qIdx) })
                queryAndHash = seg.value.slice(qIdx + 1)
                found = true
                continue
            }
        }
        if (!found) {
            baseParts.push(seg)
        } else if (seg.type === 'text') {
            queryAndHash += seg.value
        } else {
            queryAndHash += `{{${seg.name}}}`
        }
    }

    if (!found) {
        return { baseUrl: url || '', queryString: '' }
    }

    let queryString = queryAndHash
    let hashSuffix = ''
    const hashIdx = queryAndHash.indexOf('#')
    if (hashIdx !== -1) {
        queryString = queryAndHash.slice(0, hashIdx)
        hashSuffix = queryAndHash.slice(hashIdx)
    }

    const baseUrl = segmentsToUrl(baseParts) + hashSuffix
    return { baseUrl, queryString }
}

/** Parse query string into key/value pairs (order preserved, duplicates allowed). */
export function parseQueryString(qs: string): Array<{ key: string; value: string }> {
    if (!qs) return []
    const pairs: Array<{ key: string; value: string }> = []
    for (const part of qs.split('&')) {
        if (part === '') continue
        const eqIdx = part.indexOf('=')
        const decode = (s: string) => {
            try {
                return decodeURIComponent(s.replace(/\+/g, ' '))
            } catch {
                return s.replace(/\+/g, ' ')
            }
        }
        if (eqIdx === -1) {
            pairs.push({ key: decode(part), value: '' })
        } else {
            pairs.push({
                key: decode(part.slice(0, eqIdx)),
                value: decode(part.slice(eqIdx + 1)),
            })
        }
    }
    return pairs
}

/** Build query string from enabled params (without leading `?`). */
export function composeQueryString(params: KV[]): string {
    return (params || [])
        .filter((p) => p.enabled && p.key)
        .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`)
        .join('&')
}

/** Compose full display URL from base URL and params. */
export function composeUrl(baseUrl: string, params: KV[]): string {
    const qs = composeQueryString(params)
    if (!qs) return baseUrl || ''
    return `${baseUrl}?${qs}`
}

/** Parse a full URL into base + params. Removes params not present in the URL query (Postman behavior). */
export function parseUrlToParams(
    fullUrl: string,
    existingParams: KV[],
): { baseUrl: string; params: KV[] } {
    const { baseUrl, queryString } = splitUrlQuery(fullUrl)
    const parsed = parseQueryString(queryString)
    const existingByKey = new Map<string, KV>()
    for (const p of existingParams) {
        if (p.key && !existingByKey.has(p.key)) {
            existingByKey.set(p.key, p)
        }
    }

    const params: KV[] = parsed.map(({ key, value }) => {
        const existing = existingByKey.get(key)
        if (existing) {
            return { ...existing, key, value, enabled: true }
        }
        return { id: nanoid(), key, value, enabled: true }
    })

    return { baseUrl, params }
}

/** Merge query embedded in URL into params (legacy load/import). Existing params win for matching keys. */
export function normalizeRequestQuery(req: { url: string; params?: KV[] }): { url: string; params: KV[] } {
    const existing = req.params || []
    const { baseUrl, queryString } = splitUrlQuery(req.url || '')

    if (!queryString) {
        return { url: req.url || '', params: existing }
    }

    const fromUrl = parseQueryString(queryString)
    const existingKeys = new Set(existing.filter((p) => p.key).map((p) => p.key))
    const params: KV[] = [...existing]

    for (const { key, value } of fromUrl) {
        if (!existingKeys.has(key)) {
            existingKeys.add(key)
            params.push({ id: nanoid(), key, value, enabled: true })
        }
    }

    return { url: baseUrl, params }
}

/** Apply query normalization to a request-like object (load/tab switch). */
export function withNormalizedQuery<T extends { url: string; params?: KV[] }>(req: T): T {
    const { url, params } = normalizeRequestQuery(req)
    return { ...req, url, params }
}
