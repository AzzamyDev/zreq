import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { METHOD_TEXT_CLASS } from '@/lib/httpMethodTheme'
import { executeRunner, stopRunner } from '@/lib/runner-run'
import {
    chartBuckets,
    clampDurationMin,
    clampVirtualUsers,
    performanceSummary,
    selectedByRole,
    statsByRequest,
    virtualUsersAt,
    type ChartBucket,
    type LoadProfile,
} from '@/lib/runner-plan'
import { useAppStore } from '@/store'
import type { RunnerResult, RunnerSession, RunnerStep } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type RunnerWorkspaceProps = {
    tabId: string
}

function fmt(value: number, digits = 0): string {
    if (!Number.isFinite(value)) return '0'
    return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatLeft(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000))
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    if (minutes <= 0) return `${seconds}s`
    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds}s`
}

function clock(at: number): string {
    return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function StepRow({
    step,
    index,
    onToggle,
    onMove,
}: {
    step: RunnerStep
    index: number
    onToggle: () => void
    onMove: () => void
}) {
    const { t } = useTranslation()
    const hasTests = (step.request.scripts?.checks?.length ?? 0) > 0
    return (
        <div className={`grid grid-cols-[auto_2rem_4.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 ${step.selected ? '' : 'opacity-50'}`}>
            <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={step.selected}
                aria-label={step.request.name}
                onChange={onToggle}
            />
            <span className="text-xs text-muted-foreground">{index}</span>
            <span className={`text-xs font-bold ${METHOD_TEXT_CLASS[step.request.method] ?? ''}`}>{step.request.method}</span>
            <span className="truncate text-sm">{step.request.name}</span>
            <div className="flex items-center gap-1">
                {hasTests ? null : (
                    <span className="text-xs text-muted-foreground">{t('runner.noTests')}</span>
                )}
                <Button type="button" variant="outline" size="sm" onClick={onMove}>
                    {step.role === 'prepare' ? t('runner.useInRun') : t('runner.useAsSetup')}
                </Button>
            </div>
        </div>
    )
}

const LOAD_PROFILES: LoadProfile[] = ['fixed', 'ramp', 'spike', 'peak']

function ProfilePreview({ profile, users, minutes }: { profile: LoadProfile; users: number; minutes: number }) {
    const { t } = useTranslation()
    const samples = Array.from({ length: 40 }, (_, index) => virtualUsersAt(profile, index, 39, users))
    const path = samples.map((value, index) => {
        const x = 16 + (index / 39) * 284
        const y = 68 - (value / Math.max(1, users)) * 40
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
    const sentence = {
        fixed: 'runner.profileFixed',
        ramp: 'runner.profileRamp',
        spike: 'runner.profileSpike',
        peak: 'runner.profilePeak',
    }[profile]
    return (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
            <svg viewBox="0 0 320 88" className="h-24 w-full" role="img">
                <text x="12" y="18" fill="currentColor" fontSize="12" className="text-muted-foreground">{users} VUs</text>
                <line x1="16" y1="28" x2="16" y2="68" stroke="currentColor" className="text-border" strokeWidth="1" />
                <line x1="16" y1="68" x2="300" y2="68" stroke="currentColor" className="text-border" strokeWidth="1" />
                <path d={path} fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" />
                <text x="8" y="82" fill="currentColor" fontSize="11" className="text-muted-foreground">0</text>
                <text x="250" y="82" fill="currentColor" fontSize="11" className="text-muted-foreground">{minutes} {t('runner.minutes')}</text>
            </svg>
            <p className="text-sm text-muted-foreground">{t(sentence, { users, minutes })}</p>
        </div>
    )
}

function linePath(values: number[], max: number): string {
    if (values.length === 0) return ''
    const left = 44
    const top = 12
    const width = 520
    const height = 150
    return values.map((value, index) => {
        const x = left + (values.length === 1 ? width / 2 : (index / (values.length - 1)) * width)
        const y = top + height - (max <= 0 ? 0 : (Math.min(value, max) / max) * height)
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
}

function PerformanceChart({ points }: { points: ChartBucket[] }) {
    const { t } = useTranslation()
    const rateMax = Math.max(1, ...points.map((point) => point.requestsPerSec))
    const avgMax = Math.max(1, ...points.map((point) => point.avgMs))
    const ticks = points.length === 0 ? [] : [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].filter((point): point is ChartBucket => point != null)
    return (
        <div>
            <svg viewBox="0 0 640 200" className="h-56 w-full">
                {[0, 0.25, 0.5, 0.75, 1].map((mark) => {
                    const y = 12 + 150 * (1 - mark)
                    return <line key={mark} x1="44" x2="564" y1={y} y2={y} stroke="currentColor" className="text-border" strokeWidth="1" />
                })}
                <text x="4" y="20" fill="currentColor" fontSize="11" className="text-muted-foreground">100</text>
                <text x="12" y="92" fill="currentColor" fontSize="11" className="text-muted-foreground">50</text>
                <text x="20" y="166" fill="currentColor" fontSize="11" className="text-muted-foreground">0</text>
                <text x="572" y="20" fill="#8be9fd" fontSize="11">{fmt(avgMax, 0)} ms</text>
                <text x="572" y="36" fill="#f1fa8c" fontSize="11">{fmt(rateMax, 0)} /s</text>
                <path d={linePath(points.map((point) => point.requestsPerSec), rateMax)} fill="none" stroke="#f1fa8c" strokeWidth="2" />
                <path d={linePath(points.map((point) => point.avgMs), avgMax)} fill="none" stroke="#8be9fd" strokeWidth="2" />
                <path d={linePath(points.map((point) => point.errorPct), 100)} fill="none" stroke="#ff5555" strokeWidth="2" />
                {ticks.map((point) => (
                    <text key={point.at} x={point === ticks[0] ? 44 : point === ticks[ticks.length - 1] ? 500 : 280} y="190" fill="currentColor" fontSize="11" className="text-muted-foreground">
                        {clock(point.at)}
                    </text>
                ))}
            </svg>
            <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
                <span className="text-[#f1fa8c]">{t('runner.legendRate')}</span>
                <span className="text-[#8be9fd]">{t('runner.legendAvg')}</span>
                <span className="text-[#ff5555]">{t('runner.legendError')}</span>
            </div>
        </div>
    )
}

export default function RunnerWorkspace({ tabId }: RunnerWorkspaceProps) {
    const { t } = useTranslation()
    const session = useAppStore((state) => state.tabs.find((tab) => tab.id === tabId)?.runner)
    const title = useAppStore((state) => state.tabs.find((tab) => tab.id === tabId)?.name ?? '')
    const patchRunner = useAppStore((state) => state.patchRunner)
    const [now, setNow] = useState(() => Date.now())
    const [resultTab, setResultTab] = useState<'summary' | 'tests' | 'errors'>('summary')
    const [requestFilter, setRequestFilter] = useState('all')
    const pending = useRef<RunnerResult[]>([])

    useEffect(() => {
        if (!session?.running) return
        const timer = setInterval(() => setNow(Date.now()), 500)
        return () => clearInterval(timer)
    }, [session?.running])

    const summary = useMemo(
        () => performanceSummary(session?.results ?? [], session?.startedAt ?? now, now),
        [session?.results, session?.startedAt, now],
    )
    const rows = useMemo(
        () => statsByRequest(session?.results ?? [], session?.startedAt ?? now, now),
        [session?.results, session?.startedAt, now],
    )
    const points = useMemo(() => {
        const source = (session?.results ?? []).filter((row) => requestFilter === 'all' || `${row.method} ${row.name}` === requestFilter)
        return chartBuckets(source, session?.startedAt ?? 0)
    }, [session?.results, session?.startedAt, requestFilter])

    if (!session) return null

    const patch = (change: (runner: RunnerSession) => void) => patchRunner(tabId, change)
    const prepare = session.steps.filter((step) => step.role === 'prepare')
    const targets = session.steps.filter((step) => step.role === 'target')
    const selectedTargets = selectedByRole(session.steps, 'target')
    const users = clampVirtualUsers(session.virtualUsers)
    const minutes = clampDurationMin(session.durationMin)
    const loadProfile = session.loadProfile ?? 'fixed'
    const prepareStopped = session.results.some((row) => row.role === 'prepare' && row.state === 'fail')
    const passed = session.results.filter((row) => row.state === 'pass').length
    const failed = session.results.filter((row) => row.state === 'fail').length
    const sent = session.results.filter((row) => row.state === 'sent').length
    const errorRows = session.results.filter((row) => row.error || row.failedChecks > 0).slice(-80)

    const setSelected = (selected: boolean) => {
        patch((runner) => {
            runner.steps.forEach((step) => {
                step.selected = selected
            })
        })
    }

    const toggle = (id: string) => {
        patch((runner) => {
            const row = runner.steps.find((step) => step.id === id)
            if (row) row.selected = !row.selected
        })
    }

    const move = (id: string, role: RunnerStep['role']) => {
        patch((runner) => {
            const row = runner.steps.find((step) => step.id === id)
            if (row) row.role = role
        })
    }

    const start = async () => {
        const current = useAppStore.getState().tabs.find((tab) => tab.id === tabId)?.runner
        if (!current || current.running || selectedByRole(current.steps, 'target').length === 0) return
        const snapshot = structuredClone(current)
        const startedAt = Date.now()
        snapshot.startedAt = startedAt
        snapshot.endsAt = snapshot.runKind === 'performance'
            ? startedAt + clampDurationMin(snapshot.durationMin) * 60_000
            : null
        snapshot.virtualUsers = clampVirtualUsers(snapshot.virtualUsers)
        snapshot.durationMin = clampDurationMin(snapshot.durationMin)
        patch((runner) => {
            runner.phase = 'run'
            runner.running = true
            runner.results = []
            runner.startedAt = snapshot.startedAt
            runner.endsAt = snapshot.endsAt
            runner.virtualUsers = snapshot.virtualUsers
            runner.durationMin = snapshot.durationMin
        })
        setResultTab('summary')
        setNow(startedAt)
        const flush = () => {
            const batch = pending.current.splice(0)
            if (batch.length === 0) return
            patchRunner(tabId, (runner) => {
                runner.results.push(...batch)
            })
        }
        const timer = setInterval(flush, 400)
        try {
            await executeRunner(tabId, snapshot, (result) => {
                pending.current.push(result)
            })
        } finally {
            clearInterval(timer)
            flush()
            patchRunner(tabId, (runner) => {
                runner.running = false
            })
        }
    }

    if (session.phase === 'run') {
        const left = session.endsAt == null ? 0 : session.endsAt - now
        return (
            <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                    <h1 className="text-base font-semibold">{title}</h1>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${session.running ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {session.running ? t('runner.inProgress') : t('runner.done')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {session.runKind === 'performance'
                            ? t('runner.perfMeta', {
                                name: title,
                                users: session.virtualUsers,
                                when: session.startedAt ? clock(session.startedAt) : '',
                                minutes: session.durationMin,
                                profile: t(`runner.profile.${session.loadProfile ?? 'fixed'}`),
                            })
                            : t('runner.functionalMeta', { name: title })}
                    </span>
                    {session.running && session.runKind === 'performance' ? (
                        <span className="text-sm text-muted-foreground">{t('runner.timeLeft', { time: formatLeft(left) })}</span>
                    ) : null}
                    {session.running ? (
                        <Button type="button" variant="destructive" onClick={() => stopRunner(tabId)}>{t('runner.stop')}</Button>
                    ) : (
                        <>
                            <Button type="button" variant="outline" onClick={() => patch((runner) => { runner.phase = 'configure' })}>{t('runner.back')}</Button>
                            <Button type="button" onClick={() => void start()}>{t('runner.runAgain')}</Button>
                        </>
                    )}
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
                    {prepareStopped ? <p className="mb-3 text-sm text-destructive">{t('runner.prepareFailed')}</p> : null}
                    {session.runKind === 'functional' ? (
                        <div className="mx-auto flex max-w-3xl flex-col gap-3">
                            <p className="text-sm text-muted-foreground">{t('runner.passedShort', { passed, failed, sent })}</p>
                            {session.results.map((row) => (
                                <div key={row.id} className="flex items-center gap-2 text-sm">
                                    <span className={`w-14 shrink-0 text-xs font-bold ${METHOD_TEXT_CLASS[row.method] ?? ''}`}>{row.method}</span>
                                    <span className="min-w-0 flex-1 truncate">{row.name}{row.role === 'prepare' ? ` · ${t('runner.setupTitle')}` : ''}</span>
                                    <span className={row.state === 'fail' ? 'text-destructive' : 'text-muted-foreground'}>{row.status} · {fmt(row.durationMs)} ms</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="flex gap-2 text-sm">
                                {(['summary', 'tests', 'errors'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        className={`rounded-md px-3 py-1 ${resultTab === tab ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
                                        onClick={() => setResultTab(tab)}
                                    >
                                        {t(tab === 'summary' ? 'runner.tabSummary' : tab === 'tests' ? 'runner.tabTests' : 'runner.tabErrors')}
                                    </button>
                                ))}
                            </div>
                            {resultTab === 'summary' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                                        {[
                                            [t('runner.totalSent'), fmt(summary.total)],
                                            [t('runner.perSecond'), fmt(summary.requestsPerSec, 2)],
                                            [t('runner.avgResponse'), `${fmt(summary.avgMs, 0)} ms`],
                                            ['P90', `${fmt(summary.p90, 0)} ms`],
                                            ['P95', `${fmt(summary.p95, 0)} ms`],
                                            ['P99', `${fmt(summary.p99, 0)} ms`],
                                            [t('runner.errorPct'), fmt(summary.errorPct, 2)],
                                            [t('runner.failurePct'), fmt(summary.failurePct, 2)],
                                        ].map(([label, value]) => (
                                            <div key={label} className="rounded-lg border border-border px-3 py-2">
                                                <p className="truncate text-xs text-muted-foreground">{label}</p>
                                                <p className={`text-lg font-semibold ${label === t('runner.errorPct') && summary.errorPct > 0 ? 'text-destructive' : ''}`}>{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-end">
                                        <label className="text-xs text-muted-foreground">
                                            {t('runner.filterRequests')}
                                            <select
                                                className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                                                value={requestFilter}
                                                onChange={(event) => setRequestFilter(event.target.value)}
                                            >
                                                <option value="all">{t('runner.allRequests')}</option>
                                                {rows.map((row) => (
                                                    <option key={`${row.method} ${row.name}`} value={`${row.method} ${row.name}`}>{row.method} {row.name}</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                    {points.length === 0 ? <p className="text-sm text-muted-foreground">{t('runner.chartWaiting')}</p> : <PerformanceChart points={points} />}
                                    <div className="overflow-auto">
                                        <p className="mb-2 text-sm font-medium">{t('runner.details')}</p>
                                        <table className="w-full min-w-[720px] text-left text-sm">
                                            <thead className="text-xs text-muted-foreground">
                                                <tr>
                                                    <th className="py-1 pr-2">#</th>
                                                    <th className="py-1 pr-2">{t('runner.colRequest')}</th>
                                                    <th className="py-1 pr-2">{t('runner.colTotal')}</th>
                                                    <th className="py-1 pr-2">{t('runner.colRate')}</th>
                                                    <th className="py-1 pr-2">{t('runner.errorPct')}</th>
                                                    <th className="py-1 pr-2">{t('runner.failurePct')}</th>
                                                    <th className="py-1 pr-2">{t('runner.colAvg')}</th>
                                                    <th className="py-1 pr-2">{t('runner.colMin')}</th>
                                                    <th className="py-1">{t('runner.colMax')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map((row, index) => (
                                                    <tr key={`${row.method}-${row.name}`} className="border-t border-border">
                                                        <td className="py-1.5 pr-2">{index + 1}</td>
                                                        <td className="py-1.5 pr-2">
                                                            <span className={`mr-2 text-xs font-bold ${METHOD_TEXT_CLASS[row.method] ?? ''}`}>{row.method}</span>
                                                            {row.name}
                                                        </td>
                                                        <td className="py-1.5 pr-2">{fmt(row.total)}</td>
                                                        <td className="py-1.5 pr-2">{fmt(row.requestsPerSec, 2)}</td>
                                                        <td className="py-1.5 pr-2">
                                                            <span className={`rounded px-1.5 py-0.5 text-xs ${row.errorPct > 0 ? 'bg-destructive text-white' : 'text-[var(--dracula-green)]'}`}>{fmt(row.errorPct, 2)}</span>
                                                        </td>
                                                        <td className={`py-1.5 pr-2 ${row.failurePct > 0 ? 'text-destructive' : 'text-[var(--dracula-green)]'}`}>{fmt(row.failurePct, 2)}</td>
                                                        <td className="py-1.5 pr-2">{fmt(row.avgMs, 0)}</td>
                                                        <td className="py-1.5 pr-2">{fmt(row.minMs, 0)}</td>
                                                        <td className="py-1.5">{fmt(row.maxMs, 0)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : null}
                            {resultTab === 'tests' ? (
                                <table className="w-full text-left text-sm">
                                    <thead className="text-xs text-muted-foreground">
                                        <tr>
                                            <th className="py-1 pr-2">{t('runner.colRequest')}</th>
                                            <th className="py-1 pr-2">{t('runner.passed')}</th>
                                            <th className="py-1 pr-2">{t('runner.failed')}</th>
                                            <th className="py-1">{t('runner.sent')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={`${row.method}-${row.name}`} className="border-t border-border">
                                                <td className="py-1.5 pr-2">
                                                    <span className={`mr-2 text-xs font-bold ${METHOD_TEXT_CLASS[row.method] ?? ''}`}>{row.method}</span>
                                                    {row.name}
                                                </td>
                                                <td className="py-1.5 pr-2 text-[var(--dracula-green)]">{row.passed}</td>
                                                <td className="py-1.5 pr-2 text-destructive">{row.failed}</td>
                                                <td className="py-1.5">{row.sent}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : null}
                            {resultTab === 'errors' ? (
                                errorRows.length === 0 ? <p className="text-sm text-muted-foreground">{t('runner.noErrors')}</p> : (
                                    <div className="space-y-1">
                                        {errorRows.map((row) => (
                                            <div key={row.id} className="flex items-center gap-2 text-sm">
                                                <span className={`w-14 text-xs font-bold ${METHOD_TEXT_CLASS[row.method] ?? ''}`}>{row.method}</span>
                                                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                                                <span className="text-destructive">{row.status} · {fmt(row.durationMs)} ms</span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <section className="flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0">
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                    <h1 className="text-sm font-semibold">{t('runner.runOrder')}</h1>
                    <span className="text-xs text-muted-foreground">{title}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{t('runner.selectedCount', { count: session.steps.filter((step) => step.selected).length, total: session.steps.length })}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelected(true)}>{t('runner.selectAll')}</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelected(false)}>{t('runner.unselectAll')}</Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => patch((runner) => {
                            runner.steps.forEach((step) => {
                                step.selected = true
                                step.role = 'target'
                            })
                        })}
                    >
                        {t('runner.reset')}
                    </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                    {session.steps.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">{t('runner.empty')}</p> : (
                        <>
                            <div className="border-b border-border px-4 py-3">
                                <h2 className="text-sm font-medium">{t('runner.setupTitle')}</h2>
                                <p className="mb-2 text-xs text-muted-foreground">{t('runner.setupHint')}</p>
                                {prepare.length === 0 ? <p className="text-xs text-muted-foreground">{t('runner.emptySetup')}</p> : prepare.map((step, index) => (
                                    <StepRow key={step.id} step={step} index={index + 1} onToggle={() => toggle(step.id)} onMove={() => move(step.id, 'target')} />
                                ))}
                            </div>
                            {targets.map((step, index) => (
                                <StepRow key={step.id} step={step} index={index + 1} onToggle={() => toggle(step.id)} onMove={() => move(step.id, 'prepare')} />
                            ))}
                        </>
                    )}
                </div>
            </section>
            <section className="flex min-h-0 flex-col overflow-auto px-4 py-4">
                <h2 className="mb-2 text-sm font-semibold">{t('runner.runType')}</h2>
                <div className="mb-4 space-y-2">
                    {(['functional', 'performance'] as const).map((kind) => (
                        <label key={kind} className="flex cursor-pointer gap-2 rounded-lg border border-border px-3 py-2">
                            <input
                                type="radio"
                                className="mt-1 accent-primary"
                                name={`${tabId}-run-kind`}
                                checked={session.runKind === kind}
                                onChange={() => patch((runner) => { runner.runKind = kind })}
                            />
                            <span>
                                <span className="block text-sm font-medium">{t(kind === 'functional' ? 'runner.functional' : 'runner.performance')}</span>
                                <span className="block text-xs text-muted-foreground">{t(kind === 'functional' ? 'runner.functionalHint' : 'runner.performanceHint')}</span>
                            </span>
                        </label>
                    ))}
                </div>
                {session.runKind === 'functional' ? (
                    <p className="mb-4 text-sm text-muted-foreground">{t('runner.functionalBody')}</p>
                ) : (
                    <div className="mb-4 space-y-3">
                        <h2 className="text-sm font-semibold">{t('runner.perfSetup')}</h2>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <label className="text-xs text-muted-foreground">
                                {t('runner.loadProfile')}
                                <select
                                    className="mt-1 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                                    value={loadProfile}
                                    onChange={(event) => patch((runner) => {
                                        runner.loadProfile = event.target.value as LoadProfile
                                    })}
                                >
                                    {LOAD_PROFILES.map((profile) => (
                                        <option key={profile} value={profile}>{t(`runner.profile.${profile}`)}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-xs text-muted-foreground">
                                {t('runner.virtualUsers')}
                                <Input
                                    type="number"
                                    min={1}
                                    max={20}
                                    className="mt-1"
                                    value={session.virtualUsers}
                                    onChange={(event) => patch((runner) => { runner.virtualUsers = clampVirtualUsers(Number(event.target.value)) })}
                                />
                            </label>
                            <label className="text-xs text-muted-foreground">
                                {t('runner.duration')}
                                <div className="mt-1 flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min={1}
                                        max={5}
                                        value={session.durationMin}
                                        onChange={(event) => patch((runner) => { runner.durationMin = clampDurationMin(Number(event.target.value)) })}
                                    />
                                    <span className="text-sm">{t('runner.minutes')}</span>
                                </div>
                            </label>
                        </div>
                        <ProfilePreview profile={loadProfile} users={users} minutes={minutes} />
                    </div>
                )}
                <Button
                    type="button"
                    className="mt-auto w-fit bg-[var(--dracula-orange)] text-black hover:bg-[var(--dracula-orange)]/90"
                    disabled={selectedTargets.length === 0}
                    onClick={() => void start()}
                >
                    {t('runner.start')}
                </Button>
            </section>
        </div>
    )
}
