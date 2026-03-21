/** Best-effort parse of one `Set-Cookie` header value (name=value; attributes). */
export type ParsedSetCookie = {
    name: string
    value: string
    domain?: string
    path?: string
    expires?: string
    maxAge?: string
    sameSite?: string
    secure: boolean
    httpOnly: boolean
    raw: string
}

export function parseSetCookieHeader(line: string): ParsedSetCookie {
    const raw = line.trim()
    const semi = raw.indexOf(';')
    const first = (semi === -1 ? raw : raw.slice(0, semi)).trim()
    const eq = first.indexOf('=')
    const name = eq >= 0 ? first.slice(0, eq).trim() : first
    const value = eq >= 0 ? first.slice(eq + 1).trim() : ''
    const rest = semi === -1 ? '' : raw.slice(semi + 1)

    let domain: string | undefined
    let path: string | undefined
    let expires: string | undefined
    let maxAge: string | undefined
    let sameSite: string | undefined
    let secure = false
    let httpOnly = false

    for (const part of rest.split(';')) {
        const p = part.trim()
        if (!p) continue
        const low = p.toLowerCase()
        if (low === 'secure') {
            secure = true
            continue
        }
        if (low === 'httponly') {
            httpOnly = true
            continue
        }
        const idx = p.indexOf('=')
        if (idx === -1) continue
        const k = p.slice(0, idx).trim().toLowerCase()
        const v = p.slice(idx + 1).trim()
        if (k === 'domain') domain = v
        else if (k === 'path') path = v
        else if (k === 'expires') expires = v
        else if (k === 'max-age') maxAge = v
        else if (k === 'samesite') sameSite = v
    }

    return {
        name,
        value,
        domain,
        path,
        expires,
        maxAge,
        sameSite,
        secure,
        httpOnly,
        raw,
    }
}
