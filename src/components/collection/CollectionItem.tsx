import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Plus, MoreHorizontal, UnfoldVertical, FoldVertical, Trash2, X } from 'lucide-react'
import {
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
import { saveTextFile } from '../../lib/utils'
import { toast } from 'sonner'
import RenameDialog from './RenameDialog'
import SaveRequestDialog from './SaveRequestDialog'
import CollectionSettingsDialog from './CollectionSettingsDialog'
import NewFolderDialog from './NewFolderDialog'
import TreeNode from './TreeNode'
import type { Collection } from '../../types'
import { flattenVisibleTreeItemIds } from '../../lib/collection-tree-select'
import { CollectionSelectionContext } from './CollectionSelectionContext'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import {
    SIDEBAR_MORE_MENU_ITEM,
    SIDEBAR_MORE_MENU_OUTER,
    SIDEBAR_MORE_MENU_PANEL,
} from '../../lib/sidebar-more-menu'
import { SIDEBAR_DROP_ACTIVE, SIDEBAR_DROP_ACTIVE_STRIP } from '../../lib/sidebar-drop-zone'

interface CollectionItemProps {
    collection: Collection
}

function CollectionHeaderDropZone({
    collectionId,
    children,
    className,
    title,
}: {
    collectionId: number
    children: React.ReactNode
    className?: string
    title?: string
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: `colroot-${collectionId}`,
        data: { treeDrop: { kind: 'rootEnd', collectionId } satisfies TreeDropPayload },
    })
    return (
        <div
            ref={setNodeRef}
            className={`relative z-10 transition-colors duration-150 ${className ?? ''} ${isOver ? SIDEBAR_DROP_ACTIVE : ''}`}
            title={title}
        >
            {children}
        </div>
    )
}

function RootEndDropZone({ collectionId }: { collectionId: number }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `rootend-${collectionId}`,
        data: { treeDrop: { kind: 'rootEnd', collectionId } satisfies TreeDropPayload },
    })
    return (
        <div
            ref={setNodeRef}
            className={`mx-1 min-h-1 shrink-0 rounded-sm transition-colors duration-150 ${isOver ? SIDEBAR_DROP_ACTIVE_STRIP : ''}`}
            aria-hidden
        />
    )
}

export default function CollectionItem({ collection }: CollectionItemProps) {
    const { t } = useTranslation()
    const colKey = `col:${collection.id}`
    const expanded = useAppStore((s) => s.sidebarExpanded[colKey] ?? true)
    const toggleSidebarCollectionExpanded = useAppStore((s) => s.toggleSidebarCollectionExpanded)
    const [renameOpen, setRenameOpen] = useState(false)
    const [saveRequestOpen, setSaveRequestOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [targetFolderId, setTargetFolderId] = useState<string | undefined>(undefined)
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const [addMenuOpen, setAddMenuOpen] = useState(false)
    const [folderDialogOpen, setFolderDialogOpen] = useState(false)
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const moreMenuRef = useRef<HTMLDivElement>(null)
    const addMenuRef = useRef<HTMLDivElement>(null)
    const {
        renameCollection,
        deleteCollection,
        addFolder,
        addRequest,
        addWebSocketRequest,
        updateCollectionSettings,
        deleteItems,
    } = useCollection()
    const sidebarExpanded = useAppStore((s) => s.sidebarExpanded)
    const sidebarSelection = useAppStore((s) => s.sidebarSelection)
    const clearSidebarSelection = useAppStore((s) => s.clearSidebarSelection)

    const flatVisibleIds = useMemo(
        () => flattenVisibleTreeItemIds(collection.items ?? [], collection.id, sidebarExpanded),
        [collection.id, collection.items, sidebarExpanded]
    )

    const selectedInCollection =
        sidebarSelection?.collectionId === collection.id ? sidebarSelection.ids : []
    const selectionCount = selectedInCollection.length

    const handleBulkDelete = async () => {
        await deleteItems(collection.id, selectedInCollection)
        setBulkDeleteOpen(false)
    }

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

    useEffect(() => {
        if (!addMenuOpen) return
        const handler = (e: MouseEvent) => {
            if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
                setAddMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [addMenuOpen])

    const handleExport = async () => {
        const json = exportCollection(collection)
        const filename = `${collection.name.replace(/\s+/g, '_')}.zreq.json`
        const result = await saveTextFile(filename, json, 'application/json')
        if (result === 'saved') {
            toast.success(t('common.exportSuccess', { filename }))
        } else if (result === 'error') {
            toast.error(t('common.exportFailed'))
        }
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
        setAddMenuOpen(false)
        await addRequest(collection.id, t('collection.newRequest'), folderId)
    }

    const handleAddWebSocketRequest = async (folderId?: string) => {
        setMoreMenuOpen(false)
        setAddMenuOpen(false)
        await addWebSocketRequest(collection.id, t('collection.newWebSocketRequest'), folderId)
    }

    const sidebarActionClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
    }

    const expandAllFolders = (e: React.MouseEvent) => {
        sidebarActionClick(e)
        const items =
            useAppStore.getState().collections.find((c) => c.id === collection.id)?.items ??
            collection.items ??
            []
        useAppStore.getState().setAllSidebarFoldersExpanded(collection.id, items, true)
    }

    const collapseAllFolders = (e: React.MouseEvent) => {
        sidebarActionClick(e)
        const items =
            useAppStore.getState().collections.find((c) => c.id === collection.id)?.items ??
            collection.items ??
            []
        useAppStore.getState().setAllSidebarFoldersExpanded(collection.id, items, false)
    }

    return (
        <div>
            <ContextMenu>
                <CollectionHeaderDropZone
                    collectionId={collection.id}
                    title={t('collection.dropIntoCollection')}
                    className={`group relative flex items-center gap-1 rounded-sm mb-1 mx-1 px-2 py-1.5 text-sm font-medium select-none hover:bg-[var(--sidebar-row-hover)] ${moreMenuOpen || addMenuOpen ? 'z-100 isolate' : 'z-0'}`}
                >
                    <ContextMenuTrigger
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1"
                        onClick={() => toggleSidebarCollectionExpanded(collection.id)}
                    >
                        {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate">{collection.name}</span>
                    </ContextMenuTrigger>

                    {/* Hover action buttons — outside trigger so clicks never toggle the collection row */}
                    <div
                        className={`flex shrink-0 items-center gap-0.5 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 ${moreMenuOpen || addMenuOpen ? 'pointer-events-auto opacity-100' : ''}`}
                        onPointerDown={(e) => e.stopPropagation()}
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
                            <div className="relative" ref={addMenuRef}>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setMoreMenuOpen(false)
                                        setAddMenuOpen((v) => !v)
                                    }}
                                    className="p-0.5 cursor-pointer rounded hover:bg-[var(--sidebar-row-hover)]"
                                    title={t('collection.addRequest')}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                                {addMenuOpen && (
                                    <div className={SIDEBAR_MORE_MENU_OUTER}>
                                        <div className={SIDEBAR_MORE_MENU_PANEL}>
                                            <button
                                                type="button"
                                                className={SIDEBAR_MORE_MENU_ITEM}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    void handleAddRequest(undefined)
                                                }}
                                            >
                                                {t('collection.addRequest')}
                                            </button>
                                            <button
                                                type="button"
                                                className={SIDEBAR_MORE_MENU_ITEM}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    void handleAddWebSocketRequest(undefined)
                                                }}
                                            >
                                                {t('collection.addWebSocketRequest')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="relative" ref={moreMenuRef}>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setAddMenuOpen(false)
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
                                                void handleExport()
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
                </CollectionHeaderDropZone>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => { setTargetFolderId(undefined); setSaveRequestOpen(true) }}>
                        {t('collection.addRequest')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => void handleAddWebSocketRequest(undefined)}>
                        {t('collection.addWebSocketRequest')}
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
                    <ContextMenuItem onClick={() => void handleExport()}>
                        {t('collection.export')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={handleDelete}>
                        {t('common.delete')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {expanded && (
                <>
                    {selectionCount > 0 && (
                        <div
                            className="mx-1 mb-1 flex flex-col gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs animate-in fade-in slide-in-from-top-1 duration-200"
                            title={t('collection.multiSelectHint')}
                        >
                            <div className="flex items-center gap-1">
                            <span className="flex-1 truncate font-medium text-foreground">
                                {t('collection.selectedCount', { count: selectionCount })}
                            </span>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-destructive transition-colors hover:bg-destructive/10"
                                title={t('collection.deleteSelected')}
                                onClick={() => setBulkDeleteOpen(true)}
                            >
                                <Trash2 className="h-3 w-3" />
                                {t('common.delete')}
                            </button>
                            <button
                                type="button"
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-[var(--sidebar-row-hover)] hover:text-foreground"
                                title={t('collection.clearSelection')}
                                onClick={clearSidebarSelection}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                            </div>
                        </div>
                    )}
                    <CollectionSelectionContext.Provider value={flatVisibleIds}>
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
                                    onAddWebSocketRequest={(folderId) => void handleAddWebSocketRequest(folderId)}
                                    ancestorNames={[collection.name]}
                                />
                            ))}
                        </SortableContext>
                        <RootEndDropZone collectionId={collection.id} />
                    </CollectionSelectionContext.Provider>
                </>
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
            <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>{t('collection.deleteSelected')}</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        {t('collection.deleteSelectedConfirm', { count: selectionCount })}
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button variant="destructive" onClick={() => void handleBulkDelete()}>
                            {t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
