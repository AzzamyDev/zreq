import { describe, expect, it } from 'vitest'
import { chartBuckets, clampDurationMin, clampVirtualUsers, performanceSummary, percentile, virtualUsersAt } from './runner-plan'
import type { RunnerResult } from '../types'

const row = (partial: Partial<RunnerResult>): RunnerResult => ({
    id: '1',
    name: 'Find All',
    method: 'GET',
    role: 'target',
    iteration: 1,
    status: 200,
    durationMs: 10,
    state: 'sent',
    at: 1_000,
    error: false,
    failedChecks: 0,
    ...partial,
})

describe('runner plan', () => {
    it('keeps virtual users and duration inside a safe range', () => {
        expect(clampVirtualUsers(0)).toBe(1)
        expect(clampVirtualUsers(80)).toBe(20)
        expect(clampDurationMin(0)).toBe(1)
        expect(clampDurationMin(30)).toBe(5)
    })

    it('splits transport errors from failed tests', () => {
        const summary = performanceSummary([
            row({ id: 'a', at: 1_000, status: 500, error: true, durationMs: 4 }),
            row({ id: 'b', at: 1_500, status: 200, error: false, failedChecks: 1, state: 'fail', durationMs: 8 }),
        ], 1_000, 2_000)
        expect(summary.total).toBe(2)
        expect(summary.errorPct).toBe(50)
        expect(summary.failurePct).toBe(50)
        expect(summary.avgMs).toBe(6)
        expect(percentile([4, 8], 90)).toBe(8)
    })

    it('shapes virtual users for each load profile', () => {
        expect(virtualUsersAt('fixed', 0, 1000, 10)).toBe(10)
        expect(virtualUsersAt('ramp', 0, 1000, 10)).toBe(1)
        expect(virtualUsersAt('ramp', 1000, 1000, 10)).toBe(10)
        expect(virtualUsersAt('spike', 100, 1000, 10)).toBe(1)
        expect(virtualUsersAt('spike', 500, 1000, 10)).toBe(10)
        expect(virtualUsersAt('peak', 0, 1000, 10)).toBe(1)
        expect(virtualUsersAt('peak', 500, 1000, 10)).toBe(10)
        expect(virtualUsersAt('peak', 1000, 1000, 10)).toBe(1)
    })

    it('draws one chart point per second', () => {
        const points = chartBuckets([
            row({ id: 'a', at: 1_100 }),
            row({ id: 'b', at: 1_400 }),
            row({ id: 'c', at: 2_200, error: true, status: 500 }),
        ], 1_000)
        expect(points).toHaveLength(2)
        expect(points[0]?.requestsPerSec).toBe(2)
        expect(points[1]?.errorPct).toBe(100)
    })
})
