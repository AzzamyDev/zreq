import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import { Upload, Download } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useAppStore } from '../../store'
import { useSyncStore } from '../../store/syncStore'
import { useEnvironment } from '../../hooks/useEnvironment'
import { importEnvironments, exportEnvironment } from '../../lib/importExport'
import type { KV, Environment } from '../../types'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import { pullRemoteFull } from '@/lib/local-replica/sync-engine'

const AUTOSAVE_DEBOUNCE_MS = 700

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
    const { environments, activeWorkspaceId } = useAppStore()
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
    const [saveNotice, setSaveNotice] = useState<'success' | 'error' | null>(null)
    const [persistedVarsSig, setPersistedVarsSig] = useState<string | null>(null)
    const importInputRef = useRef<HTMLInputElement>(null)
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
        setImportError(null)
        setIsImporting(true)
        try {
            const importedRows: Array<{ name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }> = []
            for (const file of list) {
                const text = await file.text()
                importedRows.push(...importEnvironments(text))
            }

            let createdCount = 0
            let lastCreatedId: number | null = null
            const canCreateDirectly = activeWorkspaceId != null && online && reachable !== false

            if (canCreateDirectly) {
                for (const row of importedRows) {
                    const res = await apiClient.post<{ data: Environment }>('/environments', {
                        workspaceId: activeWorkspaceId,
                        name: row.name,
                        variables: row.variables,
                    })
                    createdCount += 1
                    lastCreatedId = res.data.data.id
                }
                // Ensure sidebar/list reflects authoritative server state after batch create.
                await pullRemoteFull()
            } else {
                for (const row of importedRows) {
                    const created = await createEnvironment(row.name, row.variables)
                    if (!created) continue
                    createdCount += 1
                    lastCreatedId = created.id
                }
            }
            if (lastCreatedId != null) {
                setSelectedId(lastCreatedId)
                setIsCreating(false)
                setNewEnvName('')
            }
            if (createdCount > 0) {
                toast.success(t('environment.importedEnvironments', { count: createdCount }))
            }
        } catch (e) {
            setImportError(e instanceof Error ? e.message : t('environment.importFailed'))
        } finally {
            setIsImporting(false)
            if (importInputRef.current) importInputRef.current.value = ''
        }
    }

    const handleExport = () => {
        if (!selectedEnv) return
        const json = exportEnvironment(selectedEnv)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedEnv.name.replace(/[^a-z0-9_-]/gi, '_')}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <DialogContent
                className="max-h-[80vh] max-w-[calc(100vw-2rem)] sm:max-w-5xl w-full flex flex-col gap-0 p-0 overflow-hidden"
                showCloseButton={true}
            >
                <DialogHeader className="shrink-0 px-4 pt-4 pb-0">
                    <DialogTitle>{t('environment.manageTitle')}</DialogTitle>
                </DialogHeader>

                <div className="flex min-h-[400px] flex-1 overflow-hidden">
                    {/* Left panel: environment list */}
                    <div className="flex w-56 shrink-0 flex-col border-r border-border">
                        <div className="flex flex-col gap-1.5 p-2 border-b border-border">
                            {isCreating ? (
                                <div className="flex gap-1">
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
                                        className="h-6 text-xs px-2"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={handleCreateEnv}
                                        disabled={!newEnvName.trim()}
                                    >
                                        {t('common.add')}
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 w-full text-xs"
                                    onClick={() => setIsCreating(true)}
                                >
                                    {t('environment.newEnvironment')}
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
                                variant="outline"
                                size="sm"
                                className="h-6 w-full gap-1 text-xs"
                                disabled={isImporting}
                                onClick={() => importInputRef.current?.click()}
                                title={t('environment.importTitle')}
                            >
                                <Upload className="size-3 shrink-0 opacity-70" aria-hidden />
                                {isImporting ? t('common.importing') : t('environment.import')}
                            </Button>
                            {importError ? (
                                <p className="text-[11px] leading-snug text-destructive">{importError}</p>
                            ) : null}
                        </div>

                        <div className="border-b border-border px-2 py-1.5">
                            <Input
                                value={envListQuery}
                                onChange={(e) => setEnvListQuery(e.target.value)}
                                placeholder={t('environment.searchPlaceholder')}
                                className="h-7 text-xs"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto py-1">
                            {environments.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-muted-foreground">{t('environment.noEnvironmentsYet')}</p>
                            ) : filteredEnvs.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-muted-foreground">{t('common.noMatch')}</p>
                            ) : (
                                filteredEnvs.map((env) => (
                                    <button
                                        key={env.id}
                                        onClick={() => setSelectedId(env.id)}
                                        className={[
                                            'w-full text-left px-3 py-1.5 text-xs rounded-sm transition-colors',
                                            selectedId === env.id
                                                ? 'bg-accent text-accent-foreground font-medium'
                                                : 'hover:bg-muted text-foreground',
                                        ].join(' ')}
                                    >
                                        {env.name}
                                    </button>
                                ))
                            )}
                        </div>

                        {selectedId !== null && (
                            <div className="border-t border-border p-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={handleDeleteSelected}
                                >
                                    {t('common.delete')}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Right panel: variable editor */}
                    <div className="flex flex-1 flex-col overflow-hidden">
                        {selectedEnv ? (
                            <>
                                {/* Env name header */}
                                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                                    {editingName ? (
                                        <div className="flex flex-1 items-center gap-1">
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
                                                className="h-6 text-xs"
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-6 px-2 text-xs"
                                                onClick={handleRename}
                                            >
                                                {t('common.ok')}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-xs"
                                                onClick={() => {
                                                    setEditingName(false)
                                                    setNameValue(selectedEnv.name)
                                                }}
                                            >
                                                {t('common.cancel')}
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="flex-1 text-xs font-medium">{selectedEnv.name}</span>
                                            <button
                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                onClick={handleExport}
                                                title={t('environment.exportTitle')}
                                            >
                                                <Download className="inline size-3 mr-0.5" />
                                                {t('common.export')}
                                            </button>
                                            <button
                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                onClick={() => setEditingName(true)}
                                            >
                                                {t('common.rename')}
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Variable table */}
                                <div className="flex-1 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border/50 bg-muted/30">
                                                <th className="w-8 py-1.5 pl-2 pr-1">
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
                                                </th>
                                                <th className="py-1.5 pr-1 text-left text-xs font-medium text-muted-foreground">
                                                    {t('common.key')}
                                                </th>
                                                <th className="py-1.5 pr-1 text-left text-xs font-medium text-muted-foreground">
                                                    {t('common.value')}
                                                </th>
                                                <th className="w-8 py-1.5 pr-2" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {localVars.map((pair) => (
                                                <tr
                                                    key={pair.id}
                                                    className="group border-b border-border/50 last:border-0"
                                                >
                                                    <td className="w-8 py-1 pl-2 pr-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={pair.enabled}
                                                            onChange={(e) =>
                                                                updatePair(pair.id, 'enabled', e.target.checked)
                                                            }
                                                            className="cursor-pointer accent-primary"
                                                        />
                                                    </td>
                                                    <td className="py-1 pr-1">
                                                        <input
                                                            type="text"
                                                            value={pair.key}
                                                            onChange={(e) =>
                                                                updatePair(pair.id, 'key', e.target.value)
                                                            }
                                                            placeholder={t('common.key')}
                                                            className="w-full bg-transparent px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring rounded"
                                                        />
                                                    </td>
                                                    <td className="py-1 pr-1">
                                                        <input
                                                            type="text"
                                                            value={pair.value}
                                                            onChange={(e) =>
                                                                updatePair(pair.id, 'value', e.target.value)
                                                            }
                                                            placeholder={t('common.value')}
                                                            className="w-full bg-transparent px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring rounded"
                                                        />
                                                    </td>
                                                    <td className="w-8 py-1 pr-2">
                                                        <button
                                                            onClick={() => deletePair(pair.id)}
                                                            className="invisible group-hover:visible rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                                                            title={t('common.remove')}
                                                        >
                                                            <svg
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <path d="M18 6 6 18" />
                                                                <path d="m6 6 12 12" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Empty row for adding new variables */}
                                            <tr className="border-b border-border/50 last:border-0 opacity-50 focus-within:opacity-100">
                                                <td className="w-8 py-1 pl-2 pr-1">
                                                    <input
                                                        type="checkbox"
                                                        disabled
                                                        className="cursor-not-allowed accent-primary"
                                                    />
                                                </td>
                                                <td className="py-1 pr-1">
                                                    <input
                                                        type="text"
                                                        value={draftRow.key}
                                                        onChange={(e) => setDraftField('key', e.target.value)}
                                                        onBlur={handleDraftBlur}
                                                        placeholder={t('common.key')}
                                                        className="w-full bg-transparent px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring rounded"
                                                    />
                                                </td>
                                                <td className="py-1 pr-1">
                                                    <input
                                                        type="text"
                                                        value={draftRow.value}
                                                        onChange={(e) => setDraftField('value', e.target.value)}
                                                        onBlur={handleDraftBlur}
                                                        placeholder={t('common.value')}
                                                        className="w-full bg-transparent px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring rounded"
                                                    />
                                                </td>
                                                <td className="w-8 py-1 pr-2" />
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mx-0 flex flex-col gap-1.5 border-t border-border bg-muted/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                    <div
                                        className="flex min-h-7 min-w-0 flex-1 flex-col gap-1 text-[11px] leading-snug text-muted-foreground"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                            {showUnsaved ? (
                                                <span className="shrink-0 font-medium text-amber-700 dark:text-amber-400">
                                                    {t('environment.unsaved')}
                                                </span>
                                            ) : null}
                                            {varsDirty && !syncBlocked ? (
                                                <span className="min-w-0">{t('environment.autoSaveSoon')}</span>
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
                                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                                {t('environment.changesSaved')}
                                            </span>
                                        ) : saveNotice === 'error' ? (
                                            <span className="font-medium text-destructive">{t('environment.saveFailed')}</span>
                                        ) : null}
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-7 shrink-0 self-end text-xs sm:self-auto"
                                        onClick={() => void handleSave()}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? t('environment.saving') : t('environment.save')}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-1 items-center justify-center">
                                <p className="text-xs text-muted-foreground">
                                    {environments.length === 0
                                        ? t('environment.createToStart')
                                        : t('environment.selectEnvironment')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
