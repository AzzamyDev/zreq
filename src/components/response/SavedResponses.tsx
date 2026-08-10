import { useTranslation } from 'react-i18next'
import { Play } from 'lucide-react'
import { useAppStore } from '../../store'
import { useCollection } from '../../hooks/useCollection'
import { Button } from '../ui/button'
import { getStatusColor } from './ResponseStats'
import type { SavedResponse } from '../../types'

function formatTimestamp(ms: number): string {
    return new Date(ms).toLocaleString()
}

export default function SavedResponses() {
    const { t } = useTranslation()
    const activeRequest = useAppStore((s) => s.activeRequest)
    const breadcrumb = useAppStore((s) => s.breadcrumb)
    const openSavedResponseTab = useAppStore((s) => s.openSavedResponseTab)
    const { setSavedResponses } = useCollection()
    const saved = activeRequest.savedResponses ?? []

    const loadSaved = (item: SavedResponse) => {
        const savedLabel = item.name ?? formatTimestamp(item.savedAt)
        openSavedResponseTab(
            {
                id: activeRequest.itemId ?? '',
                name: activeRequest.name,
                scripts: activeRequest.scripts,
                protocol: activeRequest.protocol,
                subprotocols: activeRequest.subprotocols,
                messageTemplate: activeRequest.messageTemplate,
                savedResponses: activeRequest.savedResponses,
            },
            item,
            [...breadcrumb, savedLabel],
            activeRequest.collectionId != null ? { collectionId: activeRequest.collectionId } : undefined,
        )
    }

    const removeSaved = (id: string) => {
        const next = saved.filter((s) => s.id !== id)
        if (activeRequest.collectionId != null && activeRequest.itemId) {
            void setSavedResponses(activeRequest.collectionId, activeRequest.itemId, next)
        } else {
            useAppStore.getState().setActiveRequest({ savedResponses: next })
        }
    }

    if (saved.length === 0) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center p-3">
                <p className="text-sm text-muted-foreground">{t('response.noSavedResponses')}</p>
            </div>
        )
    }

    return (
        <div className="h-full min-h-0 overflow-auto p-3">
            <ul className="space-y-1">
                {[...saved].reverse().map((item) => (
                    <li
                        key={item.id}
                        className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-xs"
                    >
                        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${getStatusColor(item.response.status)}`}>
                            {item.response.status}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                                {item.name ?? `${item.requestSnapshot?.method ?? ''} ${item.requestSnapshot?.url ?? ''}`}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                                {item.requestSnapshot?.method} {item.requestSnapshot?.url} · {formatTimestamp(item.savedAt)}
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => loadSaved(item)}
                            title={t('response.loadSavedResponse')}
                        >
                            <Play className="size-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeSaved(item.id)}
                            title={t('response.deleteSavedResponse')}
                        >
                            ×
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    )
}
