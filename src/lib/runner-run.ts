import { sendHttpRequest } from './send-http'
import { clampDurationMin, clampVirtualUsers, resultState, selectedByRole, virtualUsersAt } from './runner-plan'
import type { RunnerResult, RunnerSession } from '../types'
import { nanoid } from 'nanoid'

const stops = new Map<string, { current: boolean }>()

export function stopRunner(tabId: string) {
    const flag = stops.get(tabId)
    if (flag) flag.current = true
}

async function sendOne(
    step: RunnerSession['steps'][number],
    iteration: number,
): Promise<RunnerResult> {
    const sent = await sendHttpRequest(step.request)
    const failed = sent.checks.filter((check) => !check.pass).length
    return {
        id: nanoid(),
        name: step.request.name,
        method: step.request.method,
        role: step.role,
        iteration,
        status: sent.response.status,
        durationMs: sent.response.durationMs,
        state: resultState(sent.response.status, failed, sent.checks.length),
        at: Date.now(),
        error: sent.response.status === 0 || sent.response.status >= 400,
        failedChecks: failed,
    }
}

/** Runs prepare steps once, then the chosen requests. Stress repeats only the test steps. */
export async function executeRunner(
    tabId: string,
    session: RunnerSession,
    onResult: (result: RunnerResult) => void,
): Promise<void> {
    const flag = { current: false }
    stops.set(tabId, flag)
    const prepare = selectedByRole(session.steps, 'prepare')
    const targets = selectedByRole(session.steps, 'target')
    try {
        for (const step of prepare) {
            if (flag.current) return
            const result = await sendOne(step, 1)
            onResult(result)
            if (result.state === 'fail') return
        }
        if (flag.current || targets.length === 0) return
        if (session.runKind !== 'performance') {
            for (const step of targets) {
                if (flag.current) return
                onResult(await sendOne(step, 1))
            }
            return
        }
        const started = Date.now()
        const end = session.endsAt ?? started + clampDurationMin(session.durationMin) * 60_000
        const durationMs = Math.max(1, end - started)
        const users = clampVirtualUsers(session.virtualUsers)
        const profile = session.loadProfile ?? 'fixed'
        const jobs: Promise<void>[] = []
        const slots: { stop: boolean }[] = []
        const spawn = () => {
            const slot = { stop: false }
            slots.push(slot)
            jobs.push((async () => {
                while (!flag.current && !slot.stop && Date.now() < end) {
                    for (const step of targets) {
                        if (flag.current || slot.stop || Date.now() >= end) return
                        onResult(await sendOne(step, 1))
                    }
                }
            })())
        }
        while (!flag.current && Date.now() < end) {
            const want = virtualUsersAt(profile, Date.now() - started, durationMs, users)
            const live = slots.filter((slot) => !slot.stop)
            if (live.length < want) {
                for (let index = live.length; index < want; index += 1) spawn()
            } else if (live.length > want) {
                live.slice(want).forEach((slot) => {
                    slot.stop = true
                })
            }
            await new Promise((resolve) => setTimeout(resolve, 250))
        }
        slots.forEach((slot) => {
            slot.stop = true
        })
        await Promise.all(jobs)
    } finally {
        stops.delete(tabId)
    }
}
