import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import { collectionTreeCollisionDetection } from '../../lib/collection-tree-collision'
import { useAppStore } from '../../store'
import { useCollection } from '../../hooks/useCollection'
import { useCollectionTreeDragEnd } from '../../hooks/useCollectionTreeDragEnd'
import CollectionItem from './CollectionItem'
import NewCollectionDialog from './NewCollectionDialog'
import { useState } from 'react'
import { importCollections } from '../../lib/importExport'
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
    const onDragEnd = useCollectionTreeDragEnd()
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
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
        const files = Array.from(e.target.files ?? [])
        if (files.length === 0) return
        try {
            if (activeWorkspaceId == null) {
                toast.warning(t('sidebar.selectWorkspaceFirst'))
                return
            }
            let imported = 0
            for (const file of files) {
                const text = await file.text()
                const rows = importCollections(text)
                for (const data of rows) {
                    const { name, items, ...extra } = data
                    await createLocalCollection(name, items as unknown[], extra)
                    imported += 1
                }
            }
            if (imported > 0) {
                toast.success(t('sidebar.importedCollections', { count: imported }))
            }
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
                <DndContext sensors={sensors} collisionDetection={collectionTreeCollisionDetection} onDragEnd={onDragEnd}>
                    {collections.map((col) => (
                        <div key={col.id} className="mb-1">
                            <CollectionItem collection={col} />
                        </div>
                    ))}
                </DndContext>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                multiple
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
