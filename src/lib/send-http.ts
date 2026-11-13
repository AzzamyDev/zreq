import { invoke } from '@tauri-apps/api/core'
import type { ActiveRequest, HttpResponse } from '../types'
import { getActiveEnvVars, resolveRequest } from './env-resolver'
import { recordSentRequest } from './request-history'
import { evaluateChecks, readChecks, type CheckVerdict } from './request-checks'
import { writeEnvironmentPatch } from '@/lib/local-replica/local-write'
import { useAppStore } from '../store'

function envValueToString(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function persistEnvironmentVariables(envId: number, variables: { key: string; value: string; enabled: boolean }[]) {
    const payload = variables.map((v) => ({
        key: v.key,
        value: v.value,
        enabled: v.enabled ?? true,
    }))
    void writeEnvironmentPatch(envId, { variables: payload }).catch((err: unknown) => {
        const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : String(err)
        useAppStore.getState().addConsoleLog({
            level: 'error',
            source: 'script',
            message: `pm.environment.set: failed to save — ${msg}`,
        })
    })
}

export type HttpSendResult = {
    response: HttpResponse
    checks: CheckVerdict[]
}

/** Send one saved or open HTTP request, including its scripts and tests. */
export async function sendHttpRequest(activeRequest: ActiveRequest): Promise<HttpSendResult> {
    const vars = getActiveEnvVars()
    const resolved = resolveRequest(activeRequest, vars)
    const { addConsoleLog } = useAppStore.getState()

    const pmAPI = {
        environment: {
            get: (key: string) => getActiveEnvVars()[key] ?? '',
            set: (key: string, value: unknown) => {
                const { environments, activeEnvironmentId, updateEnvironment } = useAppStore.getState()
                if (activeEnvironmentId == null) {
                    addConsoleLog({
                        level: 'warn',
                        source: 'script',
                        message:
                            'pm.environment.set: no active environment — pick one in the environment selector so variables can be saved.',
                    })
                    return
                }
                const env = environments.find((e) => e.id === activeEnvironmentId)
                if (!env) {
                    addConsoleLog({
                        level: 'warn',
                        source: 'script',
                        message: 'pm.environment.set: active environment not found in list.',
                    })
                    return
                }
                const str = envValueToString(value)
                const prev = env.variables ?? []
                const envVars = prev.some((v) => v.key === key)
                    ? prev.map((v) => (v.key === key ? { ...v, value: str } : { ...v }))
                    : [...prev.map((v) => ({ ...v })), { key, value: str, enabled: true }]
                updateEnvironment(activeEnvironmentId, { variables: envVars })
                persistEnvironmentVariables(activeEnvironmentId, envVars)
            },
        },
        request: { url: resolved.url, method: resolved.method, headers: resolved.headers },
        response: null as {
            status: number
            statusText: string
            body: string
            headers: Record<string, string>
            text: () => string
            json: () => unknown
        } | null,
        console: {
            log: (...args: unknown[]) => addConsoleLog({ level: 'log', source: 'script', message: args.map(String).join(' ') }),
            warn: (...args: unknown[]) => addConsoleLog({ level: 'warn', source: 'script', message: args.map(String).join(' ') }),
            error: (...args: unknown[]) => addConsoleLog({ level: 'error', source: 'script', message: args.map(String).join(' ') }),
            info: (...args: unknown[]) => addConsoleLog({ level: 'info', source: 'script', message: args.map(String).join(' ') }),
        },
    }

    const preScript = activeRequest.scripts?.preRequest
    if (preScript?.trim()) {
        try {
            new Function('pm', preScript)(pmAPI)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            addConsoleLog({ level: 'error', source: 'script', message: `Pre-request error: ${message}` })
        }
    }

    addConsoleLog({ level: 'info', source: 'request', message: `→ ${resolved.method} ${resolved.url}` })

    let mapped: HttpResponse
    try {
        const response = await invoke<{
            status: number
            status_text: string
            headers: Record<string, string>
            set_cookies?: string[]
            body: string
            duration_ms: number
            size_bytes: number
        }>('send_request', { payload: resolved })
        mapped = {
            status: response.status,
            statusText: response.status_text,
            headers: response.headers,
            cookies: response.set_cookies ?? [],
            body: response.body,
            durationMs: response.duration_ms,
            sizeBytes: response.size_bytes,
        }
    } catch (err: unknown) {
        mapped = {
            status: 0,
            statusText: 'Error',
            headers: {},
            cookies: [],
            body: String(err),
            durationMs: 0,
            sizeBytes: 0,
        }
        addConsoleLog({ level: 'error', source: 'response', message: `Request failed: ${String(err)}` })
    }

    recordSentRequest(useAppStore.getState().activeWorkspaceId, {
        name: activeRequest.name,
        method: activeRequest.method,
        url: activeRequest.url,
        headers: activeRequest.headers,
        params: activeRequest.params,
        body: activeRequest.body,
        auth: activeRequest.auth,
        scripts: activeRequest.scripts,
        status: mapped.status,
        statusText: mapped.statusText,
        durationMs: mapped.durationMs,
    })

    if (mapped.status !== 0) {
        pmAPI.response = {
            status: mapped.status,
            statusText: mapped.statusText,
            body: mapped.body,
            headers: mapped.headers,
            text: () => mapped.body ?? '',
            json: () => {
                try {
                    const raw = mapped.body?.trim() ?? ''
                    if (!raw) return null
                    return JSON.parse(raw) as unknown
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e)
                    addConsoleLog({
                        level: 'warn',
                        source: 'script',
                        message: `pm.response.json() failed — ${msg}`,
                    })
                    return null
                }
            },
        }
        const postScript = activeRequest.scripts?.postResponse
        if (postScript?.trim()) {
            try {
                new Function('pm', postScript)(pmAPI)
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                addConsoleLog({ level: 'error', source: 'script', message: `Post-response error: ${message}` })
            }
        }
        addConsoleLog({
            level: 'info',
            source: 'response',
            message: `← ${mapped.status} ${mapped.statusText ?? ''} (${mapped.durationMs ?? 0}ms)`,
        })
    }

    const checks = evaluateChecks(readChecks(activeRequest.scripts?.checks), mapped)
    const failed = checks.filter((check) => !check.pass).length
    if (checks.length > 0) {
        addConsoleLog({
            level: failed > 0 ? 'error' : 'info',
            source: 'response',
            message: `${activeRequest.name}: ${checks.length - failed} passed, ${failed} failed`,
        })
    }

    return { response: mapped, checks }
}
