import { normalizeBaseUrl } from '@/store/instanceStore'

const TIMEOUT_MS = 15000

export type BackendValidationFailure =
    | { ok: false; code: 'invalid_url' }
    | { ok: false; code: 'unreachable' }
    | { ok: false; code: 'invalid_response' }

export type BackendValidationResult = { ok: true; baseUrl: string } | BackendValidationFailure

/** Confirms the URL serves this app’s API via GET /health (zreq-api or legacy zreq-api). */
export async function validatezreqBackend(baseUrlRaw: string): Promise<BackendValidationResult> {
    const baseUrl = normalizeBaseUrl(baseUrlRaw)
    if (!baseUrl) return { ok: false, code: 'invalid_url' }

    const ctrl = new AbortController()
    const tid = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
        const res = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                // Required for ngrok free domains to bypass browser warning interstitial.
                'ngrok-skip-browser-warning': '1',
            },
            signal: ctrl.signal,
        })
        if (!res.ok) return { ok: false, code: 'unreachable' }
        const data: unknown = await res.json().catch(() => null)
        const svc = (data as { service?: unknown }).service
        if (
            data &&
            typeof data === 'object' &&
            (data as { ok?: unknown }).ok === true &&
            (svc === 'zreq-api' || svc === 'zreq-api')
        ) {
            return { ok: true, baseUrl }
        }
        return { ok: false, code: 'invalid_response' }
    } catch {
        return { ok: false, code: 'unreachable' }
    } finally {
        clearTimeout(tid)
    }
}

/** Used by onboarding “Test connection” — same as /health validation */
export async function probeBackendReachable(baseUrl: string): Promise<boolean> {
    const r = await validatezreqBackend(baseUrl)
    return r.ok
}
