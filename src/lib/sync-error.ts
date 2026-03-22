import { isAxiosError } from 'axios'

function messageFromNestBody(data: unknown): string | null {
    if (data == null || typeof data !== 'object') return null
    const r = data as Record<string, unknown>
    const msg = r.message
    if (typeof msg === 'string') return msg
    if (Array.isArray(msg)) return msg.map(String).join(', ')
    if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
        const inner = msg as Record<string, unknown>
        if (typeof inner.message === 'string') return inner.message
        if (typeof inner.code === 'string') return inner.code
    }
    if (typeof r.error === 'string') return r.error
    if (typeof r.code === 'string') {
        const ent = typeof r.entity === 'string' ? ` — ${r.entity}` : ''
        return r.code === 'STALE_VERSION' ? `STALE_VERSION${ent}` : `${r.code}${ent}`
    }
    return null
}

/** User-facing text for failed sync / API calls (Nest + Axios). */
export function formatRequestError(e: unknown): string {
    if (isAxiosError(e)) {
        const data = e.response?.data
        const fromBody = messageFromNestBody(data)
        if (fromBody) return fromBody
        if (data != null && typeof data === 'object') {
            try {
                const s = JSON.stringify(data)
                if (s.length > 0 && s.length < 480) return s
            } catch {
                /* ignore */
            }
        }
        const st = e.response?.status
        return st != null ? `${e.message} (${st})` : e.message
    }
    if (e instanceof Error) return e.message
    return String(e)
}
