import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type BackendInstance = { id: string; name: string; baseUrl: string }

const STORAGE_KEY = 'postwoman_instances'

const DEFAULT_FALLBACK = 'http://localhost:3001'

export function normalizeBaseUrl(raw: string): string | null {
    const t = raw.trim()
    if (!t) return null
    const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(t)
    const lower = t.toLowerCase()
    const defaultScheme =
        !hasScheme && (lower.startsWith('localhost') || lower.startsWith('127.0.0.1')) ? 'http' : 'https'
    let u: URL
    try {
        u = new URL(hasScheme ? t : `${defaultScheme}://${t}`)
    } catch {
        return null
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')
    return `${u.origin}${path}`
}

type PersistedShape = {
    instances: BackendInstance[]
    activeInstanceId: string | null
    instanceOnboardingComplete: boolean
}

function persist(shape: PersistedShape) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shape))
    } catch {
        /* ignore */
    }
}

function defaultInstancesFromEnv(): PersistedShape {
    const raw = (import.meta.env.VITE_API_URL as string | undefined) || DEFAULT_FALLBACK
    const baseUrl = normalizeBaseUrl(raw) || DEFAULT_FALLBACK
    const id = nanoid()
    return {
        instances: [{ id, name: 'Local', baseUrl }],
        activeInstanceId: id,
        instanceOnboardingComplete: true,
    }
}

function loadPersisted(): PersistedShape {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return {
                instances: [],
                activeInstanceId: null,
                instanceOnboardingComplete: false,
            }
        }
        const p = JSON.parse(raw) as {
            instances?: unknown
            activeInstanceId?: unknown
            instanceOnboardingComplete?: unknown
        }
        if (!Array.isArray(p.instances)) {
            return {
                instances: [],
                activeInstanceId: null,
                instanceOnboardingComplete: false,
            }
        }
        const instances = p.instances.map((i) => ({
            id: String((i as BackendInstance).id),
            name: String((i as BackendInstance).name ?? ''),
            baseUrl: normalizeBaseUrl(String((i as BackendInstance).baseUrl ?? '')) || DEFAULT_FALLBACK,
        }))
        if (instances.length === 0) {
            return {
                instances: [],
                activeInstanceId: null,
                instanceOnboardingComplete: p.instanceOnboardingComplete === true,
            }
        }
        const active =
            p.activeInstanceId && instances.some((x) => x.id === p.activeInstanceId)
                ? String(p.activeInstanceId)
                : instances[0].id
        const instanceOnboardingComplete =
            instances.length > 0
                ? p.instanceOnboardingComplete !== false
                : Boolean(p.instanceOnboardingComplete)
        return { instances, activeInstanceId: active, instanceOnboardingComplete }
    } catch {
        return {
            instances: [],
            activeInstanceId: null,
            instanceOnboardingComplete: false,
        }
    }
}

const initial = loadPersisted()
persist(initial)

interface InstanceState extends PersistedShape {
    getActiveBaseUrl: () => string
    setActiveInstanceId: (id: string) => void
    addInstance: (name: string, baseUrlRaw: string) => { ok: true; id: string } | { ok: false }
    updateInstance: (id: string, name: string, baseUrlRaw: string) => { ok: true } | { ok: false }
    removeInstance: (id: string) => { ok: true; deletedActive: boolean } | { ok: false; reason: 'last' | 'missing' }
    completeInstanceOnboarding: (name: string, baseUrlRaw: string) => { ok: true } | { ok: false }
    skipInstanceOnboardingWithDefaults: () => void
    returnToInstanceOnboarding: () => void
}

export const useInstanceStore = create<InstanceState>()((set, get) => ({
    instances: initial.instances,
    activeInstanceId: initial.activeInstanceId,
    instanceOnboardingComplete: initial.instanceOnboardingComplete,

    getActiveBaseUrl: () => {
        const { instances, activeInstanceId } = get()
        const a = instances.find((i) => i.id === activeInstanceId)
        return (
            a?.baseUrl ??
            normalizeBaseUrl((import.meta.env.VITE_API_URL as string) || '') ??
            DEFAULT_FALLBACK
        )
    },

    setActiveInstanceId: (id) => {
        const { instances, instanceOnboardingComplete } = get()
        if (!instances.some((i) => i.id === id)) return
        set({ activeInstanceId: id })
        persist({ instances, activeInstanceId: id, instanceOnboardingComplete })
    },

    addInstance: (name, baseUrlRaw) => {
        const n = normalizeBaseUrl(baseUrlRaw)
        if (!n) return { ok: false as const }
        const label = name.trim() || n
        const id = nanoid()
        const { instances, activeInstanceId, instanceOnboardingComplete } = get()
        const next = [...instances, { id, name: label, baseUrl: n }]
        set({ instances: next })
        persist({ instances: next, activeInstanceId, instanceOnboardingComplete })
        return { ok: true as const, id }
    },

    updateInstance: (id, name, baseUrlRaw) => {
        const n = normalizeBaseUrl(baseUrlRaw)
        if (!n) return { ok: false as const }
        const label = name.trim() || n
        const { instances, activeInstanceId, instanceOnboardingComplete } = get()
        const next = instances.map((i) => (i.id === id ? { ...i, name: label, baseUrl: n } : i))
        if (!next.some((i) => i.id === id)) return { ok: false as const }
        set({ instances: next })
        persist({ instances: next, activeInstanceId, instanceOnboardingComplete })
        return { ok: true as const }
    },

    removeInstance: (id) => {
        const { instances, activeInstanceId, instanceOnboardingComplete } = get()
        if (instances.length <= 1) return { ok: false as const, reason: 'last' as const }
        if (!instances.some((i) => i.id === id)) return { ok: false as const, reason: 'missing' as const }
        const next = instances.filter((i) => i.id !== id)
        let nextActive = activeInstanceId
        if (activeInstanceId === id) nextActive = next[0]?.id ?? null
        set({ instances: next, activeInstanceId: nextActive })
        persist({ instances: next, activeInstanceId: nextActive, instanceOnboardingComplete })
        return { ok: true as const, deletedActive: activeInstanceId === id }
    },

    completeInstanceOnboarding: (name, baseUrlRaw) => {
        const n = normalizeBaseUrl(baseUrlRaw)
        if (!n) return { ok: false as const }
        const { instances, activeInstanceId } = get()
        const label = name.trim() || n

        if (instances.length > 0) {
            const aid =
                activeInstanceId && instances.some((i) => i.id === activeInstanceId)
                    ? activeInstanceId
                    : instances[0].id
            const next = instances.map((i) => (i.id === aid ? { ...i, name: label, baseUrl: n } : i))
            set({
                instances: next,
                activeInstanceId: aid,
                instanceOnboardingComplete: true,
            })
            persist({
                instances: next,
                activeInstanceId: aid,
                instanceOnboardingComplete: true,
            })
            return { ok: true as const }
        }

        const id = nanoid()
        const next = [{ id, name: label, baseUrl: n }]
        set({
            instances: next,
            activeInstanceId: id,
            instanceOnboardingComplete: true,
        })
        persist({
            instances: next,
            activeInstanceId: id,
            instanceOnboardingComplete: true,
        })
        return { ok: true as const }
    },

    skipInstanceOnboardingWithDefaults: () => {
        const d = defaultInstancesFromEnv()
        set({
            instances: d.instances,
            activeInstanceId: d.activeInstanceId,
            instanceOnboardingComplete: true,
        })
        persist(d)
    },

    returnToInstanceOnboarding: () => {
        const { instances, activeInstanceId } = get()
        set({ instanceOnboardingComplete: false })
        persist({ instances, activeInstanceId, instanceOnboardingComplete: false })
    },
}))
