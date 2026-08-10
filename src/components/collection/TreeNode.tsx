import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ChevronRight,
    ChevronDown,
    Folder,
    FolderOpen,
    Globe,
    GripVertical,
    Plus,
    MoreHorizontal,
    Radio,
    FileText,
} from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from '../ui/context-menu'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useCollection, type TreeDropPayload } from '../../hooks/useCollection'
import { useAppStore } from '../../store'
import { useCollectionFlatVisibleIds } from './CollectionSelectionContext'
import RenameDialog from './RenameDialog'
import NewFolderDialog from './NewFolderDialog'
import FolderSettingsDialog from './FolderSettingsDialog'
import type { RequestItem, Folder as FolderType, SavedResponse } from '../../types'
import { getStatusColor } from '../response/ResponseStats'
import { METHOD_BG_CLASS, METHOD_TEXT_CLASS, requestBadgeLabel } from '../../lib/httpMethodTheme'
import { inferProtocolFromUrl } from '../../lib/persist-request'
import { isRangeSelectModifier, isToggleSelectModifier } from '../../lib/modifier-keys'
import { SIDEBAR_DROP_ACTIVE, SIDEBAR_DROP_ACTIVE_ROW } from '../../lib/sidebar-drop-zone'
import {
    SIDEBAR_MORE_MENU_ITEM,
    SIDEBAR_MORE_MENU_OUTER,
    SIDEBAR_MORE_MENU_PANEL,
} from '../../lib/sidebar-more-menu'

interface TreeNodeProps {
    item: RequestItem | FolderType
    collectionId: number
    parentFolderId?: string
    depth?: number
    onAddRequest?: (parentFolderId?: string) => void
    onAddWebSocketRequest?: (parentFolderId?: string) => void
    ancestorNames?: string[]
}

function InlineMenu({ children }: { children: React.ReactNode }) {
    return (
        <div className={SIDEBAR_MORE_MENU_OUTER}>
            <div className={SIDEBAR_MORE_MENU_PANEL}>{children}</div>
        </div>
    )
}

function MenuButton({
    onClick,
    destructive,
    children,
}: {
    onClick: (e: React.MouseEvent) => void
    destructive?: boolean
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            className={`${SIDEBAR_MORE_MENU_ITEM} ${destructive ? 'text-destructive hover:text-destructive' : ''}`}
            onClick={onClick}
        >
            {children}
        </button>
    )
}

function TreeRowCheckbox({
    checked,
    visible,
    onToggle,
}: {
    checked: boolean
    visible: boolean
    onToggle: (e: React.MouseEvent) => void
}) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={onToggle}
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-all ${checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/40 bg-transparent hover:border-primary/60'
                } ${visible || checked ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}
        >
            {checked ? (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                    <path
                        d="M2.5 6.2 4.8 8.5 9.5 3.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            ) : null}
        </button>
    )
}

function useTreeRowSelection(collectionId: number, itemId: string) {
    const flatVisibleIds = useCollectionFlatVisibleIds()
    const sidebarSelection = useAppStore((s) => s.sidebarSelection)
    const selectSidebarItem = useAppStore((s) => s.selectSidebarItem)
    const clearSidebarSelection = useAppStore((s) => s.clearSidebarSelection)
    const setSidebarSelectAnchor = useAppStore((s) => s.setSidebarSelectAnchor)

    const isMultiSelected =
        sidebarSelection?.collectionId === collectionId && sidebarSelection.ids.includes(itemId)
    const selectionActive =
        sidebarSelection?.collectionId === collectionId && (sidebarSelection?.ids.length ?? 0) > 0
    const multiDragCount =
        isMultiSelected && sidebarSelection ? sidebarSelection.ids.length : 0

    const handleSelectionPointer = (e: React.MouseEvent) => {
        if (isRangeSelectModifier(e)) {
            e.stopPropagation()
            e.preventDefault()
            selectSidebarItem(collectionId, itemId, 'range', flatVisibleIds)
            return true
        }
        if (isToggleSelectModifier(e)) {
            e.stopPropagation()
            e.preventDefault()
            selectSidebarItem(collectionId, itemId, 'toggle')
            return true
        }
        return false
    }

    const toggleCheckbox = (e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        selectSidebarItem(collectionId, itemId, 'toggle')
    }

    const notePrimaryClick = () => {
        setSidebarSelectAnchor(collectionId, itemId)
        if (selectionActive) clearSidebarSelection()
    }

    return {
        isMultiSelected,
        selectionActive,
        multiDragCount,
        handleSelectionPointer,
        toggleCheckbox,
        notePrimaryClick,
    }
}

function FolderTreeNode({
    item: folder,
    collectionId,
    parentFolderId,
    depth = 0,
    onAddRequest,
    onAddWebSocketRequest,
    ancestorNames = [],
}: Omit<TreeNodeProps, 'item'> & { item: FolderType }) {
    const { t } = useTranslation()
    const [renameOpen, setRenameOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const [addMenuOpen, setAddMenuOpen] = useState(false)
    const [folderDialogOpen, setFolderDialogOpen] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const moreMenuRef = useRef<HTMLDivElement>(null)
    const addMenuRef = useRef<HTMLDivElement>(null)
    const { deleteItem, renameItem, addFolder, addRequest, addWebSocketRequest, updateFolderSettings } = useCollection()
    const {
        isMultiSelected,
        selectionActive,
        multiDragCount,
        handleSelectionPointer,
        toggleCheckbox,
        notePrimaryClick,
    } = useTreeRowSelection(collectionId, folder.id)

    const fldKey = `fld:${collectionId}:${folder.id}`
    const expandRevision = useAppStore((s) => s.sidebarExpandRevision)
    const expanded = useAppStore((s) => {
        void expandRevision
        return s.sidebarExpanded[fldKey] === true
    })
    const toggleSidebarFolderExpanded = useAppStore((s) => s.toggleSidebarFolderExpanded)

    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: folder.id })
    const { setNodeRef: setIntoRef, isOver: isIntoOver } = useDroppable({
        id: `into-${collectionId}-${folder.id}`,
        data: {
            treeDrop: {
                kind: 'intoFolder',
                collectionId,
                folderId: folder.id,
            } satisfies TreeDropPayload,
        },
    })

    const indent = depth * 12
    const rowStyle: CSSProperties = {
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: isDragging ? 0.4 : undefined,
        paddingLeft: `${8 + indent}px`,
    }
    const folderAncestors = [...ancestorNames, folder.name]

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

    const handleRename = async (newName: string) => {
        await renameItem(collectionId, folder.id, newName)
    }

    const handleDelete = async () => {
        await deleteItem(collectionId, folder.id)
    }

    const handleAddSubFolder = () => {
        setMoreMenuOpen(false)
        setFolderDialogOpen(true)
    }

    const handleAddRequestToFolder = async () => {
        setMoreMenuOpen(false)
        setAddMenuOpen(false)
        await addRequest(collectionId, t('collection.newRequest'), folder.id)
    }

    const handleAddWebSocketToFolder = async () => {
        setMoreMenuOpen(false)
        setAddMenuOpen(false)
        await addWebSocketRequest(collectionId, t('collection.newWebSocketRequest'), folder.id)
    }

    const toggleFolder = (e: React.MouseEvent) => {
        if (handleSelectionPointer(e)) return
        notePrimaryClick()
        toggleSidebarFolderExpanded(collectionId, folder.id)
    }

    return (
        <div className="flex min-w-0 flex-col">
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        ref={setNodeRef}
                        {...attributes}
                        onClick={toggleFolder}
                        className={`group relative mx-1 flex select-none items-center gap-1 rounded-sm px-2 py-1 text-sm cursor-pointer hover:bg-[var(--sidebar-row-hover)] ${moreMenuOpen || addMenuOpen ? 'z-100 isolate' : isDragging ? 'z-10' : 'z-0'
                            } ${isMultiSelected && !isIntoOver && !isOver ? 'bg-[var(--sidebar-row-selected)] ring-1 ring-primary/25' : ''} ${isIntoOver ? SIDEBAR_DROP_ACTIVE : isOver ? SIDEBAR_DROP_ACTIVE_ROW : ''}`}
                        style={rowStyle}
                    >
                        <TreeRowCheckbox
                            checked={isMultiSelected}
                            visible={selectionActive}
                            onToggle={toggleCheckbox}
                        />
                        <div
                            ref={setIntoRef}
                            className="flex min-w-0 flex-1 items-center gap-1 rounded-sm py-0.5"
                        >
                            {expanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            {expanded ? (
                                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="flex-1 truncate">{folder.name}</span>
                        </div>

                        <div
                            className={`flex shrink-0 items-center gap-0.5 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 ${moreMenuOpen || addMenuOpen || isDragging ? 'pointer-events-auto opacity-100' : ''}`}
                        >
                            <div className="relative" ref={addMenuRef}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setMoreMenuOpen(false)
                                        setAddMenuOpen((v) => !v)
                                    }}
                                    className="cursor-pointer rounded p-0.5 hover:bg-[var(--sidebar-row-hover)]"
                                    title={t('collection.addRequest')}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                                {addMenuOpen && (
                                    <InlineMenu>
                                        <MenuButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                void handleAddRequestToFolder()
                                            }}
                                        >
                                            {t('collection.addRequest')}
                                        </MenuButton>
                                        <MenuButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                void handleAddWebSocketToFolder()
                                            }}
                                        >
                                            {t('collection.addWebSocketRequest')}
                                        </MenuButton>
                                    </InlineMenu>
                                )}
                            </div>
                            <div className="relative" ref={moreMenuRef}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setAddMenuOpen(false)
                                        setMoreMenuOpen((v) => !v)
                                    }}
                                    className="cursor-pointer rounded p-0.5 hover:bg-[var(--sidebar-row-hover)]"
                                    title={t('collection.moreActions')}
                                >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                                {moreMenuOpen && (
                                    <InlineMenu>
                                        <MenuButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleAddRequestToFolder()
                                            }}
                                        >
                                            {t('collection.addRequest')}
                                        </MenuButton>
                                        <MenuButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                void handleAddWebSocketToFolder()
                                            }}
                                        >
                                            {t('collection.addWebSocketRequest')}
                                        </MenuButton>
                                        <MenuButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                handleAddSubFolder()
                                            }}
                                        >
                                            {t('collection.addFolder')}
                                        </MenuButton>
                                        <MenuButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                setRenameOpen(true)
                                            }}
                                        >
                                            {t('common.rename')}
                                        </MenuButton>
                                        <MenuButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                setSettingsOpen(true)
                                            }}
                                        >
                                            {t('common.settings')}
                                        </MenuButton>
                                        <MenuButton
                                            destructive
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                setDeleteConfirmOpen(true)
                                            }}
                                        >
                                            {t('common.delete')}
                                        </MenuButton>
                                    </InlineMenu>
                                )}
                            </div>
                            <button
                                type="button"
                                ref={setActivatorNodeRef}
                                {...listeners}
                                className="relative shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-[var(--sidebar-row-hover)] active:cursor-grabbing"
                                title={
                                    multiDragCount > 1
                                        ? t('collection.dragToMoveMultiple', { count: multiDragCount })
                                        : t('collection.dragToMove')
                                }
                                onClick={(e) => e.stopPropagation()}
                            >
                                <GripVertical className="h-3.5 w-3.5" />
                                {multiDragCount > 1 && isDragging ? (
                                    <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground">
                                        {multiDragCount}
                                    </span>
                                ) : null}
                            </button>
                        </div>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => onAddRequest?.(folder.id)}>{t('collection.addRequest')}</ContextMenuItem>
                    <ContextMenuItem onClick={() => onAddWebSocketRequest?.(folder.id)}>{t('collection.addWebSocketRequest')}</ContextMenuItem>
                    <ContextMenuItem onClick={handleAddSubFolder}>{t('collection.addFolder')}</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => setRenameOpen(true)}>{t('common.rename')}</ContextMenuItem>
                    <ContextMenuItem onClick={() => setSettingsOpen(true)}>{t('common.settings')}</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                        {t('common.delete')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {expanded && (
                <SortableContext
                    items={(folder.items ?? []).map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {folder.items?.map((child) => (
                        <TreeNode
                            key={child.id}
                            item={child}
                            collectionId={collectionId}
                            parentFolderId={folder.id}
                            depth={depth + 1}
                            onAddRequest={onAddRequest}
                            onAddWebSocketRequest={onAddWebSocketRequest}
                            ancestorNames={folderAncestors}
                        />
                    ))}
                </SortableContext>
            )}

            <RenameDialog
                open={renameOpen}
                onClose={() => setRenameOpen(false)}
                onRename={handleRename}
                initialName={folder.name}
                title={t('collection.renameFolder')}
            />
            <NewFolderDialog
                open={folderDialogOpen}
                onClose={() => setFolderDialogOpen(false)}
                onConfirm={async (name) => {
                    await addFolder(collectionId, name, folder.id)
                }}
            />
            <FolderSettingsDialog
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                collectionId={collectionId}
                folder={folder}
                onSave={(updates) => updateFolderSettings(collectionId, folder.id, updates)}
            />
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>{t('common.delete')}</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Delete this folder and all nested items?
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                await handleDelete()
                                setDeleteConfirmOpen(false)
                            }}
                        >
                            {t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function SavedResponseRow({
    collectionId,
    reqItem,
    saved,
    depth,
    ancestorNames,
}: {
    collectionId: number
    reqItem: RequestItem
    saved: SavedResponse
    depth: number
    ancestorNames: string[]
}) {
    const { t } = useTranslation()
    const [renameOpen, setRenameOpen] = useState(false)
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const moreMenuRef = useRef<HTMLDivElement>(null)
    const { setSavedResponses } = useCollection()
    const openSavedResponseTab = useAppStore((s) => s.openSavedResponseTab)
    const activeRequest = useAppStore((s) => s.activeRequest)
    const isSelected = activeRequest.itemId === reqItem.id && activeRequest.savedResponseId === saved.id
    /** Extra offset beyond normal depth-nesting so this reads as nested under the request row. */
    const indent = depth * 12 + 20

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

    const persistWith = async (next: SavedResponse[]) => {
        // Routes through setSavedResponses so a removed entry also closes any tab viewing it.
        await setSavedResponses(collectionId, reqItem.id, next)
        const live = useAppStore.getState().activeRequest
        if (live.itemId === reqItem.id) {
            // If the tab currently open is this exact saved response, keep its displayed name
            // (Input/tab title) AND breadcrumb's last segment in sync too.
            const stillOpen = live.savedResponseId ? next.find((s) => s.id === live.savedResponseId) : undefined
            if (stillOpen?.name) {
                useAppStore.getState().setActiveRequest({ name: stillOpen.name })
                const bc = useAppStore.getState().breadcrumb
                if (bc.length > 0) {
                    useAppStore.getState().setBreadcrumb([...bc.slice(0, -1), stillOpen.name])
                }
            }
        }
    }

    const handleLoad = (e: React.MouseEvent) => {
        e.stopPropagation()
        const savedLabel = saved.name ?? new Date(saved.savedAt).toLocaleString()
        const fullPath = [...ancestorNames, reqItem.name, savedLabel]
        openSavedResponseTab(reqItem, saved, fullPath, { collectionId })
    }

    const handleRename = async (newName: string) => {
        const next = (reqItem.savedResponses ?? []).map((s) => (s.id === saved.id ? { ...s, name: newName } : s))
        await persistWith(next)
    }

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        const next = (reqItem.savedResponses ?? []).filter((s) => s.id !== saved.id)
        await persistWith(next)
    }

    return (
        <div
            className={`group mb-1 mx-1 flex cursor-pointer select-none items-center gap-1.5 rounded-sm py-1 pr-2 text-xs hover:bg-[var(--sidebar-row-hover)] ${isSelected ? 'bg-[var(--sidebar-row-selected)]' : ''}`}
            style={{ paddingLeft: `${18 + indent}px` }}
            onClick={handleLoad}
            title={saved.name}
        >
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span
                className={`shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-semibold ${getStatusColor(saved.response.status)}`}
            >
                {saved.response.status}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {saved.name ?? new Date(saved.savedAt).toLocaleString()}
            </span>
            <div
                className={`flex shrink-0 items-center opacity-0 group-hover:opacity-100 ${moreMenuOpen ? 'opacity-100' : ''}`}
            >
                <div className="relative" ref={moreMenuRef}>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            setMoreMenuOpen((v) => !v)
                        }}
                        className="cursor-pointer rounded p-0.5 hover:bg-[var(--sidebar-row-hover)]"
                        title={t('collection.moreActions')}
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {moreMenuOpen && (
                        <InlineMenu>
                            <MenuButton
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setMoreMenuOpen(false)
                                    setRenameOpen(true)
                                }}
                            >
                                {t('common.rename')}
                            </MenuButton>
                            <MenuButton
                                destructive
                                onClick={(e) => {
                                    setMoreMenuOpen(false)
                                    void handleDelete(e)
                                }}
                            >
                                {t('response.deleteSavedResponse')}
                            </MenuButton>
                        </InlineMenu>
                    )}
                </div>
            </div>
            <RenameDialog
                open={renameOpen}
                onClose={() => setRenameOpen(false)}
                onRename={(name) => void handleRename(name)}
                initialName={saved.name ?? ''}
                title={t('common.rename')}
            />
        </div>
    )
}

function RequestTreeNode({
    item: reqItem,
    collectionId,
    parentFolderId,
    depth = 0,
    ancestorNames = [],
}: Omit<TreeNodeProps, 'item' | 'onAddRequest'> & { item: RequestItem }) {
    const { t } = useTranslation()
    const [renameOpen, setRenameOpen] = useState(false)
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const moreMenuRef = useRef<HTMLDivElement>(null)
    const { deleteItem, renameItem, duplicateItem } = useCollection()
    const { loadRequestItem, activeRequest } = useAppStore()
    const {
        isMultiSelected,
        selectionActive,
        multiDragCount,
        handleSelectionPointer,
        toggleCheckbox,
        notePrimaryClick,
    } = useTreeRowSelection(collectionId, reqItem.id)

    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: reqItem.id })

    const [savedExpanded, setSavedExpanded] = useState(false)
    const savedResponses = reqItem.savedResponses ?? []
    const hasSaved = savedResponses.length > 0

    const indent = depth * 12
    const isSelected = activeRequest.itemId === reqItem.id && !activeRequest.savedResponseId
    const isWs = inferProtocolFromUrl(reqItem.url ?? '', reqItem.protocol) === 'ws'
    const badge = requestBadgeLabel(reqItem)
    const methodColor = METHOD_TEXT_CLASS[badge] ?? 'text-foreground'
    const methodBg = METHOD_BG_CLASS[badge] ?? 'bg-[var(--sidebar-row-hover)]'
    const rowStyle: CSSProperties = {
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: isDragging ? 0.4 : undefined,
        paddingLeft: `${8 + indent}px`,
    }

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

    const handleRename = async (newName: string) => {
        await renameItem(collectionId, reqItem.id, newName)
    }

    const handleDelete = async () => {
        await deleteItem(collectionId, reqItem.id)
    }

    const handleRowClick = (e: React.MouseEvent) => {
        if (handleSelectionPointer(e)) return
        notePrimaryClick()
        const fullPath = [...ancestorNames, reqItem.name]
        loadRequestItem(reqItem, fullPath, { collectionId, folderId: parentFolderId })
        useAppStore.getState().setBreadcrumb(fullPath)
    }

    return (
        <div className="flex min-w-0 flex-col">
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        ref={setNodeRef}
                        {...attributes}
                        onClick={handleRowClick}
                        className={`group relative mb-1 mx-1 flex select-none items-center gap-1.5 rounded-sm px-2 py-1 text-sm cursor-pointer hover:bg-[var(--sidebar-row-hover)] ${moreMenuOpen ? 'z-100 isolate' : isDragging ? 'z-10' : 'z-0'
                            } ${(isSelected || isMultiSelected) && !isOver ? 'bg-[var(--sidebar-row-selected)]' : ''} ${isMultiSelected && !isOver ? 'ring-1 ring-primary/25' : ''} ${isOver ? SIDEBAR_DROP_ACTIVE_ROW : ''}`}
                        style={rowStyle}
                    >
                        <TreeRowCheckbox
                            checked={isMultiSelected}
                            visible={selectionActive}
                            onToggle={toggleCheckbox}
                        />
                        <button
                            type="button"
                            onClick={(e) => {
                                if (!hasSaved) return
                                e.stopPropagation()
                                setSavedExpanded((v) => !v)
                            }}
                            className={`shrink-0 rounded p-0.5 text-muted-foreground ${hasSaved ? 'cursor-pointer hover:bg-[var(--sidebar-row-hover)]' : 'invisible pointer-events-none'}`}
                            title={hasSaved ? t('response.savedResponses') : undefined}
                        >
                            {savedExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronRight className="h-3 w-3" />
                            )}
                        </button>
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 pointer-events-none">
                            {isWs ? (
                                <Radio className="h-3.5 w-3.5 shrink-0 text-[var(--dracula-cyan)]" />
                            ) : (
                                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span
                                className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${methodColor} ${methodBg}`}
                            >
                                {badge}
                            </span>
                            <span className="flex-1 truncate">{reqItem.name}</span>
                        </div>

                        <div
                            className={`flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 ${moreMenuOpen || isDragging ? 'opacity-100' : ''}`}
                        >
                            <div className="relative" ref={moreMenuRef}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setMoreMenuOpen((v) => !v)
                                    }}
                                    className="cursor-pointer rounded p-0.5 hover:bg-[var(--sidebar-row-hover)]"
                                    title={t('collection.moreActions')}
                                >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                                {moreMenuOpen && (
                                    <InlineMenu>
                                        <MenuButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                setRenameOpen(true)
                                            }}
                                        >
                                            {t('common.rename')}
                                        </MenuButton>
                                        <MenuButton
                                            onClick={async (e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                await duplicateItem(collectionId, reqItem.id)
                                            }}
                                        >
                                            {t('collection.duplicate')}
                                        </MenuButton>
                                        <MenuButton
                                            destructive
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setMoreMenuOpen(false)
                                                setDeleteConfirmOpen(true)
                                            }}
                                        >
                                            {t('common.delete')}
                                        </MenuButton>
                                    </InlineMenu>
                                )}
                            </div>
                            <button
                                type="button"
                                ref={setActivatorNodeRef}
                                {...listeners}
                                className="relative shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-[var(--sidebar-row-hover)] active:cursor-grabbing"
                                title={
                                    multiDragCount > 1
                                        ? t('collection.dragToMoveMultiple', { count: multiDragCount })
                                        : t('collection.dragToMove')
                                }
                                onClick={(e) => e.stopPropagation()}
                            >
                                <GripVertical className="h-3.5 w-3.5" />
                                {multiDragCount > 1 && isDragging ? (
                                    <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground">
                                        {multiDragCount}
                                    </span>
                                ) : null}
                            </button>
                        </div>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => setRenameOpen(true)}>{t('common.rename')}</ContextMenuItem>
                    <ContextMenuItem onClick={() => duplicateItem(collectionId, reqItem.id)}>{t('collection.duplicate')}</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                        {t('common.delete')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {savedExpanded && hasSaved && (
                <div className="flex flex-col space-y-1">
                    {[...savedResponses].reverse().map((sr) => (
                        <SavedResponseRow
                            key={sr.id}
                            collectionId={collectionId}
                            reqItem={reqItem}
                            saved={sr}
                            depth={depth + 1}
                            ancestorNames={ancestorNames}
                        />
                    ))}
                </div>
            )}

            <RenameDialog
                open={renameOpen}
                onClose={() => setRenameOpen(false)}
                onRename={handleRename}
                initialName={reqItem.name}
                title={t('collection.renameRequest')}
            />
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>{t('common.delete')}</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Delete this request?
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                await handleDelete()
                                setDeleteConfirmOpen(false)
                            }}
                        >
                            {t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default function TreeNode(props: TreeNodeProps) {
    if (props.item.type === 'folder') {
        return <FolderTreeNode {...props} item={props.item} />
    }
    return <RequestTreeNode {...props} item={props.item} />
}
