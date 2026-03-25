import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import i18n from '@/i18n/config'
import type {
    Collection,
    Environment,
    Folder,
    RequestItem,
    HttpResponse,
    ActiveRequest,
    ConsoleEntry,
    RequestTab,
    Workspace,
} from '../types'

const ENV_ID_KEY = 'zreq_environment_id'

const readStoredEnvironmentId = (): number | null | undefined => {
    try {
        const raw = localStorage.getItem(ENV_ID_KEY)
        if (raw === null) return undefined
        if (raw === '') return null
        const id = parseInt(raw, 10)
        return Number.isNaN(id) ? undefined : id
    } catch {
        return undefined
    }
}

const writeStoredEnvironmentId = (id: number | null) => {
    try {
        localStorage.setItem(ENV_ID_KEY, id === null ? '' : String(id))
    } catch {
        /* ignore */
    }
}

const SIDEBAR_EXPAND_KEY = 'zreq_sidebar_expand'

const readSidebarExpanded = (): Record<string, boolean> => {
    try {
        const raw = localStorage.getItem(SIDEBAR_EXPAND_KEY)
        if (!raw) return {}
        const p = JSON.parse(raw) as unknown
        if (!p || typeof p !== 'object') return {}
        return p as Record<string, boolean>
    } catch {
        return {}
    }
}

const persistSidebarExpanded = (rec: Record<string, boolean>) => {
    try {
        const plain = JSON.parse(JSON.stringify(rec)) as Record<string, boolean>
        localStorage.setItem(SIDEBAR_EXPAND_KEY, JSON.stringify(plain))
    } catch {
        /* ignore */
    }
}

const walkFolderIds = (items: (Folder | RequestItem)[], collectionId: number, fn: (key: string) => void) => {
    for (const it of items) {
        if (it.type === 'folder') {
            fn(`fld:${collectionId}:${it.id}`)
            if (it.items?.length) walkFolderIds(it.items, collectionId, fn)
        }
    }
}

const defaultRequest: ActiveRequest = {
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    auth: { type: 'none' },
    name: 'Untitled Request',
}

function cloneHttpResponse(r: HttpResponse | null): HttpResponse | null {
    if (!r) return null
    return {
        ...r,
        headers: { ...r.headers },
        cookies: r.cookies ? [...r.cookies] : r.cookies,
    }
}

interface AppState {
    workspaces: Workspace[]
    setWorkspaces: (w: Workspace[]) => void
    addWorkspace: (w: Workspace) => void
    updateWorkspace: (id: number, updates: Partial<Workspace>) => void
    removeWorkspace: (id: number) => void
    activeWorkspaceId: number | null
    setActiveWorkspaceId: (id: number | null) => void

    collections: Collection[]
    setCollections: (c: Collection[]) => void
    addCollection: (col: Collection) => void
    updateCollection: (id: number, updates: Partial<Collection>) => void
    removeCollection: (id: number) => void
    replaceCollection: (oldId: number, col: Collection) => void

    replaceWorkspace: (oldId: number, ws: Workspace) => void
    replaceEnvironment: (oldId: number, env: Environment) => void

    // Request tabs
    tabs: RequestTab[]
    activeTabId: string | null
    addTab: (item?: Partial<ActiveRequest>) => void
    /** @param force when true, discard unsaved. Returns false if dirty and not forced (UI should prompt). */
    closeTab: (id: string, force?: boolean) => boolean
    duplicateTab: (id: string) => void
    closeOtherTabs: (keepId: string, force?: boolean) => boolean
    closeAllTabs: (force?: boolean) => boolean
    setActiveTab: (id: string) => void
    updateTabRequest: (id: string, req: Partial<ActiveRequest>) => void
    markActiveTabClean: () => void

    activeRequest: ActiveRequest
    setActiveRequest: (partial: Partial<ActiveRequest>) => void
    loadRequestItem: (
        item: RequestItem,
        breadcrumbPath?: string[],
        ctx?: { collectionId: number; folderId?: string }
    ) => void
    resetActiveRequest: () => void

    response: HttpResponse | null
    isLoading: boolean
    setResponse: (r: HttpResponse | null) => void
    setLoading: (v: boolean) => void

    environments: Environment[]
    activeEnvironmentId: number | null
    setEnvironments: (e: Environment[]) => void
    addEnvironment: (env: Environment) => void
    updateEnvironment: (id: number, updates: Partial<Environment>) => void
    removeEnvironment: (id: number) => void
    setActiveEnvironmentId: (id: number | null) => void

    selectedItemId: string | null
    setSelectedItemId: (id: string | null) => void

    consoleLogs: ConsoleEntry[]
    addConsoleLog: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) => void
    clearConsoleLogs: () => void

    breadcrumb: string[]
    setBreadcrumb: (path: string[]) => void

    /** `col:{id}` = collection row open; `fld:{collectionId}:{folderId}` = folder open */
    sidebarExpanded: Record<string, boolean>
    setSidebarCollectionExpanded: (collectionId: number, expanded: boolean) => void
    toggleSidebarCollectionExpanded: (collectionId: number) => void
    setSidebarFolderExpanded: (collectionId: number, folderId: string, expanded: boolean) => void
    toggleSidebarFolderExpanded: (collectionId: number, folderId: string) => void
    setAllSidebarFoldersExpanded: (collectionId: number, items: (Folder | RequestItem)[], expanded: boolean) => void

    /** Apply full pull result in one immer tick (avoids workspace/collections UI mismatch). */
    applyRemotePullBundle: (p: {
        workspaces: Workspace[]
        activeWorkspaceId: number
        collections: Collection[]
        environments: Environment[]
    }) => void

    /** Clear server-backed state when switching backend instance */
    resetRemoteSessionState: () => void
}

export const useAppStore = create<AppState>()(
    immer((set, get) => ({
        workspaces: [],
        setWorkspaces: (w) =>
            set((s) => {
                s.workspaces = w
            }),
        addWorkspace: (w) =>
            set((s) => {
                s.workspaces.push(w)
            }),
        updateWorkspace: (id, updates) =>
            set((s) => {
                const idx = s.workspaces.findIndex((x) => x.id === id)
                if (idx !== -1) Object.assign(s.workspaces[idx], updates)
            }),
        removeWorkspace: (id) =>
            set((s) => {
                s.workspaces = s.workspaces.filter((x) => x.id !== id)
            }),
        activeWorkspaceId: null,
        setActiveWorkspaceId: (id) =>
            set((s) => {
                s.activeWorkspaceId = id
                if (id != null) {
                    try {
                        localStorage.setItem('zreq_workspace_id', String(id))
                    } catch {
                        /* ignore */
                    }
                }
            }),

        collections: [],
        setCollections: (c) =>
            set((s) => {
                s.collections = c
            }),
        addCollection: (col) =>
            set((s) => {
                s.collections.push(col)
            }),
        updateCollection: (id, updates) =>
            set((s) => {
                const idx = s.collections.findIndex((c) => c.id === id)
                if (idx !== -1) Object.assign(s.collections[idx], updates)
            }),
        removeCollection: (id) =>
            set((s) => {
                s.collections = s.collections.filter((c) => c.id !== id)
                delete s.sidebarExpanded[`col:${id}`]
                for (const k of Object.keys(s.sidebarExpanded)) {
                    if (k.startsWith(`fld:${id}:`)) delete s.sidebarExpanded[k]
                }
                persistSidebarExpanded(s.sidebarExpanded)
            }),

        replaceCollection: (oldId, col) =>
            set((s) => {
                const idx = s.collections.findIndex((c) => c.id === oldId)
                if (idx === -1) return
                const next = { ...s.sidebarExpanded } as Record<string, boolean>
                const ckOld = `col:${oldId}`
                const ckNew = `col:${col.id}`
                if (next[ckOld] !== undefined) {
                    next[ckNew] = next[ckOld]
                    delete next[ckOld]
                }
                const fldOld = `fld:${oldId}:`
                const fldNew = `fld:${col.id}:`
                for (const k of Object.keys(next)) {
                    if (k.startsWith(fldOld)) {
                        const rest = k.slice(fldOld.length)
                        next[`${fldNew}${rest}`] = next[k]
                        delete next[k]
                    }
                }
                s.sidebarExpanded = next
                persistSidebarExpanded(next)
                s.collections[idx] = col
            }),

        replaceWorkspace: (oldId, ws) =>
            set((s) => {
                const idx = s.workspaces.findIndex((w) => w.id === oldId)
                if (idx === -1) return
                s.workspaces[idx] = ws
                if (s.activeWorkspaceId === oldId) s.activeWorkspaceId = ws.id
                try {
                    localStorage.setItem('zreq_workspace_id', String(ws.id))
                } catch {
                    /* ignore */
                }
            }),

        replaceEnvironment: (oldId, env) =>
            set((s) => {
                const idx = s.environments.findIndex((e) => e.id === oldId)
                if (idx === -1) return
                s.environments[idx] = env
                if (s.activeEnvironmentId === oldId) {
                    s.activeEnvironmentId = env.id
                    writeStoredEnvironmentId(env.id)
                }
            }),

        tabs: [
            {
                id: 'default',
                name: 'New Request',
                method: 'GET',
                isDirty: false,
                request: { ...defaultRequest },
                response: null,
            },
        ],
        activeTabId: 'default',

        addTab: (item) =>
            set((s) => {
                const id = nanoid()
                const req = item ? { ...defaultRequest, ...item } : { ...defaultRequest }
                const cur = s.tabs.find((t) => t.id === s.activeTabId)
                if (cur) {
                    cur.request = { ...s.activeRequest }
                    cur.response = cloneHttpResponse(s.response)
                }
                s.tabs.push({
                    id,
                    name: req.name || 'New Request',
                    method: req.method || 'GET',
                    isDirty: false,
                    request: req,
                    response: null,
                })
                s.activeTabId = id
                s.activeRequest = req
                s.response = null
                s.isLoading = false
            }),

        closeTab: (id, force = false) => {
            const tab = get().tabs.find((t) => t.id === id)
            if (!tab) return false
            if (tab.isDirty && !force) return false
            set((s) => {
                s.tabs = s.tabs.filter((t) => t.id !== id)
                if (s.tabs.length === 0) {
                    s.activeTabId = null
                    s.activeRequest = { ...defaultRequest }
                    s.selectedItemId = null
                    s.breadcrumb = []
                    s.response = null
                    s.isLoading = false
                    return
                }
                if (s.activeTabId === id) {
                    const next = s.tabs[s.tabs.length - 1]
                    s.activeTabId = next.id
                    s.activeRequest = { ...next.request }
                    s.response = cloneHttpResponse(next.response)
                }
            })
            return true
        },

        duplicateTab: (id) =>
            set((s) => {
                const src = s.tabs.find((t) => t.id === id)
                if (!src) return
                const cur = s.tabs.find((t) => t.id === s.activeTabId)
                if (cur) {
                    cur.request = { ...s.activeRequest }
                    cur.response = cloneHttpResponse(s.response)
                }
                const newId = nanoid()
                const req = structuredClone(src.request) as ActiveRequest
                const copySuffix = i18n.t('requestTab.duplicateCopySuffix')
                const baseName = src.name.trimEnd()
                req.name = `${baseName}${copySuffix}`
                s.tabs.push({
                    id: newId,
                    name: req.name,
                    method: req.method || 'GET',
                    isDirty: true,
                    request: req,
                    response: cloneHttpResponse(src.response),
                })
                s.activeTabId = newId
                s.activeRequest = req
                s.response = cloneHttpResponse(src.response)
                s.isLoading = false
            }),

        closeOtherTabs: (keepId, force = false) => {
            const { tabs } = get()
            const toClose = tabs.filter((t) => t.id !== keepId)
            if (toClose.length === 0) return true
            if (!force && toClose.some((t) => t.isDirty)) return false
            set((s) => {
                const cur = s.tabs.find((t) => t.id === s.activeTabId)
                if (cur) {
                    cur.request = { ...s.activeRequest }
                    cur.response = cloneHttpResponse(s.response)
                }
                const kept = s.tabs.find((t) => t.id === keepId)
                if (!kept) return
                s.tabs = [kept]
                s.activeTabId = keepId
                s.activeRequest = { ...kept.request }
                s.response = cloneHttpResponse(kept.response)
                s.isLoading = false
            })
            return true
        },

        closeAllTabs: (force = false) => {
            const { tabs } = get()
            if (tabs.length === 0) return true
            if (!force && tabs.some((t) => t.isDirty)) return false
            set((s) => {
                s.tabs = []
                s.activeTabId = null
                s.activeRequest = { ...defaultRequest }
                s.selectedItemId = null
                s.breadcrumb = []
                s.response = null
                s.isLoading = false
            })
            return true
        },

        setActiveTab: (id) =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === id)
                if (!tab) return
                const currentTab = s.tabs.find((t) => t.id === s.activeTabId)
                if (currentTab) {
                    currentTab.request = { ...s.activeRequest }
                    currentTab.response = cloneHttpResponse(s.response)
                }
                s.activeTabId = id
                s.activeRequest = { ...tab.request }
                s.response = cloneHttpResponse(tab.response)
            }),

        updateTabRequest: (id, req) =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === id)
                if (!tab) return
                Object.assign(tab.request, req)
                if (req.name) tab.name = req.name
                if (req.method) tab.method = req.method
                tab.isDirty = true
            }),

        markActiveTabClean: () =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === s.activeTabId)
                if (tab) tab.isDirty = false
            }),

        activeRequest: { ...defaultRequest },
        setActiveRequest: (partial) =>
            set((s) => {
                Object.assign(s.activeRequest, partial)
                // Sync to active tab
                const tab = s.tabs.find((t) => t.id === s.activeTabId)
                if (tab) {
                    Object.assign(tab.request, partial)
                    if (partial.method) tab.method = partial.method
                    if (partial.name) tab.name = partial.name
                    tab.isDirty = true
                }
            }),
        loadRequestItem: (item, breadcrumbPath?, ctx?) =>
            set((s) => {
                const colId = ctx?.collectionId
                const folderKey = ctx?.folderId ?? undefined
                if (colId != null && item.id) {
                    const dup = s.tabs.find(
                        (t) =>
                            t.request.itemId === item.id &&
                            t.request.collectionId === colId &&
                            (t.request.folderId ?? undefined) === folderKey
                    )
                    if (dup) {
                        const cur = s.tabs.find((t) => t.id === s.activeTabId)
                        if (cur) {
                            cur.request = { ...s.activeRequest }
                            cur.response = cloneHttpResponse(s.response)
                        }
                        s.activeTabId = dup.id
                        s.activeRequest = { ...dup.request }
                        s.response = cloneHttpResponse(dup.response)
                        s.isLoading = false
                        s.selectedItemId = item.id
                        if (breadcrumbPath) s.breadcrumb = breadcrumbPath
                        return
                    }
                }

                const req: ActiveRequest = {
                    method: item.method || 'GET',
                    url: item.url || '',
                    headers: Array.isArray(item.headers) ? item.headers : [],
                    params: Array.isArray(item.params) ? item.params : [],
                    body: item.body || { type: 'none', content: '' },
                    auth:
                        item.auth ??
                        (ctx?.folderId ? { type: 'inherit' } : { type: 'none' }),
                    name: item.name || 'Untitled Request',
                    itemId: item.id,
                    scripts: item.scripts,
                    collectionId: ctx?.collectionId,
                    folderId: ctx?.folderId,
                }
                const cur = s.tabs.find((t) => t.id === s.activeTabId)
                if (cur) {
                    cur.request = { ...s.activeRequest }
                    cur.response = cloneHttpResponse(s.response)
                }
                const id = nanoid()
                s.tabs.push({
                    id,
                    name: item.name || 'Untitled Request',
                    method: item.method || 'GET',
                    isDirty: false,
                    request: req,
                    response: null,
                })
                s.activeTabId = id
                s.activeRequest = req
                s.response = null
                s.isLoading = false
                s.selectedItemId = item.id
                if (breadcrumbPath) s.breadcrumb = breadcrumbPath
            }),
        resetActiveRequest: () =>
            set((s) => {
                s.activeRequest = { ...defaultRequest }
                s.selectedItemId = null
                s.response = null
                s.breadcrumb = []
                // Also reset the active tab
                const tab = s.tabs.find((t) => t.id === s.activeTabId)
                if (tab) {
                    tab.request = { ...defaultRequest }
                    tab.name = 'New Request'
                    tab.method = 'GET'
                    tab.isDirty = false
                    tab.response = null
                }
            }),

        response: null,
        isLoading: false,
        setResponse: (r) =>
            set((s) => {
                const next = cloneHttpResponse(r)
                s.response = next
                const tab = s.tabs.find((t) => t.id === s.activeTabId)
                if (tab) tab.response = cloneHttpResponse(next)
            }),
        setLoading: (v) =>
            set((s) => {
                s.isLoading = v
            }),

        environments: [],
        activeEnvironmentId: null,
        setEnvironments: (e) =>
            set((s) => {
                s.environments = e
                const stored = readStoredEnvironmentId()
                if (stored === undefined) return
                if (stored === null) {
                    s.activeEnvironmentId = null
                    return
                }
                if (e.some((env) => env.id === stored)) s.activeEnvironmentId = stored
                else {
                    s.activeEnvironmentId = null
                    writeStoredEnvironmentId(null)
                }
            }),
        addEnvironment: (env) =>
            set((s) => {
                s.environments.push(env)
            }),
        updateEnvironment: (id, updates) =>
            set((s) => {
                const idx = s.environments.findIndex((e) => e.id === id)
                if (idx !== -1) Object.assign(s.environments[idx], updates)
            }),
        removeEnvironment: (id) =>
            set((s) => {
                s.environments = s.environments.filter((e) => e.id !== id)
                if (s.activeEnvironmentId === id) {
                    s.activeEnvironmentId = null
                    writeStoredEnvironmentId(null)
                }
            }),
        setActiveEnvironmentId: (id) =>
            set((s) => {
                s.activeEnvironmentId = id
                writeStoredEnvironmentId(id)
            }),

        selectedItemId: null,
        setSelectedItemId: (id) =>
            set((s) => {
                s.selectedItemId = id
            }),

        consoleLogs: [],
        addConsoleLog: (entry) =>
            set((s) => {
                s.consoleLogs.push({ ...entry, id: nanoid(), timestamp: Date.now() })
            }),
        clearConsoleLogs: () =>
            set((s) => {
                s.consoleLogs = []
            }),

        breadcrumb: [],
        setBreadcrumb: (path) =>
            set((s) => {
                s.breadcrumb = path
            }),

        sidebarExpanded: readSidebarExpanded(),
        setSidebarCollectionExpanded: (collectionId, expanded) =>
            set((s) => {
                s.sidebarExpanded[`col:${collectionId}`] = expanded
                persistSidebarExpanded(s.sidebarExpanded)
            }),
        toggleSidebarCollectionExpanded: (collectionId) =>
            set((s) => {
                const k = `col:${collectionId}`
                const cur = s.sidebarExpanded[k] ?? true
                s.sidebarExpanded[k] = !cur
                persistSidebarExpanded(s.sidebarExpanded)
            }),
        setSidebarFolderExpanded: (collectionId, folderId, expanded) =>
            set((s) => {
                s.sidebarExpanded[`fld:${collectionId}:${folderId}`] = expanded
                persistSidebarExpanded(s.sidebarExpanded)
            }),
        toggleSidebarFolderExpanded: (collectionId, folderId) =>
            set((s) => {
                const k = `fld:${collectionId}:${folderId}`
                const cur = s.sidebarExpanded[k] ?? false
                s.sidebarExpanded[k] = !cur
                persistSidebarExpanded(s.sidebarExpanded)
            }),
        setAllSidebarFoldersExpanded: (collectionId, items, expanded) =>
            set((s) => {
                walkFolderIds(items, collectionId, (key) => {
                    s.sidebarExpanded[key] = expanded
                })
                persistSidebarExpanded(s.sidebarExpanded)
            }),

        applyRemotePullBundle: (p) =>
            set((s) => {
                s.workspaces = p.workspaces
                s.activeWorkspaceId = p.activeWorkspaceId
                s.collections = p.collections
                s.environments = p.environments
                if (s.activeEnvironmentId != null && !p.environments.some((e) => e.id === s.activeEnvironmentId)) {
                    s.activeEnvironmentId = null
                    writeStoredEnvironmentId(null)
                }
                try {
                    localStorage.setItem('zreq_workspace_id', String(p.activeWorkspaceId))
                } catch {
                    /* ignore */
                }
            }),

        resetRemoteSessionState: () =>
            set((s) => {
                try {
                    localStorage.removeItem('zreq_workspace_id')
                } catch {
                    /* ignore */
                }
                writeStoredEnvironmentId(null)
                s.workspaces = []
                s.activeWorkspaceId = null
                s.collections = []
                s.environments = []
                s.activeEnvironmentId = null
                s.selectedItemId = null
                s.response = null
                s.isLoading = false
                s.breadcrumb = []
                s.consoleLogs = []
                s.tabs = [
                    {
                        id: 'default',
                        name: 'New Request',
                        method: 'GET',
                        isDirty: false,
                        request: { ...defaultRequest },
                        response: null,
                    },
                ]
                s.activeTabId = 'default'
                s.activeRequest = { ...defaultRequest }
                s.sidebarExpanded = {}
                persistSidebarExpanded(s.sidebarExpanded)
            }),
    }))
)
