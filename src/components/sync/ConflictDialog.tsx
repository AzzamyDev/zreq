import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSyncStore } from '@/store/syncStore'
import type { ConflictEntry } from '@/lib/local-replica/types'
import { resolveConflictKeepLocal, resolveConflictKeepServer } from '@/lib/local-replica/conflict-resolve'
import {
    buildConflictDiffModel,
    type ConflictDiffModel,
    type UnifiedLine,
    unifiedLineDiff,
} from '@/lib/conflict-diff'
import { cn } from '@/lib/utils'

const UNIFIED_MAX_RENDER = 280

function buildUnifiedRender(model: ConflictDiffModel): { showUnified: boolean; renderUnified: UnifiedLine[] } {
    const unifiedLines =
        model.localJson === model.serverJson
            ? []
            : unifiedLineDiff(model.localJson, model.serverJson)
    const showUnified =
        unifiedLines.length > 0 &&
        unifiedLines.some((l) => l.kind !== 'same') &&
        unifiedLines.length < 6000
    const renderUnified = showUnified
        ? unifiedLines.length > UNIFIED_MAX_RENDER
            ? [
                ...unifiedLines.slice(0, UNIFIED_MAX_RENDER),
                { kind: 'same' as const, text: `… ${unifiedLines.length - UNIFIED_MAX_RENDER} more lines` },
            ]
            : unifiedLines
        : []
    return { showUnified, renderUnified }
}

function ConflictSummaryTab({
    c,
    model,
}: {
    c: ConflictEntry
    model: ConflictDiffModel
}) {
    const { t } = useTranslation()

    const scalarPathLabel = (path: string) =>
        path === 'lastEditedBy' ? t('sync.diffFieldLastEditor') : path

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <p className="text-foreground text-sm font-medium leading-snug">{model.title}</p>
                <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                    {c.kind} · id {c.entityId}
                    {c.workspaceId != null ? ` · ws ${c.workspaceId}` : ''}
                </p>
            </div>

            {model.editorRows.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium">{t('sync.diffEditorsTitle')}</p>
                    <div className="ring-border overflow-hidden rounded-lg ring-1">
                        <div className="bg-muted/60 grid grid-cols-[minmax(0,0.85fr)_1fr_1fr] gap-2 border-b border-border px-2.5 py-2 text-[10px] font-semibold tracking-wide uppercase">
                            <span className="text-muted-foreground">{t('sync.diffField')}</span>
                            <span className="text-rose-700 dark:text-rose-400">{t('sync.diffLocal')}</span>
                            <span className="text-emerald-700 dark:text-emerald-400">{t('sync.diffServer')}</span>
                        </div>
                        {model.editorRows.map((row) => (
                            <div
                                key={row.path}
                                className="grid grid-cols-[minmax(0,0.85fr)_1fr_1fr] gap-2 border-b border-border/70 px-2.5 py-2 font-mono text-[11px] last:border-0"
                            >
                                <span className="text-muted-foreground font-sans">{scalarPathLabel(row.path)}</span>
                                <span className="min-w-0 rounded-md bg-rose-500/8 px-1.5 py-0.5 wrap-break-word text-rose-950 dark:text-rose-100">
                                    {row.local}
                                </span>
                                <span className="min-w-0 rounded-md bg-emerald-500/8 px-1.5 py-0.5 wrap-break-word text-emerald-950 dark:text-emerald-100">
                                    {row.server}
                                </span>
                            </div>
                        ))}
                    </div>
                    {model.editorRows.every((r) => r.local === '—' && r.server === '—') ? (
                        <p className="text-muted-foreground text-[11px] leading-relaxed">{t('sync.diffEditorsNoData')}</p>
                    ) : null}
                </div>
            ) : null}

            {model.scalarRows.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium">{t('sync.diffScalarTitle')}</p>
                    <div className="ring-border overflow-hidden rounded-lg ring-1">
                        <div className="bg-muted/60 grid grid-cols-[minmax(0,0.85fr)_1fr_1fr] gap-2 border-b border-border px-2.5 py-2 text-[10px] font-semibold tracking-wide uppercase">
                            <span className="text-muted-foreground">{t('sync.diffField')}</span>
                            <span className="text-rose-700 dark:text-rose-400">{t('sync.diffLocal')}</span>
                            <span className="text-emerald-700 dark:text-emerald-400">{t('sync.diffServer')}</span>
                        </div>
                        {model.scalarRows.map((row) => (
                            <div
                                key={row.path}
                                className="grid grid-cols-[minmax(0,0.85fr)_1fr_1fr] gap-2 border-b border-border/70 px-2.5 py-2 font-mono text-[11px] last:border-0"
                            >
                                <span className="text-muted-foreground font-sans">{scalarPathLabel(row.path)}</span>
                                <span className="min-w-0 rounded-md bg-rose-500/8 px-1.5 py-0.5 wrap-break-word text-rose-950 dark:text-rose-100">
                                    {row.local}
                                </span>
                                <span className="min-w-0 rounded-md bg-emerald-500/8 px-1.5 py-0.5 wrap-break-word text-emerald-950 dark:text-emerald-100">
                                    {row.server}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {model.varRows.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium">{t('sync.diffVariablesTitle')}</p>
                    <div className="ring-border overflow-hidden rounded-lg ring-1">
                        <div className="bg-muted/60 grid grid-cols-[minmax(0,0.65fr)_0.55fr_1fr_1fr] gap-2 border-b border-border px-2.5 py-2 text-[10px] font-semibold tracking-wide uppercase">
                            <span className="text-muted-foreground">{t('sync.diffVarKey')}</span>
                            <span className="text-muted-foreground">{t('sync.diffVarKind')}</span>
                            <span className="text-rose-700 dark:text-rose-400">{t('sync.diffLocal')}</span>
                            <span className="text-emerald-700 dark:text-emerald-400">{t('sync.diffServer')}</span>
                        </div>
                        {model.varRows.map((row, idx) => (
                            <div
                                key={`${row.key}-${row.kind}-${idx}`}
                                className="grid grid-cols-[minmax(0,0.65fr)_0.55fr_1fr_1fr] gap-2 border-b border-border/70 px-2.5 py-2 font-mono text-[11px] last:border-0"
                            >
                                <span className="font-sans">{row.key}</span>
                                <span className="text-muted-foreground font-sans text-[10px]">
                                    {t(`sync.diffVar_${row.kind}`)}
                                </span>
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="rounded-md bg-rose-500/8 px-1.5 py-0.5 wrap-break-word">
                                        {row.local}
                                    </span>
                                    {row.localEditor ? (
                                        <span className="text-muted-foreground font-sans text-[10px] leading-tight">
                                            {t('sync.editedBy', { who: row.localEditor })}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="rounded-md bg-emerald-500/8 px-1.5 py-0.5 wrap-break-word">
                                        {row.server}
                                    </span>
                                    {row.serverEditor ? (
                                        <span className="text-muted-foreground font-sans text-[10px] leading-tight">
                                            {t('sync.editedBy', { who: row.serverEditor })}
                                        </span>
                                    ) : null}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {model.itemsStructuralNote ? (
                <p className="text-muted-foreground rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed">
                    {model.itemsStructuralNote}
                </p>
            ) : null}

            {model.envVarMismatchCounts ? (
                <p className="text-muted-foreground rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed">
                    {t('sync.envVarMismatchHint', {
                        local: model.envVarMismatchCounts.local,
                        server: model.envVarMismatchCounts.server,
                    })}
                </p>
            ) : null}

            {model.scalarRows.length === 0 &&
            model.varRows.length === 0 &&
            model.editorRows.length === 0 &&
            !model.itemsStructuralNote &&
            !model.envVarMismatchCounts ? (
                <p className="text-muted-foreground text-sm">{t('sync.conflictSummaryEmpty')}</p>
            ) : null}
        </div>
    )
}

function ConflictLinesTab({ renderUnified }: { renderUnified: UnifiedLine[] }) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-2">
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span>
                    <span className="text-rose-600 dark:text-rose-400">−</span> {t('sync.diffLegendMinus')}
                </span>
                <span>
                    <span className="text-emerald-600 dark:text-emerald-400">+</span> {t('sync.diffLegendPlus')}
                </span>
            </div>
            <ScrollArea className="ring-border h-[min(42vh,360px)] rounded-lg ring-1">
                <pre className="p-3 font-mono text-[11px] leading-relaxed">
                    {renderUnified.map((line, i) => (
                        <div
                            key={i}
                            className={cn(
                                'wrap-break-word border-l-[3px] py-0.5 pl-2',
                                line.kind === 'del' &&
                                'border-rose-500 bg-rose-500/12 text-rose-950 dark:border-rose-400 dark:text-rose-50',
                                line.kind === 'add' &&
                                'border-emerald-500 bg-emerald-500/12 text-emerald-950 dark:border-emerald-400 dark:text-emerald-50',
                                line.kind === 'same' && 'border-transparent text-muted-foreground'
                            )}
                        >
                            {line.kind === 'del' ? '− ' : line.kind === 'add' ? '+ ' : '  '}
                            {line.text || ' '}
                        </div>
                    ))}
                </pre>
            </ScrollArea>
        </div>
    )
}

function ConflictRawTab({ model }: { model: ConflictDiffModel }) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-3">
            <div className="text-muted-foreground grid gap-2 text-[11px] sm:grid-cols-2 sm:gap-4">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
                    <span className="font-medium text-rose-800 dark:text-rose-300">{t('sync.diffLocalJson')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    <span className="font-medium text-emerald-800 dark:text-emerald-300">
                        {t('sync.diffServerJson')}
                    </span>
                </div>
            </div>
            <div className="grid max-h-[min(48vh,420px)] grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-h-0 flex-col gap-1.5">
                    <ScrollArea className="ring-border h-[min(40vh,320px)] rounded-lg ring-1 sm:h-full sm:min-h-[280px]">
                        <pre className="text-foreground/90 p-3 font-mono text-[10px] leading-relaxed wrap-break-word whitespace-pre-wrap">
                            {model.localJson}
                        </pre>
                    </ScrollArea>
                    {model.localTruncated ? (
                        <p className="text-muted-foreground px-0.5 text-[10px]">{t('sync.diffTruncated')}</p>
                    ) : null}
                </div>
                <div className="flex min-h-0 flex-col gap-1.5">
                    <ScrollArea className="ring-border h-[min(40vh,320px)] rounded-lg ring-1 sm:h-full sm:min-h-[280px]">
                        <pre className="text-foreground/90 p-3 font-mono text-[10px] leading-relaxed wrap-break-word whitespace-pre-wrap">
                            {model.serverJson}
                        </pre>
                    </ScrollArea>
                    {model.serverTruncated ? (
                        <p className="text-muted-foreground px-0.5 text-[10px]">{t('sync.diffTruncated')}</p>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

type DiffBodyProps = {
    c: ConflictEntry
    model: ConflictDiffModel
    showUnified: boolean
    renderUnified: UnifiedLine[]
}

function ConflictDiffBody({ c, model, showUnified, renderUnified }: DiffBodyProps) {
    const { t } = useTranslation()

    return (
        <Tabs defaultValue="summary" className="flex w-full flex-col gap-3">
            <TabsList className="h-9 w-full justify-start gap-0.5 p-1 sm:w-auto" variant="default">
                <TabsTrigger className="px-3 text-xs" value="summary">
                    {t('sync.conflictTabSummary')}
                </TabsTrigger>
                {showUnified ? (
                    <TabsTrigger className="px-3 text-xs" value="lines">
                        {t('sync.conflictTabLines')}
                    </TabsTrigger>
                ) : null}
                <TabsTrigger className="px-3 text-xs" value="raw">
                    {t('sync.conflictTabRaw')}
                </TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="mt-0 min-h-0">
                <ConflictSummaryTab c={c} model={model} />
            </TabsContent>

            {showUnified ? (
                <TabsContent value="lines" className="mt-0 min-h-0">
                    <ConflictLinesTab renderUnified={renderUnified} />
                </TabsContent>
            ) : null}

            <TabsContent value="raw" className="mt-0 min-h-0">
                <ConflictRawTab model={model} />
            </TabsContent>
        </Tabs>
    )
}

export default function ConflictDialog() {
    const { t } = useTranslation()
    const conflicts = useSyncStore((s) => s.conflicts)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const first = conflicts[0]
    const open = conflicts.length > 0

    const model = useMemo(() => (first ? buildConflictDiffModel(first) : null), [first])
    const { showUnified, renderUnified } = useMemo(
        () => (model ? buildUnifiedRender(model) : { showUnified: false, renderUnified: [] }),
        [model]
    )

    const onKeepServer = async (c: ConflictEntry) => {
        setBusy(true)
        setErr('')
        try {
            await resolveConflictKeepServer(c)
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }

    const onKeepLocal = async (c: ConflictEntry) => {
        setBusy(true)
        setErr('')
        try {
            await resolveConflictKeepLocal(c)
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={() => {}}>
            {first && model ? (
            <DialogContent
                className="z-[200] flex max-h-[min(88vh,800px)] w-[min(94vw,42rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-border p-0 shadow-lg sm:max-w-none md:w-[min(94vw,52rem)]"
                showCloseButton={false}
            >
                <div className="shrink-0 border-b border-border bg-card px-5 py-4">
                    <DialogHeader className="gap-1.5 text-left">
                        <DialogTitle className="text-base">{t('sync.conflictTitle')}</DialogTitle>
                        <DialogDescription className="text-xs leading-relaxed">
                            {t('sync.conflictDescription')}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <ConflictDiffBody
                        c={first}
                        model={model}
                        showUnified={showUnified}
                        renderUnified={renderUnified}
                    />
                </div>

                {err ? (
                    <p className="text-destructive shrink-0 border-t border-destructive/20 bg-destructive/5 px-5 py-2 text-xs">
                        {err}
                    </p>
                ) : null}

                <DialogFooter className="shrink-0 gap-2 border-t border-border bg-card px-5 py-8 sm:justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-w-[7.5rem]"
                        disabled={busy}
                        onClick={() => void onKeepServer(first)}
                    >
                        {t('sync.keepServer')}
                    </Button>
                    <Button type="button" size="sm" className="min-w-[10rem]" disabled={busy} onClick={() => void onKeepLocal(first)}>
                        {t('sync.keepLocal')}
                    </Button>
                </DialogFooter>
            </DialogContent>
            ) : null}
        </Dialog>
    )
}
