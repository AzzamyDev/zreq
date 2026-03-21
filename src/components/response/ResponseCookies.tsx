import { useTranslation } from 'react-i18next'
import { parseSetCookieHeader } from '@/lib/parseSetCookie'
import type { HttpResponse } from '../../types'

function collectSetCookieLines(response: HttpResponse): string[] {
    const fromVec = response.cookies
    if (fromVec && fromVec.length > 0) return fromVec
    const h = response.headers
    const raw = h['set-cookie'] ?? h['Set-Cookie']
    if (typeof raw === 'string' && raw.trim()) return [raw]
    return []
}

export default function ResponseCookies({ response }: { response: HttpResponse }) {
    const { t } = useTranslation()
    const lines = collectSetCookieLines(response)

    if (lines.length === 0) {
        return <p className="p-4 text-sm text-muted-foreground">{t('response.noCookies')}</p>
    }

    const rows = lines.map((line, i) => ({ ...parseSetCookieHeader(line), key: `${i}-${line.slice(0, 24)}` }))

    return (
        <div className="overflow-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-border bg-muted/50 text-left">
                        <th className="px-4 py-2 font-medium text-muted-foreground">{t('response.cookieName')}</th>
                        <th className="px-4 py-2 font-medium text-muted-foreground">{t('common.value')}</th>
                        <th className="px-4 py-2 font-medium text-muted-foreground">{t('response.cookieDomain')}</th>
                        <th className="px-4 py-2 font-medium text-muted-foreground">{t('response.cookiePath')}</th>
                        <th className="px-4 py-2 font-medium text-muted-foreground">{t('response.cookieAttrs')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const attrs: string[] = []
                        if (row.expires) attrs.push(`Expires=${row.expires}`)
                        if (row.maxAge) attrs.push(`Max-Age=${row.maxAge}`)
                        if (row.sameSite) attrs.push(`SameSite=${row.sameSite}`)
                        if (row.secure) attrs.push('Secure')
                        if (row.httpOnly) attrs.push('HttpOnly')
                        return (
                            <tr
                                key={row.key}
                                className="border-b border-border/50 last:border-0 hover:bg-muted/20 align-top"
                            >
                                <td className="px-4 py-2 font-mono font-medium text-foreground/80">{row.name}</td>
                                <td className="px-4 py-2 font-mono text-foreground/60 break-all max-w-[min(40vw,24rem)]">
                                    {row.value}
                                </td>
                                <td className="px-4 py-2 font-mono text-foreground/60 break-all">
                                    {row.domain ?? '—'}
                                </td>
                                <td className="px-4 py-2 font-mono text-foreground/60">{row.path ?? '—'}</td>
                                <td className="px-4 py-2 font-mono text-foreground/50 break-all">
                                    {attrs.length ? attrs.join('; ') : '—'}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
