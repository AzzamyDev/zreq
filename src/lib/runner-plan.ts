import type { RunnerResult, RunnerStep } from '../types'

export function clampVirtualUsers(value: number): number {
    if (!Number.isFinite(value)) return 5
    return Math.min(20, Math.max(1, Math.trunc(value)))
}

export function clampDurationMin(value: number): number {
    if (!Number.isFinite(value)) return 1
    return Math.min(5, Math.max(1, Math.trunc(value)))
}

export type LoadProfile = 'fixed' | 'ramp' | 'spike' | 'peak'

/** How many virtual users should be working at this moment in the test. */
export function virtualUsersAt(profile: LoadProfile, elapsedMs: number, durationMs: number, users: number): number {
    const max = clampVirtualUsers(users)
    const duration = Math.max(1, durationMs)
    const ratio = Math.min(1, Math.max(0, elapsedMs / duration))
    if (profile === 'fixed') return max
    if (profile === 'ramp') return Math.max(1, Math.ceil(max * ratio))
    if (profile === 'spike') {
        return ratio >= 0.4 && ratio < 0.6 ? max : Math.max(1, Math.round(max * 0.1))
    }
    if (ratio < 0.25) return Math.max(1, Math.ceil(max * (ratio / 0.25)))
    if (ratio < 0.75) return max
    return Math.max(1, Math.ceil(max * ((1 - ratio) / 0.25)))
}

export function selectedByRole(steps: RunnerStep[], role: RunnerStep['role']): RunnerStep[] {
    return steps.filter((step) => step.selected && step.role === role)
}

export function resultState(status: number, failedChecks: number, checkCount: number): RunnerResult['state'] {
    if (status === 0 || status >= 400 || failedChecks > 0) return 'fail'
    if (checkCount === 0) return 'sent'
    return 'pass'
}

export function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
    return sorted[index] ?? 0
}

export type PerformanceSummary = {
    total: number
    requestsPerSec: number
    avgMs: number
    p90: number
    p95: number
    p99: number
    errorPct: number
    failurePct: number
}

export function performanceSummary(results: RunnerResult[], startedAt: number, now: number): PerformanceSummary {
    const rows = results.filter((row) => row.role === 'target')
    const total = rows.length
    const elapsedSec = Math.max(0.001, (Math.max(now, startedAt) - startedAt) / 1000)
    const durations = rows.map((row) => row.durationMs).sort((a, b) => a - b)
    const errors = rows.filter((row) => row.error).length
    const failures = rows.filter((row) => row.failedChecks > 0).length
    const avgMs = total === 0 ? 0 : durations.reduce((sum, value) => sum + value, 0) / total
    return {
        total,
        requestsPerSec: total / elapsedSec,
        avgMs,
        p90: percentile(durations, 90),
        p95: percentile(durations, 95),
        p99: percentile(durations, 99),
        errorPct: total === 0 ? 0 : (errors / total) * 100,
        failurePct: total === 0 ? 0 : (failures / total) * 100,
    }
}

export type ChartBucket = {
    at: number
    requestsPerSec: number
    avgMs: number
    errorPct: number
}

/** One point per second from the first target response through the last. */
export function chartBuckets(results: RunnerResult[], startedAt: number): ChartBucket[] {
    const rows = results.filter((row) => row.role === 'target' && row.at > 0)
    if (rows.length === 0 || startedAt <= 0) return []
    const map = new Map<number, { count: number; duration: number; errors: number }>()
    for (const row of rows) {
        const at = startedAt + Math.floor((row.at - startedAt) / 1000) * 1000
        const bucket = map.get(at) ?? { count: 0, duration: 0, errors: 0 }
        bucket.count += 1
        bucket.duration += row.durationMs
        if (row.error) bucket.errors += 1
        map.set(at, bucket)
    }
    const times = [...map.keys()].sort((a, b) => a - b)
    const first = times[0] ?? startedAt
    const last = times[times.length - 1] ?? first
    const points: ChartBucket[] = []
    for (let at = first; at <= last; at += 1000) {
        const bucket = map.get(at)
        points.push({
            at,
            requestsPerSec: bucket?.count ?? 0,
            avgMs: bucket && bucket.count > 0 ? bucket.duration / bucket.count : 0,
            errorPct: bucket && bucket.count > 0 ? (bucket.errors / bucket.count) * 100 : 0,
        })
    }
    return points
}

export type RequestRunStats = {
    method: string
    name: string
    total: number
    requestsPerSec: number
    errorPct: number
    failurePct: number
    avgMs: number
    minMs: number
    maxMs: number
    p90: number
    passed: number
    failed: number
    sent: number
}

export function statsByRequest(results: RunnerResult[], startedAt: number, now: number): RequestRunStats[] {
    const elapsedSec = Math.max(0.001, (Math.max(now, startedAt || now) - (startedAt || now)) / 1000)
    const groups = new Map<string, RunnerResult[]>()
    for (const row of results) {
        if (row.role !== 'target') continue
        const key = `${row.method}\n${row.name}`
        const list = groups.get(key) ?? []
        list.push(row)
        groups.set(key, list)
    }
    return [...groups.entries()].map(([, rows]) => {
        const durations = rows.map((row) => row.durationMs).sort((a, b) => a - b)
        const total = rows.length
        const errors = rows.filter((row) => row.error).length
        const failures = rows.filter((row) => row.failedChecks > 0).length
        return {
            method: rows[0]?.method ?? '',
            name: rows[0]?.name ?? '',
            total,
            requestsPerSec: total / elapsedSec,
            errorPct: total === 0 ? 0 : (errors / total) * 100,
            failurePct: total === 0 ? 0 : (failures / total) * 100,
            avgMs: total === 0 ? 0 : durations.reduce((sum, value) => sum + value, 0) / total,
            minMs: durations[0] ?? 0,
            maxMs: durations[durations.length - 1] ?? 0,
            p90: percentile(durations, 90),
            passed: rows.filter((row) => row.state === 'pass').length,
            failed: rows.filter((row) => row.state === 'fail').length,
            sent: rows.filter((row) => row.state === 'sent').length,
        }
    })
}
