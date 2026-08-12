import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { collectionTreeCollisionDetection } from '../../lib/collection-tree-collision'
import { colSortId, filterCollectionsByQuery } from '../../lib/collection-tree'
import { useAppStore } from '../../store'
import { useCollection } from '../../hooks/useCollection'
import { useCollectionTreeDragEnd } from '../../hooks/useCollectionTreeDragEnd'
import CollectionItem from './CollectionItem'
import NewCollectionDialog from './NewCollectionDialog'

interface CollectionTreeProps {
    openNew?: boolean
    onNewDialogClose?: () => void
    onImportClick?: () => void
    searchQuery?: string
}

export default function CollectionTree({
    openNew = false,
    onNewDialogClose,
    onImportClick,
    searchQuery = '',
}: CollectionTreeProps) {
    const { t } = useTranslation()
    const { collections } = useAppStore()
    const { createCollection } = useCollection()
    const onDragEnd = useCollectionTreeDragEnd()
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
    const [showNewDialog, setShowNewDialog] = useState(false)

    const q = searchQuery.trim()
    const searchActive = q.length > 0
    const visibleCollections = useMemo(
        () => filterCollectionsByQuery(collections, q),
        [collections, q]
    )

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
                        onClick={() => onImportClick?.()}
                    >
                        {t('collection.orImportCollection')}
                    </button>
                </div>
            ) : visibleCollections.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('common.noMatch')}</p>
            ) : (
                <DndContext sensors={sensors} collisionDetection={collectionTreeCollisionDetection} onDragEnd={onDragEnd}>
                    <SortableContext
                        items={visibleCollections.map((c) => colSortId(c.id))}
                        strategy={verticalListSortingStrategy}
                    >
                        {visibleCollections.map((col) => (
                            <div key={col.id} className="mb-1">
                                <CollectionItem
                                    collection={col}
                                    forceExpand={searchActive}
                                    dragDisabled={searchActive}
                                />
                            </div>
                        ))}
                    </SortableContext>
                </DndContext>
            )}

            <NewCollectionDialog
                open={showNewDialog}
                onClose={handleNewDialogClose}
                onCreate={handleCreate}
            />
        </div>
    )
}
