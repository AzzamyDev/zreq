import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Plus, MoreHorizontal, UnfoldVertical, FoldVertical } from 'lucide-react'
import {
    closestCorners,
    DndContext,
    DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from '../ui/context-menu'
import { useCollection, type TreeDropPayload } from '../../hooks/useCollection'
import { useAppStore } from '../../store'
import { exportCollection } from '../../lib/importExport'
import RenameDialog from './RenameDialog'
import SaveRequestDialog from './SaveRequestDialog'
import CollectionSettingsDialog from './CollectionSettingsDialog'
import NewFolderDialog from './NewFolderDialog'
import TreeNode from './TreeNode'
import type { Collection } from '../../types'
import {
    SIDEBAR_MORE_MENU_ITEM,
    SIDEBAR_MORE_MENU_OUTER,
    SIDEBAR_MORE_MENU_PANEL,
} from '../../lib/sidebar-more-menu'

interface CollectionItemProps {
    collection: Collection
}

function RootEndDropZone({ collectionId }: { collectionId: number }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `rootend-${collectionId}`,
        data: { treeDrop: { kind: 'rootEnd', collectionId } satisfies TreeDropPayload },
    })
    return (
        <div
            ref={setNodeRef}
            className={`mx-1 min-h-3 shrink-0 rounded-sm ${isOver ? 'bg-primary/20' : ''}`}
            aria-hidden
        />
    )
}

export default function CollectionItem({ collection }: CollectionItemProps) {
    const { t } = useTranslation()
    const colKey = `col:${collection.id}`
    const expanded = useAppStore((s) => s.sidebarExpanded[colKey] ?? true)
    const [renameOpen, setRenameOpen] = useState(false)
    const [saveRequestOpen, setSaveRequestOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [targetFolderId, setTargetFolderId] = useState<string | undefined>(undefined)
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const [folderDialogOpen, setFolderDialogOpen] = useState(false)
    const moreMenuRef = useRef<HTMLDivElement>(null)
    const {
        renameCollection,
        deleteCollection,
        addFolder,
        addRequest,
        updateCollectionSettings,
        moveTreeItem,
        reorderSiblings,
    } = useCollection()
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

    const onDragEnd = useCallback(
        async (e: DragEndEvent) => {
            const { active, over } = e
            if (!over) return

            if (over.data.current?.treeDrop) {
                const payload = over.data.current.treeDrop as TreeDropPayload
                if (payload.collectionId !== collection.id) return
                const { collectionId: _cid, ...dest } = payload
                await moveTreeItem(collection.id, String(active.id), dest)
                return
            }

            const activeId = String(active.id)
            const overId = String(over.id)
            if (activeId === overId) return
            await reorderSiblings(collection.id, activeId, overId)
        },
        [collection.id, moveTreeItem, reorderSiblings]
    )

    // Close more menu when clicking outside
    useEffect(() => {
        if (!moreMenuOpen) return
        const handler = (e: MouseEvent) => {
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
                setMoreMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [moreMenuOpen])

    const handleExport = () => {
        const json = exportCollection(collection)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${collection.name.replace(/\s+/g, '_')}.zreq.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleAddFolder = () => {
        setMoreMenuOpen(false)
        setFolderDialogOpen(true)
    }

    const handleRename = async (newName: string) => {
        await renameCollection(collection.id, newName)
    }

    const handleDelete = async () => {
        await deleteCollection(collection.id)
    }

    const handleAddRequest = async (folderId?: string) => {
        setMoreMenuOpen(false)
        await addRequest(collection.id, t('collection.newRequest'), folderId)
    }

    const expandAllFolders = (e: React.MouseEvent) => {
        e.stopPropagation()
        useAppStore.getState().setAllSidebarFoldersExpanded(collection.id, collection.items ?? [], true)
    }

    const collapseAllFolders = (e: React.MouseEvent) => {
        e.stopPropagation()
        useAppStore.getState().setAllSidebarFoldersExpanded(collection.id, collection.items ?? [], false)
    }

    return (
        <div>
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        className={`group relative flex items-center gap-1 rounded-sm mx-1 px-2 py-1.5 text-sm font-medium cursor-pointer select-none hover:bg-[var(--sidebar-row-hover)] ${moreMenuOpen ? 'z-100 isolate' : 'z-0'}`}
                        onClick={() => useAppStore.getState().toggleSidebarCollectionExpanded(collection.id)}
                    >
                        {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate">{collection.name}</span>

                        {/* Hover action buttons */}
                        <div
                            className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 ${moreMenuOpen ? 'opacity-100' : ''}`}
                        >
                            <button
                                type="button"
                                onClick={expandAllFolders}
                                className="p-0.5 cursor-pointer rounded hover:bg-[var(--sidebar-row-hover)]"
                                title={t('collection.expandAll')}
                            >
                                <UnfoldVertical className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={collapseAllFolders}
                                className="p-0.5 cursor-pointer rounded hover:bg-[var(--sidebar-row-hover)]"
                                title={t('collection.collapseAll')}
                            >
                                <FoldVertical className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleAddRequest(undefined)
                                }}
                                className="p-0.5 cursor-pointer rounded hover:bg-[var(--sidebar-row-hover)]"
                                title={t('collection.addRequest')}
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                            <div className="relative" ref={moreMenuRef}>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setMoreMenuOpen((v) => !v)
                                    }}
                                    className="p-0.5 cursor-pointer rounded hover:bg-[var(--sidebar-row-hover)]"
                                    title={t('collection.moreActions')}
                                >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                                {moreMenuOpen && (
                                    <div className={SIDEBAR_MORE_MENU_OUTER}>
                                        <div className={SIDEBAR_MORE_MENU_PANEL}>
                                        <button
                                            type="button"
                                            className={SIDEBAR_MORE_MENU_ITEM}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                handleAddRequest(undefined)
                                            }}
                                        >
                                            {t('collection.addRequest')}
                                        </button>
                                        <button
                                            type="button"
                                            className={SIDEBAR_MORE_MENU_ITEM}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                handleAddFolder()
                                            }}
                                        >
                                            {t('collection.addFolder')}
                                        </button>
                                        <button
                                            type="button"
                                            className={SIDEBAR_MORE_MENU_ITEM}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                expandAllFolders(e)
                                            }}
                                        >
                                            {t('collection.expandAll')}
                                        </button>
                                        <button
                                            type="button"
                                            className={SIDEBAR_MORE_MENU_ITEM}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                collapseAllFolders(e)
                                            }}
                                        >
                                            {t('collection.collapseAll')}
                                        </button>
                                        <button
                                            type="button"
                                            className={SIDEBAR_MORE_MENU_ITEM}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                setSettingsOpen(true)
                                            }}
                                        >
                                            {t('common.settings')}
                                        </button>
                                        <button
                                            type="button"
                                            className={SIDEBAR_MORE_MENU_ITEM}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                setRenameOpen(true)
                                            }}
                                        >
                                            {t('common.rename')}
                                        </button>
                                        <button
                                            type="button"
                                            className={SIDEBAR_MORE_MENU_ITEM}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                handleExport()
                                            }}
                                        >
                                            {t('collection.export')}
                                        </button>
                                        <button
                                            type="button"
                                            className={`${SIDEBAR_MORE_MENU_ITEM} text-destructive hover:text-destructive`}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                handleDelete()
                                            }}
                                        >
                                            {t('common.delete')}
                                        </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => { setTargetFolderId(undefined); setSaveRequestOpen(true) }}>
                        {t('collection.addRequest')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleAddFolder}>
                        {t('collection.addFolder')}
                    </ContextMenuItem>
                    <ContextMenuItem
                        onClick={() =>
                            useAppStore
                                .getState()
                                .setAllSidebarFoldersExpanded(collection.id, collection.items ?? [], true)
                        }
                    >
                        {t('collection.expandAll')}
                    </ContextMenuItem>
                    <ContextMenuItem
                        onClick={() =>
                            useAppStore
                                .getState()
                                .setAllSidebarFoldersExpanded(collection.id, collection.items ?? [], false)
                        }
                    >
                        {t('collection.collapseAll')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => setSettingsOpen(true)}>
                        {t('common.settings')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => setRenameOpen(true)}>
                        {t('common.rename')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleExport}>
                        {t('collection.export')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={handleDelete}>
                        {t('common.delete')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {expanded && (
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
                    <SortableContext
                        items={(collection.items ?? []).map((i) => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {collection.items?.map((item) => (
                            <TreeNode
                                key={item.id}
                                item={item}
                                collectionId={collection.id}
                                parentFolderId={undefined}
                                depth={0}
                                onAddRequest={(folderId) => {
                                    setTargetFolderId(folderId)
                                    setSaveRequestOpen(true)
                                }}
                                ancestorNames={[collection.name]}
                            />
                        ))}
                    </SortableContext>
                    <RootEndDropZone collectionId={collection.id} />
                </DndContext>
            )}

            <RenameDialog
                open={renameOpen}
                onClose={() => setRenameOpen(false)}
                onRename={handleRename}
                initialName={collection.name}
                title={t('collection.renameCollection')}
            />
            <SaveRequestDialog
                open={saveRequestOpen}
                onClose={() => {
                    setSaveRequestOpen(false)
                    setTargetFolderId(undefined)
                }}
                defaultFolderId={targetFolderId}
            />
            <CollectionSettingsDialog
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                collection={collection}
                onSave={(updates) => updateCollectionSettings(collection.id, updates)}
            />
            <NewFolderDialog
                open={folderDialogOpen}
                onClose={() => setFolderDialogOpen(false)}
                onConfirm={async (name) => {
                    await addFolder(collection.id, name)
                }}
            />
        </div>
    )
}
