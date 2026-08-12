import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import {
    Upload,
    Download,
    Search,
    Plus,
    Trash2,
    Pencil,
    Layers,
    Loader2,
    Check,
    X,
    Sparkles,
} from 'lucide-react'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../store'
import { useSyncStore } from '../../store/syncStore'
import { useEnvironment } from '../../hooks/useEnvironment'
import { importEnvironments, exportEnvironment, type ImportFormat } from '../../lib/importExport'
import ImportFormatDialog from '../collection/ImportFormatDialog'
import { saveTextFile } from '../../lib/utils'
import type { KV } from '../../types'
import { toast } from 'sonner'

const AUTOSAVE_DEBOUNCE_MS = 700

const VAR_ROW_GRID =
    'grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center'

function buildVarsPayload(localVars: KV[], draftKey: string, draftVal: string) {
    const pending =
        draftKey.trim() || draftVal.trim()
            ? [{ key: draftKey, value: draftVal, enabled: true as const }]
            : []
    const merged = pending.length ? [...localVars, ...pending] : localVars
    return merged
        .filter((v) => v.key.trim())
        .map(({ key, value, enabled }) => ({ key, value, enabled }))
}

function varsSig(vars: ReturnType<typeof buildVarsPayload>) {
    return JSON.stringify(vars)
}

interface EnvironmentManagerDialogProps {
    open: boolean
    onClose: () => void
}

export default function EnvironmentManagerDialog({ open, onClose }: EnvironmentManagerDialogProps) {
    const { t } = useTranslation()
    const { environments, activeWorkspaceId, activeEnvironmentId } = useAppStore()
    const { createEnvironment, updateVariables, renameEnvironment, deleteEnvironment } = useEnvironment()
    const updateVariablesRef = useRef(updateVariables)
    updateVariablesRef.current = updateVariables

    const online = useSyncStore((s) => s.online)
    const reachable = useSyncStore((s) => s.instanceReachable)
    const pending = useSyncStore((s) => s.pendingOutbox)
    const pulling = useSyncStore((s) => s.pulling)
    const pushing = useSyncStore((s) => s.pushing)
    const lastErr = useSyncStore((s) => s.lastError)

    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [localVars, setLocalVars] = useState<KV[]>([])
    const [isCreating, setIsCreating] = useState(false)
    const [newEnvName, setNewEnvName] = useState('')
    const [editingName, setEditingName] = useState(false)
    const [nameValue, setNameValue] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [envListQuery, setEnvListQuery] = useState('')
    const [importError, setImportError] = useState<string | null>(null)
    const [isImporting, setIsImporting] = useState(false)
    const [importFormatDialogOpen, setImportFormatDialogOpen] = useState(false)
    const [saveNotice, setSaveNotice] = useState<'success' | 'error' | null>(null)
    const [persistedVarsSig, setPersistedVarsSig] = useState<string | null>(null)
    const importInputRef = useRef<HTMLInputElement>(null)
    const importFormatRef = useRef<ImportFormat>('postman')
    const saveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const selectAllVarsRef = useRef<HTMLInputElement>(null)
    const draftRowRef = useRef({ key: '', value: '' })
    /** Skip one hydrate after tempId → real id remap so in-progress edits are not wiped. */
    const preserveLocalDraftRef = useRef(false)
    const persistedVarsSigRef = useRef<string | null>(null)
    const isSavingRef = useRef(false)
    const localVarsRef = useRef<KV[]>([])
    const selectedIdRef = useRef<number | null>(null)
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Tracks the name of the selected env so we can recover selection when
    // tempId is replaced by the real server ID after sync.
    const selectedEnvNameRef = useRef<string | null>(null)

    const [draftRow, setDraftRow] = useState({ key: '', value: '' })

    const selectedEnv = environments.find((e) => e.id === selectedId) ?? null

    const commitPersistedVarsSig = useCallback((sig: string | null) => {
        persistedVarsSigRef.current = sig
        setPersistedVarsSig(sig)
    }, [])

    localVarsRef.current = localVars
    selectedIdRef.current = selectedId

    // When selectedId points to a tempId that no longer exists (replaced after sync),
    // recover the selection by finding the env with the same name.
    useEffect(() => {
        if (selectedId === null) return
        const found = environments.find((e) => e.id === selectedId)
        if (!found && selectedEnvNameRef.current) {
            const match = environments.find((e) => e.name === selectedEnvNameRef.current)
            if (match) {
                preserveLocalDraftRef.current = true
                setSelectedId(match.id)
            }
        }
        if (found) selectedEnvNameRef.current = found.name
    }, [environments, selectedId])

    const clearSaveNoticeTimer = () => {
        if (saveNoticeTimerRef.current) {
            clearTimeout(saveNoticeTimerRef.current)
            saveNoticeTimerRef.current = null
        }
    }

    const flashSaveNotice = (kind: 'success' | 'error') => {
        clearSaveNoticeTimer()
        setSaveNotice(kind)
        saveNoticeTimerRef.current = setTimeout(() => {
            setSaveNotice(null)
            saveNoticeTimerRef.current = null
        }, 3200)
    }

    // Load editor from store only when opening or switching selection — not on every remote sync
    // (avoids the “refresh” feeling while typing).
    useEffect(() => {
        if (!open) return
        if (selectedId === null) {
            setLocalVars([])
            setNameValue('')
            setDraftRow({ key: '', value: '' })
            draftRowRef.current = { key: '', value: '' }
            setEditingName(false)
            commitPersistedVarsSig(null)
            return
        }
        const env = useAppStore.getState().environments.find((e) => e.id === selectedId)
        if (!env) return

        if (preserveLocalDraftRef.current) {
            preserveLocalDraftRef.current = false
            return
        }

        const rows = (env.variables ?? []).map((v) => ({
            id: nanoid(),
            key: v.key,
            value: v.value,
            enabled: v.enabled,
        }))
        setLocalVars(rows)
        setNameValue(env.name)
        setDraftRow({ key: '', value: '' })
        draftRowRef.current = { key: '', value: '' }
        setEditingName(false)
        commitPersistedVarsSig(varsSig(buildVarsPayload(rows, '', '')))
    }, [open, selectedId, commitPersistedVarsSig])

    const currentVarsSig = useMemo(
        () => varsSig(buildVarsPayload(localVars, draftRow.key, draftRow.value)),
        [localVars, draftRow.key, draftRow.value]
    )

    const varsDirty = persistedVarsSig != null && currentVarsSig !== persistedVarsSig
    const nameDirty =
        editingName && selectedEnv != null && nameValue.trim() !== selectedEnv.name.trim()
    const showUnsaved = varsDirty || nameDirty

    // Debounced auto-save (variables only)
    useEffect(() => {
        if (!open || selectedId === null || persistedVarsSigRef.current === null) return
        if (currentVarsSig === persistedVarsSigRef.current) return
        if (isSavingRef.current) return

        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = setTimeout(() => {
            autosaveTimerRef.current = null
            if (isSavingRef.current) return
            const id = selectedIdRef.current
            if (id === null) return
            const d = draftRowRef.current
            const payload = buildVarsPayload(localVarsRef.current, d.key, d.value)
            const sig = varsSig(payload)
            if (sig === persistedVarsSigRef.current) return
            void (async () => {
                try {
                    await updateVariablesRef.current(id, payload)
                    if (d.key.trim() || d.value.trim()) {
                        draftRowRef.current = { key: '', value: '' }
                        setDraftRow({ key: '', value: '' })
                    }
                    commitPersistedVarsSig(sig)
                } catch {
                    /* keep dirty; user can use Save or keep editing */
                }
            })()
        }, AUTOSAVE_DEBOUNCE_MS)

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
                autosaveTimerRef.current = null
            }
        }
    }, [open, selectedId, currentVarsSig, commitPersistedVarsSig])

    // Auto-select first env when dialog opens
    useEffect(() => {
        if (open && environments.length > 0 && selectedId === null) {
            setSelectedId(environments[0].id)
        }
        if (!open) {
            setSelectedId(null)
            setIsCreating(false)
            setNewEnvName('')
            setEnvListQuery('')
            setImportError(null)
            setIsImporting(false)
            clearSaveNoticeTimer()
            setSaveNotice(null)
        }
    }, [open, environments])

    useEffect(
        () => () => {
            if (saveNoticeTimerRef.current) {
                clearTimeout(saveNoticeTimerRef.current)
                saveNoticeTimerRef.current = null
            }
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
                autosaveTimerRef.current = null
            }
        },
        []
    )

    const syncBlocked = !online
    const showUnreachable = online && reachable === false
    const showPending = pending > 0 || pulling || pushing
    const showSyncErr = !!lastErr && !syncBlocked

    const q = envListQuery.trim().toLowerCase()
    const filteredEnvs = q
        ? environments.filter((e) => e.name.toLowerCase().includes(q))
        : environments

    const { allVarsEnabled, someVarsEnabled } = useMemo(() => {
        const n = localVars.length
        if (n === 0) return { allVarsEnabled: false, someVarsEnabled: false }
        const on = localVars.filter((p) => p.enabled).length
        return { allVarsEnabled: on === n, someVarsEnabled: on > 0 && on < n }
    }, [localVars])

    useEffect(() => {
        const el = selectAllVarsRef.current
        if (!el) return
        el.indeterminate = someVarsEnabled
    }, [someVarsEnabled, allVarsEnabled, localVars.length])

    const toggleSelectAllVars = () => {
        if (localVars.length === 0) return
        const enable = !allVarsEnabled
        setLocalVars((prev) => prev.map((p) => ({ ...p, enabled: enable })))
    }

    const updatePair = (id: string, field: keyof KV, value: string | boolean) => {
        setLocalVars((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
    }

    const deletePair = (id: string) => {
        setLocalVars((prev) => prev.filter((p) => p.id !== id))
    }

    const commitDraftRowIfNeeded = () => {
        const d = draftRowRef.current
        if (!d.key.trim() && !d.value.trim()) return
        setLocalVars((prev) => [
            ...prev,
            { id: nanoid(), key: d.key, value: d.value, enabled: true },
        ])
        draftRowRef.current = { key: '', value: '' }
        setDraftRow({ key: '', value: '' })
    }

    const handleDraftBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const tr = e.currentTarget.closest('tr')
        const next = e.relatedTarget
        if (tr && next instanceof Node && tr.contains(next)) return
        commitDraftRowIfNeeded()
    }

    const setDraftField = (field: 'key' | 'value', value: string) => {
        setDraftRow((r) => {
            const next = { ...r, [field]: value }
            draftRowRef.current = next
            return next
        })
    }

    const handleSave = async () => {
        if (selectedId === null) return
        const d = draftRowRef.current
        const pendingRow =
            d.key.trim() || d.value.trim()
                ? { id: nanoid(), key: d.key, value: d.value, enabled: true as const }
                : null
        const merged = pendingRow ? [...localVars, pendingRow] : localVars
        const payload = merged
            .filter((v) => v.key.trim())
            .map(({ key, value, enabled }) => ({ key, value, enabled }))

        isSavingRef.current = true
        setIsSaving(true)
        try {
            await updateVariables(selectedId, payload)
            if (pendingRow?.key.trim()) {
                draftRowRef.current = { key: '', value: '' }
                setDraftRow({ key: '', value: '' })
            }
            commitPersistedVarsSig(varsSig(payload))
            flashSaveNotice('success')
        } catch {
            flashSaveNotice('error')
        } finally {
            isSavingRef.current = false
            setIsSaving(false)
        }
    }

    const handleCreateEnv = async () => {
        const trimmed = newEnvName.trim()
        if (!trimmed) return
        const created = await createEnvironment(trimmed)
        setNewEnvName('')
        setIsCreating(false)
        if (!created) return
        setSelectedId(created.id)
    }

    const handleDeleteSelected = async () => {
        if (selectedId === null) return
        await deleteEnvironment(selectedId)
        setSelectedId(null)
    }

    const handleRename = async () => {
        if (selectedId === null || !nameValue.trim()) return
        await renameEnvironment(selectedId, nameValue.trim())
        setEditingName(false)
    }

    const handleImportFiles = async (files: FileList | null) => {
        const list = Array.from(files ?? [])
        if (list.length === 0) return
        if (activeWorkspaceId == null) {
            toast.warning(t('sidebar.selectWorkspaceFirst'))
            return
        }
        setImportError(null)
        setIsImporting(true)
        try {
            const importedRows: Array<{ name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }> = []
            for (const file of list) {
                const text = await file.text()
                importedRows.push(...importEnvironments(text, importFormatRef.current))
            }

            if (importedRows.length === 0) {
                setImportError(t('environment.nothingToImport'))
                return
            }

            let createdCount = 0
            let lastCreatedId: number | null = null
            for (const row of importedRows) {
                const created = await createEnvironment(row.name, row.variables)
                if (!created) continue
                createdCount += 1
                lastCreatedId = created.id
            }

            if (createdCount === 0) {
                setImportError(t('environment.importNothingCreated'))
                return
            }

            if (lastCreatedId != null) {
                setSelectedId(lastCreatedId)
                setIsCreating(false)
                setNewEnvName('')
            }
            toast.success(t('environment.importedEnvironments', { count: createdCount }))
        } catch (e) {
            setImportError(e instanceof Error ? e.message : t('environment.importFailed'))
        } finally {
            setIsImporting(false)
            if (importInputRef.current) importInputRef.current.value = ''
        }
    }

    const handleExport = async () => {
        if (!selectedEnv) return
        const exportName = (editingName ? nameValue : selectedEnv.name).trim() || selectedEnv.name
        const variables = buildVarsPayload(localVars, draftRow.key, draftRow.value)
        const json = exportEnvironment({ ...selectedEnv, name: exportName, variables })
        const filename = `${exportName.replace(/[^a-z0-9_-]/gi, '_')}.json`
        const result = await saveTextFile(filename, json, 'application/json')
        if (result === 'saved') {
            toast.success(t('common.exportSuccess', { filename }))
        } else if (result === 'error') {
            toast.error(t('common.exportFailed'))
        }
    }

    const enabledVarCount = localVars.filter((v) => v.enabled).length

    return (
        <>
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <DialogContent
                className="env-manager-dialog !flex h-[min(88vh,720px)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-xl border border-border/80 bg-card p-0 ring-1 ring-border/40 sm:max-w-5xl"
                showCloseButton={false}
            >
                <DialogHeader className="shrink-0 border-b border-border/70 bg-card px-5 py-4">
                    <DialogTitle className="sr-only">{t('environment.manageTitle')}</DialogTitle>
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-[var(--dracula-cyan)] shadow-sm">
                                    <Layers className="size-4" />
                                </span>
                                <p
                                    aria-hidden
                                    className="text-lg font-semibold tracking-tight outline-none select-none"
                                >
                                    {t('environment.manageTitle')}
                                </p>
                            </div>
                            <p className="pl-10.5 text-xs text-muted-foreground">
                                {environments.length === 0
                                    ? t('environment.noEnvironmentsYet')
                                    : t('environment.environmentCount', { count: environments.length })}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {showUnsaved ? (
                                <Badge
                                    variant="outline"
                                    className="border-[color-mix(in_srgb,var(--dracula-orange)_45%,transparent)] bg-[color-mix(in_srgb,var(--dracula-orange)_10%,transparent)] text-[var(--dracula-orange)]"
                                >
                                    {t('environment.unsaved')}
                                </Badge>
                            ) : null}
                            <DialogClose
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-muted-foreground hover:text-foreground"
                                    />
                                }
                            >
                                <X className="size-4" />
                                <span className="sr-only">{t('common.close')}</span>
                            </DialogClose>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 overflow-hidden">
                    {/* Environment rail */}
                    <aside className="flex h-full min-h-0 w-[15.5rem] shrink-0 flex-col overflow-hidden border-r border-border/70 bg-sidebar">
                        <div className="space-y-2 p-3">
                            {isCreating ? (
                                <div className="flex gap-1.5">
                                    <Input
                                        autoFocus
                                        placeholder={t('environment.envNamePlaceholder')}
                                        value={newEnvName}
                                        onChange={(e) => setNewEnvName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreateEnv()
                                            if (e.key === 'Escape') {
                                                setIsCreating(false)
                                                setNewEnvName('')
                                            }
                                        }}
                                        className="h-8 border-sidebar-border/60 bg-transparent text-xs"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 shrink-0 px-2.5 text-xs"
                                        onClick={handleCreateEnv}
                                        disabled={!newEnvName.trim()}
                                    >
                                        {t('common.add')}
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-full justify-start gap-2 text-xs hover:bg-[var(--sidebar-row-hover)]"
                                    onClick={() => setIsCreating(true)}
                                >
                                    <Plus className="size-3.5 text-[var(--dracula-green)]" />
                                    {t('environment.newEnvironmentButton')}
                                </Button>
                            )}
                            <input
                                ref={importInputRef}
                                type="file"
                                accept=".json,.env,application/json,text/plain"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    void handleImportFiles(e.target.files)
                                }}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-full justify-start gap-2 text-xs hover:bg-[var(--sidebar-row-hover)]"
                                disabled={isImporting}
                                onClick={() => setImportFormatDialogOpen(true)}
                                title={t('environment.importTitle')}
                            >
                                {isImporting ? (
                                    <Loader2 className="size-3.5 shrink-0 animate-spin opacity-70" aria-hidden />
                                ) : (
                                    <Upload className="size-3.5 shrink-0 text-[var(--dracula-cyan)]" aria-hidden />
                                )}
                                {isImporting ? t('common.importing') : t('environment.import')}
                            </Button>
                            {importError ? (
                                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
                                    {importError}
                                </p>
                            ) : null}
                        </div>

                        <div className="px-3 pb-2">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={envListQuery}
                                    onChange={(e) => setEnvListQuery(e.target.value)}
                                    placeholder={t('environment.searchPlaceholder')}
                                    className="h-8 border-sidebar-border/60 bg-transparent pl-8 text-xs"
                                />
                            </div>
                        </div>

                        <ScrollArea className="min-h-0 flex-1">
                            <div className="space-y-0.5 p-2">
                                {environments.length === 0 ? (
                                    <div className="px-2 py-6 text-center">
                                        <Sparkles className="mx-auto mb-2 size-5 text-muted-foreground/50" />
                                        <p className="text-xs text-muted-foreground">{t('environment.noEnvironmentsYet')}</p>
                                    </div>
                                ) : filteredEnvs.length === 0 ? (
                                    <p className="px-2 py-4 text-xs text-muted-foreground">{t('common.noMatch')}</p>
                                ) : (
                                    filteredEnvs.map((env) => {
                                        const isSelected = selectedId === env.id
                                        const isActive = activeEnvironmentId === env.id
                                        return (
                                            <button
                                                key={env.id}
                                                type="button"
                                                onClick={() => setSelectedId(env.id)}
                                                className={cn(
                                                    'group flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs transition-colors',
                                                    isSelected
                                                        ? 'bg-primary/10 font-medium text-foreground ring-1 ring-inset ring-primary/25'
                                                        : 'text-sidebar-foreground/80 hover:bg-[var(--sidebar-row-hover)] hover:text-sidebar-foreground'
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        'size-1.5 shrink-0 rounded-full transition-colors',
                                                        isActive
                                                            ? 'bg-[var(--dracula-green)] shadow-[0_0_8px_color-mix(in_srgb,var(--dracula-green)_60%,transparent)]'
                                                            : 'bg-muted-foreground/30 group-hover:bg-muted-foreground/50'
                                                    )}
                                                    title={isActive ? t('envSelector.label') : undefined}
                                                />
                                                <span className="min-w-0 flex-1 truncate">{env.name}</span>
                                                <span
                                                    className={cn(
                                                        'shrink-0 tabular-nums text-[10px]',
                                                        isSelected ? 'text-primary/80' : 'text-muted-foreground'
                                                    )}
                                                >
                                                    {(env.variables ?? []).length}
                                                </span>
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </aside>

                    {/* Editor pane */}
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">
                        {selectedEnv ? (
                            <>
                                <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
                                    {editingName ? (
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <Input
                                                autoFocus
                                                value={nameValue}
                                                onChange={(e) => setNameValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename()
                                                    if (e.key === 'Escape') {
                                                        setEditingName(false)
                                                        setNameValue(selectedEnv.name)
                                                    }
                                                }}
                                                className="h-9 max-w-sm text-sm"
                                            />
                                            <Button type="button" size="sm" className="h-9 px-3" onClick={handleRename}>
                                                <Check className="size-3.5" />
                                                {t('common.ok')}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-9 px-3"
                                                onClick={() => {
                                                    setEditingName(false)
                                                    setNameValue(selectedEnv.name)
                                                }}
                                            >
                                                <X className="size-3.5" />
                                                {t('common.cancel')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="truncate text-base font-semibold tracking-tight">
                                                    {selectedEnv.name}
                                                </h3>
                                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                    {t('environment.varsActive', {
                                                        enabled: enabledVarCount,
                                                        total: localVars.length,
                                                    })}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                                                    onClick={() => void handleExport()}
                                                    title={t('environment.exportTitle')}
                                                >
                                                    <Download className="size-3.5" />
                                                    {t('common.export')}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                                                    onClick={() => setEditingName(true)}
                                                >
                                                    <Pencil className="size-3.5" />
                                                    {t('common.rename')}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 gap-1.5 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    onClick={() => void handleDeleteSelected()}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                    {t('common.delete')}
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <ScrollArea className="min-h-0 flex-1">
                                    <div className="px-1 py-1">
                                        <div className={cn('sticky top-0 z-10 border-b border-border/70 bg-card', VAR_ROW_GRID)}>
                                            <div className="flex items-center justify-center py-2 pl-3 pr-1">
                                                <input
                                                    ref={selectAllVarsRef}
                                                    type="checkbox"
                                                    checked={allVarsEnabled}
                                                    disabled={localVars.length === 0}
                                                    onChange={toggleSelectAllVars}
                                                    className="cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                                    title={allVarsEnabled ? t('common.unselectAll') : t('common.selectAll')}
                                                    aria-label={
                                                        allVarsEnabled ? t('common.unselectAllVariables') : t('common.selectAllVariables')
                                                    }
                                                />
                                            </div>
                                            <div className="border-l border-border/40 py-2 pl-3 text-left">
                                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                    {t('common.key')}
                                                </span>
                                            </div>
                                            <div className="border-l border-border/40 py-2 pl-3 text-left">
                                                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                    {t('common.value')}
                                                </span>
                                            </div>
                                            <div className="sr-only">{t('common.remove')}</div>
                                        </div>

                                        {localVars.map((pair) => (
                                            <div
                                                key={pair.id}
                                                className={cn(
                                                    'group border-b border-border/40 transition-colors hover:bg-muted/15',
                                                    !pair.enabled && 'opacity-45',
                                                    VAR_ROW_GRID
                                                )}
                                            >
                                                <div className="flex items-center justify-center py-1.5 pl-3 pr-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={pair.enabled}
                                                        onChange={(e) =>
                                                            updatePair(pair.id, 'enabled', e.target.checked)
                                                        }
                                                        className="cursor-pointer accent-primary"
                                                    />
                                                </div>
                                                <div className="border-l border-border/40 py-1 pl-2 pr-1">
                                                    <input
                                                        type="text"
                                                        value={pair.key}
                                                        onChange={(e) =>
                                                            updatePair(pair.id, 'key', e.target.value)
                                                        }
                                                        placeholder={t('common.key')}
                                                        className="w-full rounded-md bg-transparent px-2 py-1 font-mono text-xs transition-colors focus:bg-muted/20 focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--dracula-cyan)_40%,transparent)]"
                                                    />
                                                </div>
                                                <div className="min-w-0 border-l border-border/40 py-1 pr-1">
                                                    <input
                                                        type="text"
                                                        value={pair.value}
                                                        onChange={(e) =>
                                                            updatePair(pair.id, 'value', e.target.value)
                                                        }
                                                        placeholder={t('common.value')}
                                                        className="w-full rounded-md bg-transparent px-2 py-1 font-mono text-xs text-[color-mix(in_srgb,var(--dracula-cyan)_88%,white)] transition-colors focus:bg-muted/20 focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--dracula-cyan)_40%,transparent)]"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => deletePair(pair.id)}
                                                        className="flex cursor-pointer items-center justify-center rounded p-1 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                                        title={t('common.remove')}
                                                        aria-label={t('common.remove')}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        <div className={cn('border-b border-border/40 opacity-55 focus-within:opacity-100', VAR_ROW_GRID)}>
                                            <div className="flex items-center justify-center py-1.5 pl-3 pr-1">
                                                <input
                                                    type="checkbox"
                                                    disabled
                                                    className="cursor-not-allowed accent-primary opacity-40"
                                                    aria-hidden
                                                />
                                            </div>
                                            <div className="border-l border-border/40 py-1 pl-2 pr-1">
                                                <input
                                                    type="text"
                                                    value={draftRow.key}
                                                    onChange={(e) => setDraftField('key', e.target.value)}
                                                    onBlur={handleDraftBlur}
                                                    placeholder={t('common.key')}
                                                    className="w-full rounded-md bg-transparent px-2 py-1 font-mono text-xs italic text-muted-foreground focus:bg-muted/20 focus:text-foreground focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--dracula-green)_35%,transparent)]"
                                                />
                                            </div>
                                            <div className="min-w-0 border-l border-border/40 py-1 pr-1">
                                                <input
                                                    type="text"
                                                    value={draftRow.value}
                                                    onChange={(e) => setDraftField('value', e.target.value)}
                                                    onBlur={handleDraftBlur}
                                                    placeholder={t('common.value')}
                                                    className="w-full rounded-md bg-transparent px-2 py-1 font-mono text-xs italic text-muted-foreground focus:bg-muted/20 focus:text-foreground focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--dracula-green)_35%,transparent)]"
                                                />
                                            </div>
                                            <div aria-hidden />
                                        </div>
                                    </div>
                                </ScrollArea>

                                <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div
                                        className="flex min-h-7 min-w-0 flex-1 flex-col gap-1 text-[11px] leading-snug text-muted-foreground"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                            {varsDirty && !syncBlocked ? (
                                                <span className="inline-flex items-center gap-1 text-[var(--dracula-cyan)]">
                                                    <Loader2 className="size-3 animate-spin" />
                                                    {t('environment.autoSaveSoon')}
                                                </span>
                                            ) : null}
                                            {syncBlocked ? (
                                                <span className="shrink-0">{t('sync.offline')}</span>
                                            ) : null}
                                            {showUnreachable && !syncBlocked ? (
                                                <span className="shrink-0">{t('sync.serverUnreachable')}</span>
                                            ) : null}
                                            {showPending ? (
                                                <span className="shrink-0 tabular-nums">
                                                    {pulling || pushing ? t('sync.syncing') : t('sync.pending', { count: pending })}
                                                </span>
                                            ) : null}
                                            {showSyncErr ? (
                                                <span className="min-w-0 max-w-full truncate text-destructive">{lastErr}</span>
                                            ) : null}
                                        </div>
                                        {saveNotice === 'success' ? (
                                            <span className="inline-flex items-center gap-1 font-medium text-[var(--dracula-green)]">
                                                <Check className="size-3" />
                                                {t('environment.changesSaved')}
                                            </span>
                                        ) : saveNotice === 'error' ? (
                                            <span className="font-medium text-destructive">{t('environment.saveFailed')}</span>
                                        ) : null}
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 shrink-0 self-end gap-1.5 bg-[var(--dracula-green)] px-4 text-xs font-semibold text-[#282a36] hover:bg-[color-mix(in_srgb,var(--dracula-green)_88%,white)] sm:self-auto"
                                        onClick={() => void handleSave()}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="size-3.5 animate-spin" />
                                                {t('environment.saving')}
                                            </>
                                        ) : (
                                            t('environment.save')
                                        )}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                                <div className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/20 text-muted-foreground/60">
                                    <Layers className="size-6" />
                                </div>
                                <p className="max-w-xs text-sm text-muted-foreground">
                                    {environments.length === 0
                                        ? t('environment.createToStart')
                                        : t('environment.selectEnvironment')}
                                </p>
                                {environments.length === 0 ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="mt-1 gap-1.5"
                                        onClick={() => setIsCreating(true)}
                                    >
                                        <Plus className="size-3.5" />
                                        {t('environment.newEnvironmentButton')}
                                    </Button>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        <ImportFormatDialog
            open={importFormatDialogOpen}
            onClose={() => setImportFormatDialogOpen(false)}
            onConfirm={(format) => {
                importFormatRef.current = format
                requestAnimationFrame(() => importInputRef.current?.click())
            }}
            kind="environment"
        />
        </>
    )
}
