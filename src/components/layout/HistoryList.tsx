import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, X } from 'lucide-react'
import { useAppStore } from '../../store'
import { composeUrl } from '../../lib/query-params'
import { METHOD_TEXT_CLASS } from '../../lib/httpMethodTheme'
import {
    clearHistory,
    loadHistory,
    removeHistoryEntry,
    subscribeHistory,
    type HistoryEntry,
} from '../../lib/request-history'
import { Button } from '../ui/button'
import CurlImportDialog from '../request/CurlImportDialog'

function statusClass(status: number): string {
    if (status === 0) return 'text-[var(--dracula-red)]'
    if (status >= 200 && status < 300) return 'text-[var(--dracula-green)]'
    if (status >= 300 && status < 400) return 'text-[var(--dracula-yellow)]'
    if (status >= 400 && status < 500) return 'text-[var(--dracula-orange)]'
    return 'text-[var(--dracula-red)]'
}

interface HistoryListProps {
    searchQuery: string
}

export default function HistoryList({ searchQuery }: HistoryListProps) {
    const { t, i18n } = useTranslation()
    const workspaceId = useAppStore((s) => s.activeWorkspaceId)
    const addTab = useAppStore((s) => s.addTab)
    const [entries, setEntries] = useState<HistoryEntry[]>([])
    const [confirmClear, setConfirmClear] = useState(false)
    const [curlOpen, setCurlOpen] = useState(false)

    const refresh = useCallback(() => {
        setEntries(loadHistory(workspaceId))
    }, [workspaceId])

    useEffect(() => {
        refresh()
        return subscribeHistory(refresh)
    }, [refresh])

    useEffect(() => {
        setConfirmClear(false)
    }, [workspaceId])

    const query = searchQuery.trim().toLowerCase()
    const visible = query
        ? entries.filter((entry) => {
              const url = composeUrl(entry.url, entry.params).toLowerCase()
              return (
                  url.includes(query) ||
                  entry.method.toLowerCase().includes(query) ||
                  entry.name.toLowerCase().includes(query) ||
                  String(entry.status).includes(query)
              )
          })
        : entries

    const openEntry = (entry: HistoryEntry) => {
        addTab({
            name: entry.name || entry.method,
            method: entry.method,
            url: entry.url,
            headers: entry.headers,
            params: entry.params,
            body: entry.body,
            auth: entry.auth,
            scripts: entry.scripts,
            protocol: 'http',
        })
    }

    return (
        <div className="flex flex-col gap-1 px-2 py-2">
            <div className="flex items-center justify-end gap-1 px-1 pb-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setCurlOpen(true)}
                >
                    {t('request.importCurl')}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    disabled={entries.length === 0}
                    onClick={() => {
                        if (!confirmClear) {
                            setConfirmClear(true)
                            return
                        }
                        clearHistory(workspaceId)
                        setConfirmClear(false)
                    }}
                >
                    {confirmClear ? t('sidebar.historyClearConfirm') : t('sidebar.historyClear')}
                </Button>
            </div>
            {visible.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    {entries.length === 0 ? t('sidebar.historyEmpty') : t('sidebar.historyNoMatch')}
                </p>
            ) : (
                visible.map((entry) => {
                    const url = composeUrl(entry.url, entry.params) || entry.url
                    const when = new Date(entry.sentAt).toLocaleString(i18n.language, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                    return (
                        <div key={entry.id} className="group flex items-start gap-1 rounded-md hover:bg-sidebar-accent">
                            <button
                                type="button"
                                className="min-w-0 flex-1 px-2 py-1.5 text-left"
                                onClick={() => openEntry(entry)}
                                title={t('sidebar.historyOpen')}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-12 shrink-0 text-[10px] font-semibold ${METHOD_TEXT_CLASS[entry.method] ?? ''}`}
                                    >
                                        {entry.method}
                                    </span>
                                    <span className={`text-[10px] font-medium ${statusClass(entry.status)}`}>
                                        {entry.status === 0 ? t('sidebar.historyFailed') : entry.status}
                                    </span>
                                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{when}</span>
                                </div>
                                <div className="truncate text-xs text-sidebar-foreground">{url}</div>
                            </button>
                            <button
                                type="button"
                                className="mt-1.5 mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                                title={t('sidebar.historyRemove')}
                                aria-label={t('sidebar.historyRemove')}
                                onClick={() => removeHistoryEntry(workspaceId, entry.id)}
                            >
                                <X className="size-3.5" />
                            </button>
                        </div>
                    )
                })
            )}
            {entries.length > 0 ? (
                <p className="flex items-center gap-1 px-2 pt-2 text-[10px] text-muted-foreground">
                    <Trash2 className="size-3" />
                    {t('sidebar.historyLocalHint')}
                </p>
            ) : null}
            <CurlImportDialog open={curlOpen} onClose={() => setCurlOpen(false)} />
        </div>
    )
}
