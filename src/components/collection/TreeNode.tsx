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
import { useCollection, type TreeDropPayload } from '../../hooks/useCollection'
import { useAppStore } from '../../store'
import RenameDialog from './RenameDialog'
import NewFolderDialog from './NewFolderDialog'
import FolderSettingsDialog from './FolderSettingsDialog'
import type { RequestItem, Folder as FolderType } from '../../types'
import { METHOD_BG_CLASS, METHOD_TEXT_CLASS } from '../../lib/httpMethodTheme'
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

function FolderTreeNode({
    item: folder,
    collectionId,
    parentFolderId,
    depth = 0,
    onAddRequest,
    ancestorNames = [],
}: Omit<TreeNodeProps, 'item'> & { item: FolderType }) {
    const { t } = useTranslation()
    const [renameOpen, setRenameOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [moreMenuOpen, setMoreMenuOpen] = useState(false)
    const [folderDialogOpen, setFolderDialogOpen] = useState(false)
    const moreMenuRef = useRef<HTMLDivElement>(null)
    const { deleteItem, renameItem, addFolder, addRequest, updateFolderSettings } = useCollection()

    const fldKey = `fld:${collectionId}:${folder.id}`
    const expanded = useAppStore((s) => s.sidebarExpanded[fldKey] ?? false)

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
        await addRequest(collectionId, t('collection.newRequest'), folder.id)
    }

    const toggleFolder = () => {
        useAppStore.getState().toggleSidebarFolderExpanded(collectionId, folder.id)
    }

    return (
        <div className="flex min-w-0 flex-col">
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        ref={setNodeRef}
                        {...attributes}
                        className={`group relative mx-1 flex select-none items-center gap-1 rounded-sm px-2 py-1 text-sm hover:bg-[var(--sidebar-row-hover)] ${moreMenuOpen ? 'z-100 isolate' : isDragging ? 'z-10' : 'z-0'
                            } ${isOver && !isIntoOver ? 'bg-primary/10' : ''}`}
                        style={rowStyle}
                    >
                        <div
                            ref={setIntoRef}
                            className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-sm py-0.5 ${isIntoOver ? 'bg-primary/20' : ''
                                }`}
                            onClick={toggleFolder}
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
                            className={`flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 ${moreMenuOpen || isDragging ? 'opacity-100' : ''}`}
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleAddRequestToFolder()
                                }}
                                className="cursor-pointer rounded p-0.5 hover:bg-[var(--sidebar-row-hover)]"
                                title={t('collection.addRequest')}
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
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
                                                handleAddRequestToFolder()
                                            }}
                                        >
                                            {t('collection.addRequest')}
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
                                                handleDelete()
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
                                className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-[var(--sidebar-row-hover)] active:cursor-grabbing"
                                title={t('collection.dragToMove')}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <GripVertical className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => onAddRequest?.(folder.id)}>{t('collection.addRequest')}</ContextMenuItem>
                    <ContextMenuItem onClick={handleAddSubFolder}>{t('collection.addFolder')}</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => setRenameOpen(true)}>{t('common.rename')}</ContextMenuItem>
                    <ContextMenuItem onClick={() => setSettingsOpen(true)}>{t('common.settings')}</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={handleDelete}>
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
    const moreMenuRef = useRef<HTMLDivElement>(null)
    const { deleteItem, renameItem, duplicateItem } = useCollection()
    const { loadRequestItem, selectedItemId } = useAppStore()

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

    const indent = depth * 12
    const isSelected = selectedItemId === reqItem.id
    const methodColor = METHOD_TEXT_CLASS[reqItem.method] ?? 'text-foreground'
    const methodBg = METHOD_BG_CLASS[reqItem.method] ?? 'bg-[var(--sidebar-row-hover)]'
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

    const handleLoadRequest = () => {
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
                        className={`group relative mx-1 flex select-none items-center gap-1.5 rounded-sm px-2 py-1 text-sm hover:bg-[var(--sidebar-row-hover)] ${isSelected ? 'bg-[var(--sidebar-row-selected)]' : ''
                            } ${moreMenuOpen ? 'z-100 isolate' : isDragging ? 'z-10' : 'z-0'} ${isOver ? 'bg-primary/10' : ''}`}
                        style={rowStyle}
                    >
                        <div
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
                            onClick={handleLoadRequest}
                        >
                            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span
                                className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${methodColor} ${methodBg}`}
                            >
                                {reqItem.method}
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
                                                handleDelete()
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
                                className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-[var(--sidebar-row-hover)] active:cursor-grabbing"
                                title={t('collection.dragToMove')}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <GripVertical className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => setRenameOpen(true)}>{t('common.rename')}</ContextMenuItem>
                    <ContextMenuItem onClick={() => duplicateItem(collectionId, reqItem.id)}>{t('collection.duplicate')}</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={handleDelete}>
                        {t('common.delete')}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <RenameDialog
                open={renameOpen}
                onClose={() => setRenameOpen(false)}
                onRename={handleRename}
                initialName={reqItem.name}
                title={t('collection.renameRequest')}
            />
        </div>
    )
}

export default function TreeNode(props: TreeNodeProps) {
    if (props.item.type === 'folder') {
        return <FolderTreeNode {...props} item={props.item} />
    }
    return <RequestTreeNode {...props} item={props.item} />
}
