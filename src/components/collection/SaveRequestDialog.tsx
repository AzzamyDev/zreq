import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Folder as FolderIcon, Library } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../store'
import { useCollection } from '../../hooks/useCollection'
import i18n from '@/i18n/config'
import type { Collection, Folder, RequestItem } from '../../types'

interface SaveRequestDialogProps {
    open: boolean
    onClose: () => void
    defaultFolderId?: string
    /** Called after a successful save (new or existing item). Runs before onClose. */
    onAfterSave?: () => void
}

function hasChildFolders(items: (Folder | RequestItem)[] | undefined): boolean {
    return (items ?? []).some((c) => c.type === 'folder')
}

/** Folder IDs from root down to parent of `targetFolderId` (so those nodes must be expanded). */
function collectAncestorFolderIds(
    items: (Folder | RequestItem)[],
    targetFolderId: string
): string[] | null {
    for (const it of items) {
        if (it.type !== 'folder') continue
        if (it.id === targetFolderId) return []
        const inner = collectAncestorFolderIds(it.items ?? [], targetFolderId)
        if (inner !== null) return [it.id, ...inner]
    }
    return null
}

function FolderBranch({
    collectionId,
    items,
    depth,
    expanded,
    toggle,
    selectedCollectionId,
    selectedFolderId,
    onSelectFolder,
}: {
    collectionId: number
    items: (Folder | RequestItem)[]
    depth: number
    expanded: Set<string>
    toggle: (key: string) => void
    selectedCollectionId: string
    selectedFolderId: string
    onSelectFolder: (folderId: string) => void
}) {
    const pad = 8 + depth * 14
    return (
        <>
            {items.map((it) => {
                if (it.type !== 'folder') return null
                const rowKey = `fld:${collectionId}:${it.id}`
                const isOpen = expanded.has(rowKey)
                const nested = hasChildFolders(it.items)
                const isSel =
                    selectedCollectionId === String(collectionId) && selectedFolderId === it.id
                return (
                    <div key={rowKey}>
                        <div
                            className="flex min-w-0 items-center rounded-md"
                            style={{ paddingLeft: pad }}
                        >
                            {nested ? (
                                <button
                                    type="button"
                                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80"
                                    aria-expanded={isOpen}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        toggle(rowKey)
                                    }}
                                >
                                    <ChevronRight
                                        className={cn('size-4 transition-transform', isOpen && 'rotate-90')}
                                    />
                                </button>
                            ) : (
                                <span className="inline-flex size-7 shrink-0" aria-hidden />
                            )}
                            <button
                                type="button"
                                className={cn(
                                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                                    isSel && 'bg-primary/15 ring-1 ring-primary/40'
                                )}
                                onClick={() => onSelectFolder(it.id)}
                            >
                                <FolderIcon className="size-4 shrink-0 text-amber-600/90 dark:text-amber-400/90" />
                                <span className="truncate">{it.name}</span>
                            </button>
                        </div>
                        {nested && isOpen && (
                            <FolderBranch
                                collectionId={collectionId}
                                items={it.items ?? []}
                                depth={depth + 1}
                                expanded={expanded}
                                toggle={toggle}
                                selectedCollectionId={selectedCollectionId}
                                selectedFolderId={selectedFolderId}
                                onSelectFolder={onSelectFolder}
                            />
                        )}
                    </div>
                )
            })}
        </>
    )
}

export default function SaveRequestDialog({ open, onClose, defaultFolderId, onAfterSave }: SaveRequestDialogProps) {
    const { t } = useTranslation()
    const collections = useAppStore((s) => s.collections)
    const setActiveRequest = useAppStore((s) => s.setActiveRequest)
    const markActiveTabClean = useAppStore((s) => s.markActiveTabClean)
    const { saveRequestItem } = useCollection()

    const [requestName, setRequestName] = useState('')
    const [selectedCollectionId, setSelectedCollectionId] = useState('')
    const [selectedFolderId, setSelectedFolderId] = useState('')
    const [saving, setSaving] = useState(false)
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

    const toggle = useCallback((key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }, [])

    // Hanya saat dialog dibuka (bukan setiap perubahan store) — dependensi lebar memicu reset
    // selection/expanded dan layar kosong / maximum update depth.
    useEffect(() => {
        if (!open) return
        const { activeRequest, collections: cols } = useAppStore.getState()
        const untitled = i18n.t('saveRequest.untitled')
        setRequestName(activeRequest.name || activeRequest.url || untitled)
        const scid = activeRequest.collectionId != null ? String(activeRequest.collectionId) : ''
        setSelectedCollectionId(scid)
        setSelectedFolderId(defaultFolderId ?? '')

        const next = new Set<string>()
        if (activeRequest.collectionId != null) {
            next.add(`col:${activeRequest.collectionId}`)
            const col = cols.find((c) => c.id === activeRequest.collectionId)
            const fid = defaultFolderId ?? ''
            if (col && fid) {
                const chain = collectAncestorFolderIds(col.items ?? [], fid)
                if (chain) {
                    for (const id of chain) {
                        next.add(`fld:${activeRequest.collectionId}:${id}`)
                    }
                }
            }
        }
        setExpanded(next)
    }, [open, defaultFolderId])

    const handleSave = async () => {
        if (!selectedCollectionId) return
        const { activeRequest: ar } = useAppStore.getState()
        setSaving(true)
        try {
            const item = {
                type: 'request' as const,
                name: requestName.trim() || t('saveRequest.untitled'),
                method: ar.method,
                url: ar.url,
                headers: ar.headers,
                params: ar.params,
                body: ar.body,
                auth: ar.auth,
            }
            const saved = await saveRequestItem(
                Number(selectedCollectionId),
                item,
                selectedFolderId || undefined
            )
            if (saved?.id) {
                setActiveRequest({
                    collectionId: Number(selectedCollectionId),
                    folderId: selectedFolderId || undefined,
                    itemId: saved.id,
                })
                markActiveTabClean()
                onAfterSave?.()
            }
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <DialogContent showCloseButton={false} className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('saveRequest.title')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3 py-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="req-name">{t('saveRequest.requestName')}</Label>
                        <Input
                            id="req-name"
                            value={requestName}
                            onChange={(e) => setRequestName(e.target.value)}
                            placeholder={t('saveRequest.untitled')}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label id="save-location-label">{t('saveRequest.saveLocation')}</Label>
                        <ScrollArea className="h-64 min-h-[200px] rounded-lg border border-border bg-muted/20">
                            <div
                                className="block p-1 pr-3"
                                role="tree"
                                aria-labelledby="save-location-label"
                            >
                                {collections.length === 0 ? (
                                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                        {t('saveRequest.noCollectionFound')}
                                    </p>
                                ) : (
                                    collections.map((col: Collection) => {
                                        const colKey = `col:${col.id}`
                                        const colOpen = expanded.has(colKey)
                                        const nested = hasChildFolders(col.items)
                                        const rootSel =
                                            selectedCollectionId === String(col.id) && selectedFolderId === ''
                                        return (
                                            <div key={col.id} className="min-w-0">
                                                <div className="flex min-w-0 items-center rounded-md pl-1">
                                                    {nested ? (
                                                        <button
                                                            type="button"
                                                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80"
                                                            aria-expanded={colOpen}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                toggle(colKey)
                                                            }}
                                                        >
                                                            <ChevronRight
                                                                className={cn(
                                                                    'size-4 transition-transform',
                                                                    colOpen && 'rotate-90'
                                                                )}
                                                            />
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex size-7 shrink-0" aria-hidden />
                                                    )}
                                                    <button
                                                        type="button"
                                                        className={cn(
                                                            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium',
                                                            rootSel && 'bg-primary/15 ring-1 ring-primary/40'
                                                        )}
                                                        onClick={() => {
                                                            setSelectedCollectionId(String(col.id))
                                                            setSelectedFolderId('')
                                                        }}
                                                    >
                                                        <Library className="size-4 shrink-0 text-muted-foreground" />
                                                        <span className="truncate">{col.name}</span>
                                                        {!nested && (
                                                            <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                                                                {t('saveRequest.collectionRootHint')}
                                                            </span>
                                                        )}
                                                    </button>
                                                </div>
                                                {nested && colOpen && (
                                                    <FolderBranch
                                                        collectionId={col.id}
                                                        items={col.items ?? []}
                                                        depth={0}
                                                        expanded={expanded}
                                                        toggle={toggle}
                                                        selectedCollectionId={selectedCollectionId}
                                                        selectedFolderId={selectedFolderId}
                                                        onSelectFolder={(folderId) => {
                                                            setSelectedCollectionId(String(col.id))
                                                            setSelectedFolderId(folderId)
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!selectedCollectionId || saving}
                    >
                        {saving ? t('common.saving') : t('common.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
