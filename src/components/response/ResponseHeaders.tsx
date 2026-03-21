import { useTranslation } from 'react-i18next'

interface ResponseHeadersProps {
    headers: Record<string, string>
}

export default function ResponseHeaders({ headers }: ResponseHeadersProps) {
    const { t } = useTranslation()
    const sorted = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))

    if (sorted.length === 0) {
        return (
            <p className="p-4 text-sm text-muted-foreground">{t('response.noHeaders')}</p>
        )
    }

    return (
        <div className="overflow-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-border bg-muted/50 text-left">
                        <th className="px-4 py-2 font-medium text-muted-foreground">{t('request.header')}</th>
                        <th className="px-4 py-2 font-medium text-muted-foreground">{t('common.value')}</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map(([key, value]) => (
                        <tr key={key} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2 font-mono font-medium text-foreground/80">{key}</td>
                            <td className="px-4 py-2 font-mono text-foreground/60 break-all">{value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
