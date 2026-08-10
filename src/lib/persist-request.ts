import type { ActiveRequest } from '../types'

export function buildPersistPayload(ar: ActiveRequest) {
    const base = {
        name: ar.name,
        method: ar.method,
        url: ar.url,
        headers: ar.headers,
        params: ar.params,
        body: ar.body,
        auth: ar.auth,
        scripts: ar.scripts,
        protocol: ar.protocol ?? 'http',
        savedResponses: ar.savedResponses,
    }
    if ((ar.protocol ?? 'http') === 'ws') {
        return {
            ...base,
            subprotocols: ar.subprotocols,
            savedMessages: ar.savedMessages,
            messageTemplate: ar.messageTemplate,
        }
    }
    return base
}

export function inferProtocolFromUrl(url: string, protocol?: string): 'http' | 'ws' {
    if (protocol === 'ws' || protocol === 'http') return protocol
    return /^wss?:\/\//i.test(url) ? 'ws' : 'http'
}
