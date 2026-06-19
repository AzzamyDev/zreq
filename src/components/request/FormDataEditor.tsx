import { useState, useCallback, useRef, useEffect, useMemo, memo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import {
    DndContext,
    type DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { KV } from '../../types'
import { GripVertical, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export type FormDataValueType = 'text' | 'file'

export type FormDataPair = KV & {
    valueType?: FormDataValueType
    fileName?: string
    fileMimeType?: string
    fileBase64?: string
    fileParts?: {
        name: string
        mimeType: string
        base64: string
    }[]
}

export function parseFormDataPairs(content: string): FormDataPair[] {
    try {
        const parsed = JSON.parse(content)
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
            .map((row) => {
                const valueType = row.valueType === 'file' ? 'file' : 'text'
                return {
                    id: typeof row.id === 'string' ? row.id : nanoid(),
                    key: typeof row.key === 'string' ? row.key : '',
                    value: typeof row.value === 'string' ? row.value : '',
                    enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
                    valueType,
                    fileName: typeof row.fileName === 'string' ? row.fileName : undefined,
                    fileMimeType: typeof row.fileMimeType === 'string' ? row.fileMimeType : undefined,
                    fileBase64: typeof row.fileBase64 === 'string' ? row.fileBase64 : undefined,
                    fileParts: Array.isArray(row.fileParts)
                        ? row.fileParts
                            .filter((part): part is Record<string, unknown> => typeof part === 'object' && part !== null)
                            .map((part) => ({
                                name: typeof part.name === 'string' ? part.name : 'upload.bin',
                                mimeType:
                                    typeof part.mimeType === 'string' && part.mimeType.trim()
                                        ? part.mimeType
                                        : 'application/octet-stream',
                                base64: typeof part.base64 === 'string' ? part.base64 : '',
                            }))
                            .filter((part) => part.base64.length > 0)
                        : undefined,
                } satisfies FormDataPair
            })
    } catch {
        return []
    }
}

const TABLE_GRID = 'grid-cols-[1.75rem_2rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)_2.5rem]'

interface FormDataEditorProps {
    pairs: FormDataPair[]
    onChange: (pairs: FormDataPair[]) => void
    sectionTitle?: string
}

interface SortableFormRowProps {
    pair: FormDataPair
    keyPlaceholder: string
    valuePlaceholder: string
    uploading: boolean
    onUpdate: (id: string, patch: Partial<FormDataPair>) => void
    onDelete: (id: string) => void
    onPickFiles: (files: FileList | null) => void
}

async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

const SortableFormRow = memo(function SortableFormRow({
    pair,
    keyPlaceholder,
    valuePlaceholder,
    uploading,
    onUpdate,
    onDelete,
    onPickFiles,
}: SortableFormRowProps) {
    const { t } = useTranslation()
    const valueType = pair.valueType ?? 'text'
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: pair.id })

    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 2 : undefined,
        opacity: isDragging ? 0.45 : undefined,
    }

    const fileLabel =
        uploading
            ? t('request.formDataUploading')
            : pair.fileParts && pair.fileParts.length > 1
                ? t('request.formDataFilesSelected', { count: pair.fileParts.length })
                : pair.fileParts?.[0]?.name || pair.fileName || t('request.formDataNoFile')

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'group col-span-6 grid grid-cols-subgrid border-b border-border/50 transition-colors hover:bg-muted/15',
                TABLE_GRID,
                !pair.enabled && 'opacity-50'
            )}
        >
            <div
                ref={setActivatorNodeRef}
                className="flex touch-none cursor-grab items-center justify-center border-r border-border/40 active:cursor-grabbing"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/55 group-hover:text-muted-foreground" />
            </div>
            <div className="flex items-center justify-center border-r border-border/40">
                <input
                    type="checkbox"
                    checked={pair.enabled}
                    onChange={e => onUpdate(pair.id, { enabled: e.target.checked })}
                    className="cursor-pointer accent-primary"
                />
            </div>
            <div className="flex min-w-0 items-center border-r border-border/40 px-2.5 py-1.5">
                <input
                    type="text"
                    value={pair.key}
                    onChange={e => onUpdate(pair.id, { key: e.target.value })}
                    placeholder={keyPlaceholder}
                    className="w-full bg-transparent px-0 py-0 font-mono text-xs leading-normal focus:outline-none"
                />
            </div>
            <div className="flex items-center border-r border-border/40 px-1.5 py-1">
                <select
                    value={valueType}
                    onChange={e => {
                        const next = e.target.value === 'file' ? 'file' : 'text'
                        if (next === 'file') {
                            onUpdate(pair.id, { valueType: 'file', value: '' })
                            return
                        }
                        onUpdate(pair.id, {
                            valueType: 'text',
                            fileName: undefined,
                            fileMimeType: undefined,
                            fileBase64: undefined,
                            fileParts: undefined,
                        })
                    }}
                    className="h-7 w-full rounded-sm border-0 bg-muted/30 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                    <option value="text">{t('request.formDataTypeText')}</option>
                    <option value="file">{t('request.formDataTypeFile')}</option>
                </select>
            </div>
            <div className="flex min-w-0 items-center border-r border-border/40 px-2.5 py-1.5">
                {valueType === 'file' ? (
                    <div className="flex min-w-0 items-center gap-2">
                        <label className="inline-flex shrink-0 cursor-pointer items-center rounded-sm border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
                            {t('request.formDataChooseFiles')}
                            <input
                                type="file"
                                multiple
                                className="hidden"
                                onChange={e => {
                                    onPickFiles(e.target.files)
                                    e.currentTarget.value = ''
                                }}
                            />
                        </label>
                        <span className="truncate text-xs text-muted-foreground">{fileLabel}</span>
                    </div>
                ) : (
                    <input
                        type="text"
                        value={pair.value}
                        onChange={e => onUpdate(pair.id, { value: e.target.value })}
                        placeholder={valuePlaceholder}
                        className="w-full bg-transparent px-0 py-0 text-xs leading-normal focus:outline-none"
                    />
                )}
            </div>
            <div className="flex items-center justify-center px-1">
                <button
                    type="button"
                    onClick={() => onDelete(pair.id)}
                    className="flex cursor-pointer items-center justify-center rounded p-1 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title={t('common.remove')}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    )
})

export default function FormDataEditor({ pairs, onChange, sectionTitle }: FormDataEditorProps) {
    const { t } = useTranslation()
    const kp = t('common.key')
    const vp = t('common.value')
    const [draftKey, setDraftKey] = useState('')
    const [draftValue, setDraftValue] = useState('')
    const [draftType, setDraftType] = useState<FormDataValueType>('text')
    const [uploadingRowId, setUploadingRowId] = useState<string | null>(null)
    const selectAllRef = useRef<HTMLInputElement>(null)

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

    const pairsRef = useRef(pairs)
    pairsRef.current = pairs
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    const updatePair = useCallback((id: string, patch: Partial<FormDataPair>) => {
        onChangeRef.current(pairsRef.current.map(p => (p.id === id ? { ...p, ...patch } : p)))
    }, [])

    const deletePair = useCallback((id: string) => {
        onChangeRef.current(pairsRef.current.filter(p => p.id !== id))
    }, [])

    const handleDragEnd = useCallback((e: DragEndEvent) => {
        const { active, over } = e
        if (!over || active.id === over.id) return
        const list = pairsRef.current
        const oldIndex = list.findIndex(p => p.id === active.id)
        const newIndex = list.findIndex(p => p.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        onChangeRef.current(arrayMove(list, oldIndex, newIndex))
    }, [])

    const pickFilesForPair = useCallback(async (pairId: string, files: FileList | null) => {
        if (!files || files.length === 0) return
        setUploadingRowId(pairId)
        try {
            const fileParts = await Promise.all(
                [...files].map(async (file) => ({
                    name: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    base64: await fileToBase64(file),
                })),
            )
            const first = fileParts[0]
            updatePair(pairId, {
                valueType: 'file',
                value: '',
                fileName: first?.name,
                fileMimeType: first?.mimeType,
                fileBase64: first?.base64,
                fileParts,
            })
        } finally {
            setUploadingRowId(null)
        }
    }, [updatePair])

    const { allEnabled, someEnabled } = useMemo(() => {
        const n = pairs.length
        if (n === 0) return { allEnabled: false, someEnabled: false }
        const on = pairs.filter(p => p.enabled).length
        return { allEnabled: on === n, someEnabled: on > 0 && on < n }
    }, [pairs])

    const sortableIds = useMemo(() => pairs.map(p => p.id), [pairs])

    useEffect(() => {
        const el = selectAllRef.current
        if (!el) return
        el.indeterminate = someEnabled
    }, [someEnabled, allEnabled, pairs.length])

    const toggleSelectAll = () => {
        if (pairs.length === 0) return
        const enable = !allEnabled
        onChange(pairs.map(p => ({ ...p, enabled: enable })))
    }

    const commitDraft = useCallback(() => {
        if (!draftKey.trim()) return
        onChangeRef.current([
            ...pairsRef.current,
            {
                id: nanoid(),
                key: draftKey,
                value: draftValue,
                enabled: true,
                valueType: draftType,
            },
        ])
        setDraftKey('')
        setDraftValue('')
        setDraftType('text')
    }, [draftKey, draftValue, draftType])

    const handleDraftKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            commitDraft()
        }
    }

    return (
        <div className="w-full">
            {sectionTitle ? (
                <p className="mb-2 text-xs font-medium text-foreground">{sectionTitle}</p>
            ) : null}

            <div className="overflow-hidden rounded-sm border border-border">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className={cn('grid', TABLE_GRID)}>
                        <div
                            className={cn(
                                'col-span-6 grid grid-cols-subgrid border-b border-border bg-muted/20',
                                TABLE_GRID
                            )}
                        >
                            <div className="border-r border-border/40" aria-hidden />
                            <div className="flex items-center justify-center border-r border-border/40">
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={allEnabled}
                                    disabled={pairs.length === 0}
                                    onChange={toggleSelectAll}
                                    className="cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                    title={allEnabled ? t('common.unselectAll') : t('common.selectAll')}
                                    aria-label={allEnabled ? t('common.unselectAllRows') : t('common.selectAllRows')}
                                />
                            </div>
                            <div className="flex items-center border-r border-border/40 px-2.5 py-2">
                                <span className="text-xs font-medium text-muted-foreground">{kp}</span>
                            </div>
                            <div className="flex items-center border-r border-border/40 px-2.5 py-2">
                                <span className="text-xs font-medium text-muted-foreground">{t('request.formDataType')}</span>
                            </div>
                            <div className="flex min-w-0 items-center border-r border-border/40 px-2.5 py-2">
                                <span className="text-xs font-medium text-muted-foreground">{vp}</span>
                            </div>
                            <div aria-hidden />
                        </div>

                        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                            {pairs.map(pair => (
                                <SortableFormRow
                                    key={pair.id}
                                    pair={pair}
                                    keyPlaceholder={kp}
                                    valuePlaceholder={vp}
                                    uploading={uploadingRowId === pair.id}
                                    onUpdate={updatePair}
                                    onDelete={deletePair}
                                    onPickFiles={files => void pickFilesForPair(pair.id, files)}
                                />
                            ))}
                        </SortableContext>

                        <div
                            className={cn(
                                'col-span-6 grid grid-cols-subgrid opacity-60 focus-within:opacity-100',
                                TABLE_GRID
                            )}
                        >
                            <div className="border-r border-border/40" aria-hidden />
                            <div className="flex items-center justify-center border-r border-border/40">
                                <input type="checkbox" disabled className="cursor-not-allowed opacity-40 accent-primary" />
                            </div>
                            <div className="flex items-center border-r border-border/40 px-2.5 py-1.5">
                                <input
                                    type="text"
                                    value={draftKey}
                                    onChange={e => setDraftKey(e.target.value)}
                                    onBlur={commitDraft}
                                    onKeyDown={handleDraftKeyDown}
                                    placeholder={kp}
                                    className="w-full bg-transparent px-0 py-0 font-mono text-xs leading-normal focus:outline-none"
                                />
                            </div>
                            <div className="flex items-center border-r border-border/40 px-1.5 py-1">
                                <select
                                    value={draftType}
                                    onChange={e => setDraftType(e.target.value === 'file' ? 'file' : 'text')}
                                    className="h-7 w-full rounded-sm border-0 bg-muted/30 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                    <option value="text">{t('request.formDataTypeText')}</option>
                                    <option value="file">{t('request.formDataTypeFile')}</option>
                                </select>
                            </div>
                            <div className="flex min-w-0 items-center border-r border-border/40 px-2.5 py-1.5">
                                {draftType === 'file' ? (
                                    <span className="text-xs text-muted-foreground/70">{t('request.formDataAddRowHint')}</span>
                                ) : (
                                    <input
                                        type="text"
                                        value={draftValue}
                                        onChange={e => setDraftValue(e.target.value)}
                                        onBlur={commitDraft}
                                        onKeyDown={handleDraftKeyDown}
                                        placeholder={vp}
                                        className="w-full bg-transparent px-0 py-0 text-xs leading-normal focus:outline-none"
                                    />
                                )}
                            </div>
                            <div aria-hidden />
                        </div>
                    </div>
                </DndContext>
            </div>
        </div>
    )
}
