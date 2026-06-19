import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../store'
import { resolveRequest, getActiveEnvVars } from '../lib/env-resolver'
import { writeEnvironmentPatch } from '@/lib/local-replica/local-write'

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

export function useRequest() {
    const { activeRequest, setResponse, setLoading } = useAppStore()

    const sendRequest = async () => {
        setLoading(true)
        try {
            const vars = getActiveEnvVars()
            const resolved = resolveRequest(activeRequest, vars)

            const { addConsoleLog } = useAppStore.getState()

            // Build pm API for scripts
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
                        // Shallow array copy still references Immer-frozen row objects — clone each row.
                        const envVars = prev.some((v) => v.key === key)
                            ? prev.map((v) => (v.key === key ? { ...v, value: str } : { ...v }))
                            : [...prev.map((v) => ({ ...v })), { key, value: str, enabled: true }]
                        updateEnvironment(activeEnvironmentId, { variables: envVars })
                        persistEnvironmentVariables(activeEnvironmentId, envVars)
                    },
                },
                request: { url: resolved.url, method: resolved.method, headers: resolved.headers },
                response: null as any,
                console: {
                    log: (...args: any[]) => addConsoleLog({ level: 'log', source: 'script', message: args.map(String).join(' ') }),
                    warn: (...args: any[]) => addConsoleLog({ level: 'warn', source: 'script', message: args.map(String).join(' ') }),
                    error: (...args: any[]) => addConsoleLog({ level: 'error', source: 'script', message: args.map(String).join(' ') }),
                    info: (...args: any[]) => addConsoleLog({ level: 'info', source: 'script', message: args.map(String).join(' ') }),
                }
            }

            // Run pre-request script
            const preScript = activeRequest.scripts?.preRequest
            if (preScript?.trim()) {
                try {
                    new Function('pm', preScript)(pmAPI)
                } catch (err: any) {
                    addConsoleLog({ level: 'error', source: 'script', message: `Pre-request error: ${err.message}` })
                }
            }

            // Log outgoing request
            addConsoleLog({ level: 'info', source: 'request', message: `→ ${resolved.method} ${resolved.url}` })

            const response = await invoke<{
                status: number
                status_text: string
                headers: Record<string, string>
                set_cookies?: string[]
                body: string
                duration_ms: number
                size_bytes: number
            }>('send_request', { payload: resolved })

            // Map snake_case Rust response to camelCase HttpResponse
            const mappedResponse = {
                status: response.status,
                statusText: response.status_text,
                headers: response.headers,
                cookies: response.set_cookies ?? [],
                body: response.body,
                durationMs: response.duration_ms,
                sizeBytes: response.size_bytes,
            }

            setResponse(mappedResponse)

            // Set response on pmAPI for post-response script
            pmAPI.response = {
                status: mappedResponse.status,
                statusText: mappedResponse.statusText,
                body: mappedResponse.body,
                headers: mappedResponse.headers,
                text: () => mappedResponse.body ?? '',
                json: () => {
                    try {
                        const raw = mappedResponse.body?.trim() ?? ''
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

            // Run post-response script
            const postScript = activeRequest.scripts?.postResponse
            if (postScript?.trim()) {
                try {
                    new Function('pm', postScript)(pmAPI)
                } catch (err: any) {
                    addConsoleLog({ level: 'error', source: 'script', message: `Post-response error: ${err.message}` })
                }
            }

            // Log incoming response
            addConsoleLog({
                level: 'info',
                source: 'response',
                message: `← ${mappedResponse.status} ${mappedResponse.statusText ?? ''} (${mappedResponse.durationMs ?? 0}ms)`
            })
        } catch (err: unknown) {
            const { addConsoleLog } = useAppStore.getState()
            setResponse({
                status: 0,
                statusText: 'Error',
                headers: {},
                cookies: [],
                body: String(err),
                durationMs: 0,
                sizeBytes: 0,
            })
            addConsoleLog({ level: 'error', source: 'response', message: `Request failed: ${String(err)}` })
        } finally {
            setLoading(false)
        }
    }

    return { sendRequest }
}
