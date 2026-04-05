import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useAppStore } from '../../store'
import { useCollection } from '../../hooks/useCollection'
import CollectionItem from './CollectionItem'
import NewCollectionDialog from './NewCollectionDialog'
import { useState } from 'react'
import { importCollection } from '../../lib/importExport'
import { createLocalCollection } from '@/lib/local-replica/local-write'
import { toast } from 'sonner'

interface CollectionTreeProps {
    openNew?: boolean
    onNewDialogClose?: () => void
}

export default function CollectionTree({
    openNew = false,
    onNewDialogClose,
}: CollectionTreeProps) {
    const { t } = useTranslation()
    const { collections, activeWorkspaceId } = useAppStore()
    const { createCollection } = useCollection()
    const [showNewDialog, setShowNewDialog] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Sync external openNew prop into local dialog state
    useEffect(() => {
        if (openNew) {
            setShowNewDialog(true)
        }
    }, [openNew])

    const handleNewDialogClose = () => {
        setShowNewDialog(false)
        onNewDialogClose?.()
    }

    const handleCreate = async (name: string) => {
        await createCollection(name)
    }

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
        <div className="py-1">
            {collections.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
                    <p className="text-xs text-muted-foreground">{t('collection.noCollections')}</p>
                    <button
                        className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
                        onClick={() => setShowNewDialog(true)}
                    >
                        {t('collection.createFirstCollection')}
                    </button>
                    <button
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground hover:opacity-80"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {t('collection.orImportCollection')}
                    </button>
                </div>
            ) : (
                collections.map((col) => <CollectionItem key={col.id} collection={col} />)
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportFile}
            />

            <NewCollectionDialog
                open={showNewDialog}
                onClose={handleNewDialogClose}
                onCreate={handleCreate}
            />
        </div>
    )
}
