import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { Button } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import CollectionTree from '../collection/CollectionTree'
import { importCollection } from '../../lib/importExport'
import { createLocalCollection } from '@/lib/local-replica/local-write'
import { useAppStore } from '../../store'
import { useSyncStore } from '@/store/syncStore'
import { toast } from 'sonner'

export default function Sidebar() {
    const { t } = useTranslation()
    const [openNew, setOpenNew] = useState(false)
    const { activeWorkspaceId } = useAppStore()
    const pendingOutbox = useSyncStore((s) => s.pendingOutbox)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            if (activeWorkspaceId == null) {
                toast.warning(t('sidebar.selectWorkspaceFirst'))
                return
            }
            const text = await file.text()
            const data = importCollection(text)
            const { name, items, ...extra } = data
            await createLocalCollection(name, items as unknown[], extra)
        } catch (err) {
            console.error(err)
            const detail = isAxiosError(err)
                ? (typeof err.response?.data?.message === 'string'
                      ? err.response.data.message
                      : Array.isArray(err.response?.data?.message)
                        ? err.response.data.message.join(', ')
                        : err.response?.data?.error)
                : err instanceof Error
                  ? err.message
                  : String(err)
            toast.error(t('sidebar.importFailed'), detail ? { description: String(detail) } : undefined)
        }
        e.target.value = ''
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
            <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <span className="truncate">{t('sidebar.collections')}</span>
                    {pendingOutbox > 0 ? (
                        <span
                            className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium normal-case text-amber-800 dark:text-amber-200"
                            title={t('sync.sidebarPending')}
                        >
                            {pendingOutbox}
                        </span>
                    ) : null}
                </span>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => fileInputRef.current?.click()}
                        title={t('sidebar.importTitle')}
                    >
                        <Upload className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setOpenNew(true)}
                        title={t('sidebar.newCollectionTitle')}
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportFile}
            />
            <ScrollArea className="flex-1">
                <CollectionTree
                    openNew={openNew}
                    onNewDialogClose={() => setOpenNew(false)}
                />
            </ScrollArea>
        </div>
    )
}
