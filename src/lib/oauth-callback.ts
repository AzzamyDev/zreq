import axios from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useInstanceStore } from '@/store/instanceStore'

type AuthUser = { id: number; name: string; email: string; hasPassword?: boolean }

/** One HTTP exchange per bridge code — React Strict Mode runs effects twice; bridge is single-use on server. */
const bridgeInflight = new Map<string, Promise<void>>()

async function exchangeOAuthBridge(code: string, apiBase: string): Promise<void> {
    const base = apiBase.replace(/\/$/, '')
    const key = `${base}\u0000${code}`
    const existing = bridgeInflight.get(key)
    if (existing) return existing

    const run = (async () => {
        try {
            const { data } = await axios.get<{
                message?: string | string[]
                data?: { access_token: string; user: AuthUser }
            }>(`${base}/auth/oauth-bridge`, {
                params: { code },
                headers: { 'ngrok-skip-browser-warning': '69420' },
            })
            if (data?.data?.access_token && data?.data?.user) {
                useAuthStore.getState().setAuth(data.data.access_token, data.data.user)
                return
            }
            const m = data?.message
            toast.error(Array.isArray(m) ? m.join(', ') : m || 'Could not complete sign-in')
        } catch (e: unknown) {
            if (axios.isAxiosError(e)) {
                const m = e.response?.data?.message
                toast.error(Array.isArray(m) ? m.join(', ') : m || 'Could not complete sign-in')
            } else {
                toast.error('Could not complete sign-in')
            }
        } finally {
            bridgeInflight.delete(key)
        }
    })()

    bridgeInflight.set(key, run)
    return run
}

/**
 * Hash fragment or query string: oauth_error | code+api (bridge) | legacy access_token+user.
 */
export async function resolveOAuthQueryString(raw: string): Promise<boolean> {
    if (!raw) return false
    const normalized = raw.startsWith('#') ? raw.slice(1) : raw
    const params = new URLSearchParams(normalized)
    const err = params.get('oauth_error')
    if (err) {
        toast.error(err)
        return true
    }
    const code = params.get('code')
    if (code) {
        const api = params.get('api')?.trim() || useInstanceStore.getState().getActiveBaseUrl()
        await exchangeOAuthBridge(code, api)
        return true
    }
    const token = params.get('access_token')
    const userJson = params.get('user')
    if (!token || !userJson) return false
    try {
        const user = JSON.parse(userJson) as AuthUser
        useAuthStore.getState().setAuth(token, user)
        return true
    } catch {
        toast.error('Could not complete sign-in')
        return true
    }
}

export async function resolveOAuthDeepLinkUrl(url: string): Promise<boolean> {
    const run = async (q: string) => (q ? resolveOAuthQueryString(q) : false)
    try {
        const parsed = new URL(url)
        if (parsed.search && parsed.search.length > 1) {
            if (await run(parsed.search.slice(1))) return true
        }
    } catch {
        /* custom schemes */
    }
    const q = url.indexOf('?')
    const h = url.indexOf('#')
    if (q >= 0 && (h < 0 || q < h)) {
        const end = h >= 0 ? h : url.length
        if (await run(url.slice(q + 1, end))) return true
    }
    if (h >= 0) return resolveOAuthQueryString(url.slice(h + 1))
    return false
}
