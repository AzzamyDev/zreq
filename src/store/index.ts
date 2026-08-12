import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import i18n from '@/i18n/config'
import type {
    Collection,
    Environment,
    Folder,
    RequestItem,
    SavedResponse,
    HttpResponse,
    ActiveRequest,
    ConsoleEntry,
    RequestTab,
    Workspace,
    WsConnectionState,
    WsFrame,
    WsHandshake,
    RequestProtocol,
} from '../types'
import { invoke } from '@tauri-apps/api/core'
import { withNormalizedQuery } from '../lib/query-params'
import { inferProtocolFromUrl } from '../lib/persist-request'
import { rangeSelectIds, type SidebarSelection } from '../lib/collection-tree-select'

const ENV_MAP_KEY = 'zreq_environment_by_workspace'
const LEGACY_ENV_ID_KEY = 'zreq_environment_id'

function readEnvIdMap(): Record<string, number | null> {
    try {
        const raw = localStorage.getItem(ENV_MAP_KEY)
        if (!raw) return {}
        const p = JSON.parse(raw) as unknown
        if (!p || typeof p !== 'object') return {}
        const out: Record<string, number | null> = {}
        for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
            if (v === null) {
                out[k] = null
                continue
            }
            if (typeof v === 'number' && Number.isFinite(v)) {
                out[k] = v
                continue
            }
            if (typeof v === 'string' && v !== '') {
                const n = parseInt(v, 10)
                if (!Number.isNaN(n)) out[k] = n
            }
        }
        return out
    } catch {
        return {}
    }
}

function writeEnvIdMap(m: Record<string, number | null>) {
    try {
        localStorage.setItem(ENV_MAP_KEY, JSON.stringify(m))
    } catch {
        /* ignore */
    }
}

function setEnvIdForWorkspace(workspaceId: number, envId: number | null) {
    const m = readEnvIdMap()
    m[String(workspaceId)] = envId
    writeEnvIdMap(m)
}

function migrateLegacyEnvironmentIdIfNeeded(activeWorkspaceId: number | null) {
    if (activeWorkspaceId == null) return
    try {
        const legacy = localStorage.getItem(LEGACY_ENV_ID_KEY)
        if (legacy === null) return
        if (legacy === '') {
            localStorage.removeItem(LEGACY_ENV_ID_KEY)
            return
        }
        const id = parseInt(legacy, 10)
        if (Number.isNaN(id)) {
            localStorage.removeItem(LEGACY_ENV_ID_KEY)
            return
        }
        const m = readEnvIdMap()
        const k = String(activeWorkspaceId)
        if (!(k in m)) {
            m[k] = id
            writeEnvIdMap(m)
        }
        localStorage.removeItem(LEGACY_ENV_ID_KEY)
    } catch {
        /* ignore */
    }
}

function pickActiveEnvironmentId(
    environments: Environment[],
    workspaceId: number | null,
    currentActive: number | null
): number | null {
    if (workspaceId == null) return null
    migrateLegacyEnvironmentIdIfNeeded(workspaceId)
    const m = readEnvIdMap()
    const k = String(workspaceId)
    if (k in m) {
        const want = m[k]
        if (want === null) return null
        if (environments.some((e) => e.id === want)) return want
        setEnvIdForWorkspace(workspaceId, null)
        return null
    }
    if (currentActive != null && environments.some((e) => e.id === currentActive)) return currentActive
    return null
}

const SIDEBAR_EXPAND_KEY = 'zreq_sidebar_expand'

const readExpandFlag = (v: unknown, defaultValue: boolean): boolean => {
    if (v === true || v === false) return v
    if (v === 'true') return true
    if (v === 'false') return false
    return defaultValue
}

const readSidebarExpanded = (): Record<string, boolean> => {
    try {
        const raw = localStorage.getItem(SIDEBAR_EXPAND_KEY)
        if (!raw) return {}
        const p = JSON.parse(raw) as unknown
        if (!p || typeof p !== 'object') return {}
        const out: Record<string, boolean> = {}
        for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
            if (v === true || v === false) out[k] = v
            else if (v === 'true') out[k] = true
            else if (v === 'false') out[k] = false
        }
        return out
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
    protocol: 'http',
}

const defaultWsTabFields = {
    wsState: 'idle' as WsConnectionState,
    wsFrames: [] as WsFrame[],
    wsHandshake: null as WsHandshake | null,
    wsConnectedAt: null as number | null,
}

function tabMethodLabel(req: ActiveRequest): string {
    return (req.protocol ?? 'http') === 'ws' ? 'WS' : req.method || 'GET'
}

function createRequestTab(id: string, req: ActiveRequest, overrides?: Partial<RequestTab>): RequestTab {
    const normalized = withNormalizedQuery(req)
    return {
        id,
        name: normalized.name || 'New Request',
        method: tabMethodLabel(normalized),
        isDirty: false,
        request: normalized,
        response: null,
        ...defaultWsTabFields,
        ...overrides,
    }
}

async function disconnectWsSession(sessionId: string) {
    try {
        await invoke('ws_disconnect', { sessionId })
    } catch {
        /* ignore */
    }
}

function resetTabWsState(tab: RequestTab) {
    tab.wsState = 'idle'
    tab.wsFrames = []
    tab.wsHandshake = null
    tab.wsConnectedAt = null
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
    /** Updates savedResponses on every open tab referencing this item (active or backgrounded) so a
     * stale copy on a backgrounded tab can never "come back" when that tab regains focus/persists. */
    syncSavedResponsesForItem: (itemId: string, next: SavedResponse[]) => void
    loadRequestItem: (
        item: RequestItem,
        breadcrumbPath?: string[],
        ctx?: { collectionId: number; folderId?: string }
    ) => void
    /** Always opens a new, detached tab replaying a saved response's request snapshot (not the live item). */
    openSavedResponseTab: (
        item: Pick<RequestItem, 'id' | 'name' | 'scripts' | 'protocol' | 'subprotocols' | 'messageTemplate' | 'savedResponses'>,
        saved: SavedResponse,
        breadcrumbPath: string[],
        ctx?: { collectionId: number }
    ) => void
    resetActiveRequest: () => void

    response: HttpResponse | null
    isLoading: boolean
    setResponse: (r: HttpResponse | null) => void
    setLoading: (v: boolean) => void
    /** Which response sub-tab (body/headers/…) is visible; forced to 'body' when opening a saved response. */
    responseViewTab: string
    setResponseViewTab: (v: string) => void

    setWsState: (tabId: string, state: WsConnectionState) => void
    appendWsFrame: (tabId: string, frame: WsFrame) => void
    clearWsFrames: (tabId: string) => void
    setWsHandshake: (tabId: string, handshake: WsHandshake | null) => void
    setWsConnectedAt: (tabId: string, at: number | null) => void

    environments: Environment[]
    activeEnvironmentId: number | null
    setEnvironments: (e: Environment[]) => void
    addEnvironment: (env: Environment) => void
    updateEnvironment: (id: number, updates: Partial<Environment>) => void
    removeEnvironment: (id: number) => void
    setActiveEnvironmentId: (id: number | null) => void

    selectedItemId: string | null
    setSelectedItemId: (id: string | null) => void

    /** Multi-select in collection sidebar (requests + folders) */
    sidebarSelection: SidebarSelection | null
    /** Explicit select mode — checkboxes only when set (via collection/folder menu). */
    sidebarSelectModeId: number | null
    /** Last clicked item — anchor for Shift+click range without prior multi-select */
    sidebarSelectAnchor: { collectionId: number; itemId: string } | null
    selectSidebarItem: (
        collectionId: number,
        itemId: string,
        mode: 'replace' | 'toggle' | 'range',
        flatVisibleIds?: string[]
    ) => void
    setSidebarSelectAnchor: (collectionId: number, itemId: string) => void
    enterSidebarSelectMode: (collectionId: number) => void
    exitSidebarSelectMode: () => void
    clearSidebarSelection: () => void

    consoleLogs: ConsoleEntry[]
    addConsoleLog: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) => void
    clearConsoleLogs: () => void

    breadcrumb: string[]
    setBreadcrumb: (path: string[]) => void

    /** `col:{id}` = collection row open; `fld:{collectionId}:{folderId}` = folder open */
    sidebarExpanded: Record<string, boolean>
    /** Bumped on bulk expand/collapse so folder rows re-render reliably */
    sidebarExpandRevision: number
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
                    if (s.activeWorkspaceId != null) {
                        setEnvIdForWorkspace(s.activeWorkspaceId, env.id)
                    }
                }
            }),

        tabs: [createRequestTab('default', { ...defaultRequest })],
        activeTabId: 'default',

        addTab: (item) =>
            set((s) => {
                const id = nanoid()
                const req = withNormalizedQuery(
                    item ? { ...defaultRequest, ...item } : { ...defaultRequest },
                )
                const cur = s.tabs.find((t) => t.id === s.activeTabId)
                if (cur) {
                    cur.request = { ...s.activeRequest }
                    cur.response = cloneHttpResponse(s.response)
                }
                s.tabs.push(createRequestTab(id, req))
                s.activeTabId = id
                s.activeRequest = req
                s.response = null
                s.isLoading = false
            }),

        closeTab: (id, force = false) => {
            const tab = get().tabs.find((t) => t.id === id)
            if (!tab) return false
            if (tab.isDirty && !force) return false
            if (
                (tab.request.protocol ?? 'http') === 'ws' &&
                (tab.wsState === 'connected' || tab.wsState === 'connecting')
            ) {
                void disconnectWsSession(id)
            }
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
                    s.activeRequest = withNormalizedQuery({ ...next.request })
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
                s.tabs.push(
                    createRequestTab(newId, req, {
                        name: req.name,
                        isDirty: true,
                        response: cloneHttpResponse(src.response),
                    }),
                )
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
            for (const tab of toClose) {
                if (
                    (tab.request.protocol ?? 'http') === 'ws' &&
                    (tab.wsState === 'connected' || tab.wsState === 'connecting')
                ) {
                    void disconnectWsSession(tab.id)
                }
            }
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
                s.activeRequest = withNormalizedQuery({ ...kept.request })
                s.response = cloneHttpResponse(kept.response)
                s.isLoading = false
            })
            return true
        },

        closeAllTabs: (force = false) => {
            const { tabs } = get()
            if (tabs.length === 0) return true
            if (!force && tabs.some((t) => t.isDirty)) return false
            for (const tab of tabs) {
                if (
                    (tab.request.protocol ?? 'http') === 'ws' &&
                    (tab.wsState === 'connected' || tab.wsState === 'connecting')
                ) {
                    void disconnectWsSession(tab.id)
                }
            }
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
                const normalized = withNormalizedQuery({ ...tab.request })
                tab.request = normalized
                s.activeRequest = { ...normalized }
                s.response = cloneHttpResponse(tab.response)
            }),

        setWsState: (tabId, wsState) =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === tabId)
                if (tab) tab.wsState = wsState
            }),

        appendWsFrame: (tabId, frame) =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === tabId)
                if (tab) tab.wsFrames.push(frame)
            }),

        clearWsFrames: (tabId) =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === tabId)
                if (tab) tab.wsFrames = []
            }),

        setWsHandshake: (tabId, handshake) =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === tabId)
                if (tab) tab.wsHandshake = handshake
            }),

        setWsConnectedAt: (tabId, at) =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === tabId)
                if (tab) tab.wsConnectedAt = at
            }),

        updateTabRequest: (id, req) =>
            set((s) => {
                const tab = s.tabs.find((t) => t.id === id)
                if (!tab) return
                Object.assign(tab.request, req)
                if (req.name) tab.name = req.name
                if (req.method) tab.method = tabMethodLabel(tab.request)
                if (req.protocol) tab.method = tabMethodLabel(tab.request)
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
                const prevProtocol = s.activeRequest.protocol ?? 'http'
                Object.assign(s.activeRequest, partial)
                const tab = s.tabs.find((t) => t.id === s.activeTabId)
                if (tab) {
                    Object.assign(tab.request, partial)
                    if (partial.method || partial.protocol) tab.method = tabMethodLabel(tab.request)
                    if (partial.name) tab.name = partial.name
                    tab.isDirty = true
                    const nextProtocol = (partial.protocol ?? tab.request.protocol ?? 'http') as RequestProtocol
                    if (partial.protocol != null && nextProtocol !== prevProtocol) {
                        if (
                            prevProtocol === 'ws' &&
                            (tab.wsState === 'connected' || tab.wsState === 'connecting')
                        ) {
                            void disconnectWsSession(tab.id)
                        }
                        resetTabWsState(tab)
                    }
                }
            }),
        syncSavedResponsesForItem: (itemId, next) =>
            set((s) => {
                if (s.activeRequest.itemId === itemId) {
                    s.activeRequest.savedResponses = next
                }
                for (const t of s.tabs) {
                    if (t.request.itemId === itemId) {
                        t.request.savedResponses = next
                    }
                }
            }),
        loadRequestItem: (item, breadcrumbPath?, ctx?) =>
            set((s) => {
                const colId = ctx?.collectionId
                const folderKey = ctx?.folderId ?? undefined
                if (colId != null && item.id) {
                    // Exclude detached saved-response tabs — they share itemId/collectionId with the
                    // live request but must never be treated as "the same tab" as the request itself.
                    const dup = s.tabs.find(
                        (t) =>
                            !t.request.savedResponseId &&
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
                        const normalized = withNormalizedQuery({ ...dup.request })
                        dup.request = normalized
                        s.activeRequest = { ...normalized }
                        s.response = cloneHttpResponse(dup.response)
                        s.isLoading = false
                        s.selectedItemId = item.id
                        if (breadcrumbPath) s.breadcrumb = breadcrumbPath
                        return
                    }
                }

                const req: ActiveRequest = withNormalizedQuery({
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
                    protocol: inferProtocolFromUrl(item.url ?? '', item.protocol),
                    subprotocols: item.subprotocols,
                    savedMessages: item.savedMessages ? [...item.savedMessages] : [],
                    messageTemplate: item.messageTemplate,
                    savedResponses: item.savedResponses ? [...item.savedResponses] : [],
                })
                const cur = s.tabs.find((t) => t.id === s.activeTabId)
                if (cur) {
                    cur.request = { ...s.activeRequest }
                    cur.response = cloneHttpResponse(s.response)
                }
                const id = nanoid()
                s.tabs.push(createRequestTab(id, req))
                s.activeTabId = id
                s.activeRequest = req
                s.response = null
                s.isLoading = false
                s.selectedItemId = item.id
                if (breadcrumbPath) s.breadcrumb = breadcrumbPath
            }),
        openSavedResponseTab: (item, saved, breadcrumbPath, ctx) =>
            set((s) => {
                // Reuse an already-open tab for this exact saved response instead of duplicating it.
                const dup = s.tabs.find(
                    (t) => t.request.itemId === item.id && t.request.savedResponseId === saved.id
                )
                const cur = s.tabs.find((t) => t.id === s.activeTabId)
                if (cur && cur !== dup) {
                    cur.request = { ...s.activeRequest }
                    cur.response = cloneHttpResponse(s.response)
                }
                // Detached snapshot: replays the request exactly as it was when saved, not the
                // (possibly since-edited) live item. savedResponseId marks this tab as a saved-response
                // view — autosave skips it, and "Save" overwrites this same entry (via updateSavedResponse,
                // which always reads the live item's other fields) instead of the live request.
                const snap = saved.requestSnapshot
                const req: ActiveRequest = withNormalizedQuery({
                    method: snap.method || 'GET',
                    url: snap.url || '',
                    headers: Array.isArray(snap.headers) ? snap.headers : [],
                    params: Array.isArray(snap.params) ? snap.params : [],
                    body: snap.body || { type: 'none', content: '' },
                    auth: snap.auth ?? { type: 'none' },
                    name: saved.name || `${item.name || 'Untitled Request'} (saved)`,
                    itemId: item.id,
                    collectionId: ctx?.collectionId,
                    savedResponseId: saved.id,
                    scripts: item.scripts,
                    protocol: inferProtocolFromUrl(snap.url ?? '', item.protocol),
                    subprotocols: item.subprotocols,
                    savedMessages: [],
                    messageTemplate: item.messageTemplate,
                    savedResponses: item.savedResponses ? [...item.savedResponses] : [],
                })
                if (dup) {
                    dup.request = req
                    dup.response = cloneHttpResponse(saved.response)
                    s.activeTabId = dup.id
                } else {
                    const id = nanoid()
                    s.tabs.push(createRequestTab(id, req, { response: cloneHttpResponse(saved.response) }))
                    s.activeTabId = id
                }
                s.activeRequest = req
                s.response = cloneHttpResponse(saved.response)
                s.isLoading = false
                s.selectedItemId = null
                s.breadcrumb = breadcrumbPath
                s.responseViewTab = 'body'
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
                    resetTabWsState(tab)
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

        responseViewTab: 'body',
        setResponseViewTab: (v) =>
            set((s) => {
                s.responseViewTab = v
            }),

        environments: [],
        activeEnvironmentId: null,
        setEnvironments: (e) =>
            set((s) => {
                s.environments = e
                s.activeEnvironmentId = pickActiveEnvironmentId(e, s.activeWorkspaceId, s.activeEnvironmentId)
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
                    if (s.activeWorkspaceId != null) {
                        setEnvIdForWorkspace(s.activeWorkspaceId, null)
                    }
                }
            }),
        setActiveEnvironmentId: (id) =>
            set((s) => {
                s.activeEnvironmentId = id
                if (s.activeWorkspaceId != null) {
                    setEnvIdForWorkspace(s.activeWorkspaceId, id)
                }
            }),

        selectedItemId: null,
        setSelectedItemId: (id) =>
            set((s) => {
                s.selectedItemId = id
            }),

        sidebarSelection: null,
        sidebarSelectModeId: null,
        sidebarSelectAnchor: null,
        selectSidebarItem: (collectionId, itemId, mode, flatVisibleIds) =>
            set((s) => {
                if (s.sidebarSelectModeId !== collectionId) return
                const cur = s.sidebarSelection
                if (mode === 'replace') {
                    s.sidebarSelection = { collectionId, ids: [itemId], anchorId: itemId }
                    s.sidebarSelectAnchor = { collectionId, itemId }
                    return
                }
                if (mode === 'toggle') {
                    if (cur?.collectionId !== collectionId) {
                        s.sidebarSelection = { collectionId, ids: [itemId], anchorId: itemId }
                    } else {
                        const ids = [...cur.ids]
                        const idx = ids.indexOf(itemId)
                        if (idx === -1) ids.push(itemId)
                        else ids.splice(idx, 1)
                        s.sidebarSelection =
                            ids.length === 0
                                ? null
                                : { collectionId, ids, anchorId: itemId }
                    }
                    s.sidebarSelectAnchor = { collectionId, itemId }
                    return
                }
                if (mode === 'range' && flatVisibleIds?.length) {
                    const anchor =
                        cur?.collectionId === collectionId
                            ? cur.anchorId
                            : s.sidebarSelectAnchor?.collectionId === collectionId
                              ? s.sidebarSelectAnchor.itemId
                              : itemId
                    const ids = rangeSelectIds(flatVisibleIds, anchor, itemId)
                    s.sidebarSelection = { collectionId, ids, anchorId: anchor }
                    s.sidebarSelectAnchor = { collectionId, itemId }
                }
            }),
        setSidebarSelectAnchor: (collectionId, itemId) =>
            set((s) => {
                s.sidebarSelectAnchor = { collectionId, itemId }
            }),
        enterSidebarSelectMode: (collectionId) =>
            set((s) => {
                if (s.sidebarSelectModeId !== collectionId) {
                    s.sidebarSelection = null
                }
                s.sidebarSelectModeId = collectionId
                s.sidebarExpanded[`col:${collectionId}`] = true
                persistSidebarExpanded(s.sidebarExpanded)
            }),
        exitSidebarSelectMode: () =>
            set((s) => {
                s.sidebarSelectModeId = null
                s.sidebarSelection = null
            }),
        clearSidebarSelection: () =>
            set((s) => {
                s.sidebarSelection = null
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
        sidebarExpandRevision: 0,
        setSidebarCollectionExpanded: (collectionId, expanded) =>
            set((s) => {
                s.sidebarExpanded[`col:${collectionId}`] = expanded
                persistSidebarExpanded(s.sidebarExpanded)
            }),
        toggleSidebarCollectionExpanded: (collectionId) =>
            set((s) => {
                const k = `col:${collectionId}`
                const cur = readExpandFlag(s.sidebarExpanded[k], true)
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
                const cur = readExpandFlag(s.sidebarExpanded[k], false)
                s.sidebarExpanded[k] = !cur
                persistSidebarExpanded(s.sidebarExpanded)
            }),
        setAllSidebarFoldersExpanded: (collectionId, items, expanded) =>
            set((s) => {
                const next = { ...s.sidebarExpanded, [`col:${collectionId}`]: true }
                const prefix = `fld:${collectionId}:`
                if (expanded) {
                    walkFolderIds(items, collectionId, (key) => {
                        next[key] = true
                    })
                } else {
                    walkFolderIds(items, collectionId, (key) => {
                        delete next[key]
                    })
                    for (const k of Object.keys(next)) {
                        if (k.startsWith(prefix)) delete next[k]
                    }
                }
                s.sidebarExpanded = next
                s.sidebarExpandRevision += 1
                persistSidebarExpanded(next)
            }),

        applyRemotePullBundle: (p) =>
            set((s) => {
                const oldWid = s.activeWorkspaceId
                const oldEnvId = s.activeEnvironmentId
                s.workspaces = p.workspaces
                s.activeWorkspaceId = p.activeWorkspaceId
                s.collections = p.collections
                s.environments = p.environments
                migrateLegacyEnvironmentIdIfNeeded(p.activeWorkspaceId)
                s.activeEnvironmentId = pickActiveEnvironmentId(
                    p.environments,
                    p.activeWorkspaceId,
                    oldWid === p.activeWorkspaceId ? oldEnvId : null
                )
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
                try {
                    localStorage.removeItem(ENV_MAP_KEY)
                } catch {
                    /* ignore */
                }
                try {
                    localStorage.removeItem(LEGACY_ENV_ID_KEY)
                } catch {
                    /* ignore */
                }
                s.workspaces = []
                s.activeWorkspaceId = null
                s.collections = []
                s.environments = []
                s.activeEnvironmentId = null
                s.selectedItemId = null
                s.sidebarSelection = null
                s.sidebarSelectModeId = null
                s.sidebarSelectAnchor = null
                s.response = null
                s.isLoading = false
                s.breadcrumb = []
                s.consoleLogs = []
                s.tabs = [createRequestTab('default', { ...defaultRequest })]
                s.activeTabId = 'default'
                s.activeRequest = { ...defaultRequest }
                s.sidebarExpanded = {}
                persistSidebarExpanded(s.sidebarExpanded)
            }),
    }))
)
