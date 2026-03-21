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
import type { VariableSuggestionScope } from '../../lib/env-resolver'
import { GripVertical, Trash2 } from 'lucide-react'
import VarTemplateField from './VarTemplateField'

/** Kolom terakhir lebar tetap agar pembagian `1fr` key/value sama di semua baris (grid terpisah per baris). */
const ROW_GRID =
    'grid grid-cols-[1.5rem_1.25rem_minmax(0,1fr)_minmax(0,1fr)_9rem] items-center'

interface KVEditorProps {
    pairs: KV[]
    onChange: (pairs: KV[]) => void
    keyPlaceholder?: string
    valuePlaceholder?: string
    variableSuggestionScope?: VariableSuggestionScope
}

interface SortableKVRowProps {
    pair: KV
    keyPlaceholder: string
    onUpdate: (id: string, field: keyof KV, value: string | boolean) => void
    onDelete: (id: string) => void
    variableSuggestionScope?: VariableSuggestionScope
}

const SortableKVRow = memo(function SortableKVRow({
    pair,
    keyPlaceholder,
    onUpdate,
    onDelete,
    variableSuggestionScope,
}: SortableKVRowProps) {
    const { t } = useTranslation()
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

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={`group border-b border-border/40 [contain:layout_style] hover:bg-muted/20 ${ROW_GRID}`}
        >
            <div
                ref={setActivatorNodeRef}
                className="flex touch-none cursor-grab items-center py-1 pl-1 active:cursor-grabbing"
                {...listeners}
            >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
            </div>
            <div className="py-1">
                <input
                    type="checkbox"
                    checked={pair.enabled}
                    onChange={e => onUpdate(pair.id, 'enabled', e.target.checked)}
                    className="cursor-pointer accent-primary"
                />
            </div>
            <div className="border-l border-border/40 py-1 pr-1">
                <input
                    type="text"
                    value={pair.key}
                    onChange={e => onUpdate(pair.id, 'key', e.target.value)}
                    placeholder={keyPlaceholder}
                    className="w-full bg-transparent px-2 py-0.5 font-mono text-xs focus:outline-none"
                />
            </div>
            <div className="min-w-0 border-l border-border/40 py-1 pr-1">
                <VarTemplateField
                    wrap
                    value={pair.value}
                    onChange={(v) => onUpdate(pair.id, 'value', v)}
                    className="min-h-7 w-full px-1"
                    inputClassName="text-xs"
                    variableSuggestionScope={variableSuggestionScope}
                />
            </div>
            <div className="flex items-center justify-center border-l border-border/40 py-1 pl-2 pr-2">
                <button
                    type="button"
                    onClick={() => onDelete(pair.id)}
                    className="flex cursor-pointer items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title={t('common.remove')}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    )
})

export default function KVEditor({
    pairs,
    onChange,
    keyPlaceholder,
    valuePlaceholder,
    variableSuggestionScope,
}: KVEditorProps) {
    const { t } = useTranslation()
    const kp = keyPlaceholder ?? t('common.key')
    const vp = valuePlaceholder ?? t('common.value')
    const [draftKey, setDraftKey] = useState('')
    const [draftValue, setDraftValue] = useState('')
    const [bulkMode, setBulkMode] = useState(false)
    const [bulkText, setBulkText] = useState('')
    const selectAllRef = useRef<HTMLInputElement>(null)

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

    const pairsRef = useRef(pairs)
    pairsRef.current = pairs
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    const updatePair = useCallback((id: string, field: keyof KV, value: string | boolean) => {
        onChangeRef.current(pairsRef.current.map(p => (p.id === id ? { ...p, [field]: value } : p)))
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
            { id: nanoid(), key: draftKey, value: draftValue, enabled: true },
        ])
        setDraftKey('')
        setDraftValue('')
    }, [draftKey, draftValue])

    const handleDraftKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            commitDraft()
        }
    }

    const openBulk = () => {
        setBulkText(pairs.map(p => `${p.key}: ${p.value}`).join('\n'))
        setBulkMode(true)
    }
    const applyBulk = () => {
        const newPairs = bulkText
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const colon = line.indexOf(':')
                if (colon === -1) return { id: nanoid(), key: line, value: '', enabled: true }
                return { id: nanoid(), key: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim(), enabled: true }
            })
        onChange(newPairs)
        setBulkMode(false)
    }

    if (bulkMode) {
        return (
            <div className="flex flex-col gap-2 p-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('common.bulkEditHint')}</span>
                    <div className="flex gap-2">
                        <button onClick={() => setBulkMode(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border">{t('common.cancel')}</button>
                        <button onClick={applyBulk} className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">{t('common.apply')}</button>
                    </div>
                </div>
                <textarea
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    className="w-full min-h-[120px] rounded border border-border bg-muted/30 p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                />
            </div>
        )
    }

    return (
        <div className="w-full">
            <div className={`border-b border-border ${ROW_GRID}`}>
                <div className="py-1 pl-1" aria-hidden />
                <div className="py-1">
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
                <div className="border-l border-border/40 py-1 pr-1 text-left align-middle">
                    <span className="block px-2 text-xs font-medium text-muted-foreground">
                                {kp}
                    </span>
                </div>
                <div className="min-w-0 border-l border-border/40 py-1 pr-1 text-left align-middle">
                    <span className="block px-2 text-xs font-medium text-muted-foreground">
                                {vp}
                    </span>
                </div>
                <div className="flex items-center justify-end border-l border-border/40 py-1 pl-2 pr-2">
                    <button
                        type="button"
                        onClick={openBulk}
                        className="max-w-full truncate text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border/50 hover:border-border"
                    >
                        {t('common.bulkEdit')}
                    </button>
                </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {pairs.map(pair => (
                        <SortableKVRow
                            key={pair.id}
                            pair={pair}
                            keyPlaceholder={kp}
                            onUpdate={updatePair}
                            onDelete={deletePair}
                            variableSuggestionScope={variableSuggestionScope}
                        />
                    ))}
                </SortableContext>
            </DndContext>

            <div className={`border-b border-border/40 opacity-60 focus-within:opacity-100 ${ROW_GRID}`}>
                <div className="py-1 pl-1" />
                <div className="py-1">
                    <input type="checkbox" disabled className="cursor-not-allowed opacity-40 accent-primary" />
                </div>
                <div className="border-l border-border/40 py-1 pr-1">
                    <input
                        type="text"
                        value={draftKey}
                        onChange={e => setDraftKey(e.target.value)}
                        onBlur={commitDraft}
                        onKeyDown={handleDraftKeyDown}
                        placeholder={kp}
                        className="w-full bg-transparent px-2 py-0.5 font-mono text-xs focus:outline-none"
                    />
                </div>
                <div className="min-w-0 border-l border-border/40 py-1 pr-1">
                    <VarTemplateField
                        wrap
                        value={draftValue}
                        onChange={setDraftValue}
                        onBlur={commitDraft}
                        inputOnKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault()
                                commitDraft()
                            }
                        }}
                        className="min-h-7 w-full px-1"
                        inputClassName="text-xs"
                        variableSuggestionScope={variableSuggestionScope}
                    />
                </div>
                <div className="border-l border-border/40 py-1 pl-2 pr-2" aria-hidden />
            </div>
        </div>
    )
}
