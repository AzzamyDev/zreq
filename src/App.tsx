import { useEffect, useState, useCallback, useRef } from 'react'
import { resolveOAuthDeepLinkUrl, resolveOAuthQueryString } from '@/lib/oauth-callback'
import type { Layout } from 'react-resizable-panels'
import './App.css'
import { useAuthStore } from './store/authStore'
import { useInstanceStore } from './store/instanceStore'
import { useAppStore } from './store'
import AuthPage from './components/auth/AuthPage'
import InstanceOnboarding from './components/auth/InstanceOnboarding'
import TopBar from './components/layout/TopBar'
import Sidebar from './components/layout/Sidebar'
import MainPanel from './components/layout/MainPanel'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useSyncStore } from './store/syncStore'
import * as snap from '@/lib/local-replica/snapshot-store'
import {
    ensureReplicaLoaded,
    hydrateFromDiskIfNeeded,
    isRemoteSyncBlocked,
    pullRemoteFull,
    pullThenPush,
} from '@/lib/local-replica/sync-engine'
import AppFooter from '@/components/layout/AppFooter'
import ConflictDialog from '@/components/sync/ConflictDialog'

const SIDEBAR_LAYOUT_KEY = 'postwoman_sidebar_layout'

function readSidebarLayout(): Layout | undefined {
    try {
        const raw = localStorage.getItem(SIDEBAR_LAYOUT_KEY)
        return raw ? (JSON.parse(raw) as Layout) : undefined
    } catch {
        return undefined
    }
}

function AppShell() {
    const user = useAuthStore((s) => s.user)
    const baseUrl = useInstanceStore((s) => s.getActiveBaseUrl())
    const forceOfflineSync = useSyncStore((s) => s.forceOfflineSync)
    const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
    const prevWsRef = useRef<number | null>(null)
    const prevForceOfflineRef = useRef(forceOfflineSync)

    useEffect(() => {
        const onOff = () => useSyncStore.getState().setOnline(navigator.onLine)
        onOff()
        window.addEventListener('online', onOff)
        window.addEventListener('offline', onOff)
        return () => {
            window.removeEventListener('online', onOff)
            window.removeEventListener('offline', onOff)
        }
    }, [])

    useEffect(() => {
        if (!user) return
        const syncIfUnblocked = () => {
            if (isRemoteSyncBlocked()) return
            void pullThenPush()
        }
        const onVisibility = () => {
            if (document.visibilityState === 'visible') syncIfUnblocked()
        }
        const onWinFocus = () => syncIfUnblocked()
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('focus', onWinFocus)
        return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('focus', onWinFocus)
        }
    }, [user?.id])

    useEffect(() => {
        let tid: ReturnType<typeof setInterval>
        const probe = async () => {
            if (!navigator.onLine || useSyncStore.getState().forceOfflineSync) {
                useSyncStore.getState().setInstanceReachable(false)
                return
            }
            const { validatePostwomanBackend } = await import('@/lib/probe-backend')
            const r = await validatePostwomanBackend(baseUrl)
            useSyncStore.getState().setInstanceReachable(r.ok)
            if (r.ok) {
                void pullThenPush()
            }
        }
        void probe()
        tid = setInterval(() => void probe(), 60_000)
        return () => clearInterval(tid)
    }, [baseUrl, forceOfflineSync])

    useEffect(() => {
        if (!user) return
        if (prevForceOfflineRef.current && !forceOfflineSync) {
            void pullThenPush()
        }
        prevForceOfflineRef.current = forceOfflineSync
    }, [forceOfflineSync, user?.id])

    useEffect(() => {
        if (!user) return
        let cancelled = false
        ;(async () => {
            await hydrateFromDiskIfNeeded()
            if (cancelled) return
            if (!isRemoteSyncBlocked()) {
                await pullThenPush()
            }
        })()
        return () => {
            cancelled = true
        }
    }, [user?.id, baseUrl])

    useEffect(() => {
        if (activeWorkspaceId == null) {
            prevWsRef.current = null
            return
        }
        const prev = prevWsRef.current
        prevWsRef.current = activeWorkspaceId
        if (prev == null) {
            void ensureReplicaLoaded().then(() => {
                useAppStore.getState().setCollections(snap.getWorkspaceSlice(activeWorkspaceId))
            })
            return
        }
        if (prev === activeWorkspaceId) return
        const prevStillExists = useAppStore.getState().workspaces.some((w) => w.id === prev)
        if (prevStillExists) {
            snap.setWorkspaceSlice(prev, useAppStore.getState().collections)
        }
        void ensureReplicaLoaded().then(() => {
            useAppStore.getState().setCollections(snap.getWorkspaceSlice(activeWorkspaceId))
            if (!isRemoteSyncBlocked()) void pullRemoteFull()
        })
    }, [activeWorkspaceId])

    const [sidebarDefaultLayout] = useState(readSidebarLayout)
    const onSidebarLayoutChanged = useCallback((layout: Layout) => {
        try {
            localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(layout))
        } catch {
            /* ignore */
        }
    }, [])

    return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
            <TopBar />
            <ConflictDialog />
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <ResizablePanelGroup
                    id="zreq-shell"
                    orientation="horizontal"
                    className="flex min-h-0 flex-1"
                    defaultLayout={sidebarDefaultLayout}
                    onLayoutChanged={onSidebarLayoutChanged}
                >
                    <ResizablePanel id="sidebar" defaultSize="22%" minSize="15%" maxSize="42%">
                        <Sidebar />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel id="main" defaultSize="78%" minSize="58%">
                        <MainPanel />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
            <AppFooter />
        </div>
    )
}

export default function App() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    const instanceOnboardingComplete = useInstanceStore((s) => s.instanceOnboardingComplete)

    useEffect(() => {
        const h = window.location.hash
        if (!h || h === '#') return
        void resolveOAuthQueryString(h.slice(1)).then((done) => {
            if (done) {
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
            }
        })
    }, [])

    useEffect(() => {
        let unlisten: (() => void) | undefined
        ;(async () => {
            const { isTauri } = await import('@tauri-apps/api/core')
            if (!isTauri()) return
            const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
            const initial = await getCurrent()
            if (initial?.length) {
                for (const u of initial) void resolveOAuthDeepLinkUrl(u)
            }
            unlisten = await onOpenUrl((urls) => {
                for (const u of urls) void resolveOAuthDeepLinkUrl(u)
            })
        })()
        return () => {
            unlisten?.()
        }
    }, [])

    if (!instanceOnboardingComplete) return <InstanceOnboarding />
    return isAuthenticated ? <AppShell /> : <AuthPage />
}
