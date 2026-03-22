import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import i18n from '@/i18n/config'
import { apiClient } from '@/lib/api-client'
import { formatRequestError } from '@/lib/sync-error'
import { useAuthStore } from '@/store/authStore'
import { useInstanceStore } from '@/store/instanceStore'
import { useAppStore } from '@/store'
import { useSyncStore } from '@/store/syncStore'
import type { Collection, Environment, Workspace } from '@/types'
import { normalizeEnvVarsForDiff, stableStringify } from '@/lib/conflict-diff'
import { makeReplicaKey } from './replica-key'
import * as snap from './snapshot-store'
import { enqueueOp, listPending, removeOp } from './outbox-ops'
import type { ConflictEntry, OutboxOp } from './types'

let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
const SYNC_DEBOUNCE_MS = 450

/** Avoid footer "syncing" flash on fast pulls. */
const PULLING_INDICATOR_DELAY_MS = 220
let pullingIndicatorTimer: ReturnType<typeof setTimeout> | null = null

function armPullingIndicator() {
    if (pullingIndicatorTimer != null) clearTimeout(pullingIndicatorTimer)
    pullingIndicatorTimer = setTimeout(() => {
        pullingIndicatorTimer = null
        useSyncStore.getState().setSyncState({ pulling: true })
    }, PULLING_INDICATOR_DELAY_MS)
}

function disarmPullingIndicator() {
    if (pullingIndicatorTimer != null) {
        clearTimeout(pullingIndicatorTimer)
        pullingIndicatorTimer = null
    }
    useSyncStore.getState().setSyncState({ pulling: false })
}

/** Serialize pull+push so overlapping triggers do not apply UI state twice in a row. */
let pullPushChain: Promise<void> = Promise.resolve()

/** True when pull/push to the zreq instance must not run (browser offline). */
export function isRemoteSyncBlocked(): boolean {
    return typeof navigator !== 'undefined' && !navigator.onLine
}

export function getReplicaKeyOrNull(): string | null {
    const user = useAuthStore.getState().user
    if (!user) return null
    const base = useInstanceStore.getState().getActiveBaseUrl()
    return makeReplicaKey(base, user.id)
}

export async function ensureReplicaLoaded(): Promise<void> {
    const key = getReplicaKeyOrNull()
    if (!key) return
    if (snap.getCurrentReplicaKey() === key && snap.getMemorySnapshot()) return
    await snap.loadSnapshotForReplica(key)
}

/** Debounced pull+push after local edits so server changes and conflicts are picked up without manual sync. */
export function scheduleSync() {
    if (syncDebounceTimer != null) clearTimeout(syncDebounceTimer)
    syncDebounceTimer = setTimeout(() => {
        syncDebounceTimer = null
        void pullThenPush()
    }, SYNC_DEBOUNCE_MS)
}

function addConflict(c: Omit<ConflictEntry, 'id'> & { id?: string }) {
    const hadConflicts = useSyncStore.getState().conflicts.length > 0
    useSyncStore.getState().addConflict({
        id: c.id ?? `c_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        kind: c.kind,
        entityId: c.entityId,
        workspaceId: c.workspaceId,
        local: c.local,
        server: c.server,
        outboxOpId: c.outboxOpId,
    })
    if (!hadConflicts) {
        toast.warning(i18n.t('sync.conflictToast'), { duration: 12_000 })
    }
}

function isNotFound(e: unknown): boolean {
    return isAxiosError(e) && e.response?.status === 404
}

/** True when local snapshot already matches remote payload (same server revision can still hide unpushed edits without this). */
function environmentContentMatchesServer(local: Environment | null | undefined, remote: Environment): boolean {
    if (!local) return false
    if (local.name !== remote.name) return false
    const a = stableStringify(normalizeEnvVarsForDiff(local.variables), 0)
    const b = stableStringify(normalizeEnvVarsForDiff(remote.variables), 0)
    return a === b
}

function collectionContentMatchesServer(local: Collection | null | undefined, remote: Collection): boolean {
    if (!local) return false
    if (local.name !== remote.name) return false
    if ((local.description ?? '') !== (remote.description ?? '')) return false
    return stableStringify(local.items, 0) === stableStringify(remote.items, 0)
}

function mergeWorkspaces(remote: Workspace[], mem: NonNullable<ReturnType<typeof snap.getMemorySnapshot>>): Workspace[] {
    return remote.map((r) => {
        const meta = mem.metaWorkspace[r.id]
        if (!meta?.dirty) return r
        const base = meta.baseServerUpdatedAt ?? meta.serverUpdatedAt
        if (r.updatedAt === base) return r
        const local = mem.workspaces.find((w) => w.id === r.id)
        return local ?? r
    })
}

/** Rows still on the server but queued for DELETE locally — must not be re-applied on pull before push runs. */
async function pendingCollectionDeletesForWorkspace(replicaKey: string, workspaceId: number): Promise<Set<number>> {
    const ops = await listPending(replicaKey)
    const s = new Set<number>()
    for (const o of ops) {
        if (o.type === 'collection_delete' && o.workspaceId === workspaceId) s.add(o.collectionId)
    }
    return s
}

async function pendingEnvironmentDeletes(replicaKey: string): Promise<Set<number>> {
    const ops = await listPending(replicaKey)
    const s = new Set<number>()
    for (const o of ops) {
        if (o.type === 'environment_delete') s.add(o.environmentId)
    }
    return s
}

export async function pullRemoteFull(): Promise<boolean> {
    const key = getReplicaKeyOrNull()
    if (!key || !useAuthStore.getState().token) return false
    if (isRemoteSyncBlocked()) {
        if (key) {
            const pending = await listPending(key)
            disarmPullingIndicator()
            useSyncStore.getState().setSyncState({ pendingOutbox: pending.length })
        }
        return false
    }
    useSyncStore.getState().setSyncState({ lastError: null })
    armPullingIndicator()
    try {
        await ensureReplicaLoaded()
        const mem = snap.getMemorySnapshot()
        if (!mem) await snap.loadSnapshotForReplica(key)
        const m = snap.getMemorySnapshot()!
        const app = useAppStore.getState()
        if (app.activeWorkspaceId != null) {
            snap.setWorkspaceSlice(app.activeWorkspaceId, app.collections)
        }
        snap.setEnvironmentsLocal(app.environments)

        const wsRes = await apiClient.get<{ data: Workspace[] }>('/workspaces')
        let remoteWs = wsRes.data?.data ?? []
        if (remoteWs.length === 0) {
            const cre = await apiClient.post<{ data: Workspace }>('/workspaces', { name: 'Default' })
            remoteWs = [cre.data.data]
        }

        const workspaces = mergeWorkspaces(remoteWs, m)
        snap.setWorkspacesLocal(workspaces)

        let savedWid: number | null = null
        try {
            const raw = localStorage.getItem('postwoman_workspace_id')
            if (raw) savedWid = parseInt(raw, 10)
        } catch {
            /* ignore */
        }
        const wid = remoteWs.some((w) => w.id === savedWid) ? savedWid! : remoteWs[0].id

        snap.setActiveWorkspaceIdLocal(wid)

        const colRes = await apiClient.get<{ data: Collection[] }>('/collections', { params: { workspaceId: wid } })
        const remoteCols = colRes.data?.data ?? []
        const pendingColDeletes = await pendingCollectionDeletesForWorkspace(key, wid)

        for (const r of remoteCols) {
            if (pendingColDeletes.has(r.id)) continue
            const meta = m.metaCollection[r.id]
            if (meta?.dirty) {
                const base = meta.baseServerUpdatedAt ?? meta.serverUpdatedAt
                const localList = m.collectionsByWorkspaceId[String(wid)] ?? []
                const localCol = localList.find((c) => c.id === r.id)
                if (r.updatedAt !== base) {
                    if (collectionContentMatchesServer(localCol, r)) {
                        snap.applyServerCollection(wid, r, { overwriteLocal: true })
                    } else {
                        addConflict({
                            kind: 'collection',
                            entityId: r.id,
                            workspaceId: wid,
                            local: localCol ?? null,
                            server: r,
                        })
                    }
                    continue
                }
                // Server revision unchanged: diff is only unpushed local edits — not a merge conflict.
                continue
            }
            snap.applyServerCollection(wid, r, { overwriteLocal: true })
        }

        const envRes = await apiClient.get<{ data: Environment[] }>('/environments')
        const remoteEnv = envRes.data?.data ?? []
        const pendingEnvDeletes = await pendingEnvironmentDeletes(key)
        const nextEnvs: Environment[] = []

        for (const r of remoteEnv) {
            if (pendingEnvDeletes.has(r.id)) continue
            const meta = m.metaEnv[r.id]
            if (meta?.dirty) {
                const base = meta.baseServerUpdatedAt ?? meta.serverUpdatedAt
                const local =
                    app.environments.find((e) => e.id === r.id) ?? m.environments.find((e) => e.id === r.id)
                if (r.updatedAt !== base) {
                    if (environmentContentMatchesServer(local, r)) {
                        nextEnvs.push(r)
                        m.metaEnv[r.id] = { serverUpdatedAt: r.updatedAt, dirty: false }
                    } else {
                        addConflict({
                            kind: 'environment',
                            entityId: r.id,
                            local: local ?? null,
                            server: r,
                        })
                        nextEnvs.push(local ?? r)
                    }
                    continue
                }
                nextEnvs.push(local ?? r)
                continue
            }
            nextEnvs.push(r)
            m.metaEnv[r.id] = { serverUpdatedAt: r.updatedAt, dirty: false }
        }

        for (const w of workspaces) {
            if (!m.metaWorkspace[w.id]) {
                m.metaWorkspace[w.id] = { serverUpdatedAt: w.updatedAt, dirty: false }
            }
        }
        for (const c of remoteCols) {
            if (pendingColDeletes.has(c.id)) continue
            if (!m.metaCollection[c.id]?.dirty) {
                m.metaCollection[c.id] = { serverUpdatedAt: c.updatedAt, dirty: false }
            }
        }

        m.workspaces = workspaces
        m.activeWorkspaceId = wid
        m.environments = nextEnvs
        m.lastSyncedAt = Date.now()
        snap.replaceMemorySnapshot(m)

        app.applyRemotePullBundle({
            workspaces,
            activeWorkspaceId: wid,
            collections: snap.getWorkspaceSlice(wid),
            environments: nextEnvs,
        })
        await snap.persistSnapshotNow()

        const pending = await listPending(key)
        disarmPullingIndicator()
        useSyncStore.getState().setSyncState({
            lastSyncedAt: m.lastSyncedAt,
            lastError: null,
            pendingOutbox: pending.length,
        })
        return true
    } catch (e) {
        disarmPullingIndicator()
        useSyncStore.getState().setSyncState({
            lastError: formatRequestError(e),
        })
        return false
    }
}

function parseStale409(err: unknown): unknown | null {
    const ax = err as { response?: { status?: number; data?: unknown } }
    const res = ax.response
    if (!res || res.status !== 409) return null
    const d = res.data
    if (!d || typeof d !== 'object') return null
    const rec = d as Record<string, unknown>
    const code = rec.code ?? rec.error
    if (code === 'STALE_VERSION' && rec.data != null) return rec.data
    const msg = rec.message
    if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
        const o = msg as { code?: string; data?: unknown }
        if (o.code === 'STALE_VERSION') return o.data ?? null
    }
    if (typeof msg === 'string') {
        try {
            const inner = JSON.parse(msg) as { code?: string; data?: unknown }
            if (inner?.code === 'STALE_VERSION' && inner.data != null) return inner.data
        } catch {
            /* ignore */
        }
    }
    return null
}

async function squashTempCollectionPatches(replicaKey: string, tempId: number) {
    const ops = await listPending(replicaKey)
    const toRemove = ops.filter(
        (o) =>
            (o.type === 'collection_patch' || o.type === 'collection_delete') && o.collectionId === tempId
    )
    for (const o of toRemove) await removeOp(o.id)
}

async function maybeEnqueueInitialCollectionPatch(
    replicaKey: string,
    created: Collection,
    workspaceId: number
) {
    const live = useAppStore.getState().collections.find((c) => c.id === created.id)
    if (!live) return
    const itemsSame = JSON.stringify(live.items ?? []) === JSON.stringify(created.items ?? [])
    const nameSame = live.name === created.name
    if (itemsSame && nameSame) return
    const body: Record<string, unknown> = {}
    if (!nameSame) body.name = live.name
    if (!itemsSame) body.items = live.items
    await enqueueOp({
        type: 'collection_patch',
        replicaKey,
        collectionId: created.id,
        workspaceId,
        body,
        expectedUpdatedAt: created.updatedAt,
    })
}

export async function pushOutbox(): Promise<void> {
    const key = getReplicaKeyOrNull()
    if (!key || !useAuthStore.getState().token) return
    if (isRemoteSyncBlocked()) {
        const pending = await listPending(key)
        useSyncStore.getState().setSyncState({ pendingOutbox: pending.length, pushing: false })
        return
    }
    await ensureReplicaLoaded()
    const ops = await listPending(key)
    useSyncStore.getState().setSyncState({ pendingOutbox: ops.length, pushing: ops.length > 0 })
    for (const op of ops) {
        try {
            await processOneOp(op)
            await removeOp(op.id)
        } catch (e) {
            const stale = parseStale409(e)
            if (stale != null) {
                await handleStale409(op, stale)
            } else {
                useSyncStore.getState().setSyncState({
                    lastError: formatRequestError(e),
                })
                break
            }
        }
    }
    const rest = await listPending(key)
    useSyncStore.getState().setSyncState({ pendingOutbox: rest.length, pushing: false })
}

async function runPullThenPushOnce(): Promise<void> {
    if (isRemoteSyncBlocked()) return
    await pullRemoteFull()
    await pushOutbox()
}

/** Pull server state first, then flush outbox so push does not race ahead of pull and miss conflict detection. */
export function pullThenPush(): Promise<void> {
    const p = pullPushChain.then(() =>
        runPullThenPushOnce().catch(() => {
            /* errors already recorded on sync store */
        })
    )
    pullPushChain = p.catch(() => {})
    return p
}

async function handleStale409(op: OutboxOp, serverEntity: unknown) {
    if (op.type === 'collection_patch') {
        const srv = serverEntity as Collection
        const list = snap.getWorkspaceSlice(op.workspaceId)
        addConflict({
            kind: 'collection',
            entityId: op.collectionId,
            workspaceId: op.workspaceId,
            local: list.find((c) => c.id === op.collectionId),
            server: srv,
            outboxOpId: op.id,
        })
    } else if (op.type === 'workspace_patch') {
        const srv = serverEntity as Workspace
        addConflict({
            kind: 'workspace',
            entityId: op.workspaceId,
            local: useAppStore.getState().workspaces.find((w) => w.id === op.workspaceId),
            server: srv,
            outboxOpId: op.id,
        })
    } else if (op.type === 'environment_patch') {
        const srv = serverEntity as Environment
        addConflict({
            kind: 'environment',
            entityId: op.environmentId,
            local: useAppStore.getState().environments.find((x) => x.id === op.environmentId),
            server: srv,
            outboxOpId: op.id,
        })
    }
}

async function processOneOp(op: OutboxOp) {
    if (op.type === 'collection_patch') {
        const mem = snap.getMemorySnapshot()
        const meta = mem?.metaCollection[op.collectionId]
        const live =
            useAppStore.getState().activeWorkspaceId === op.workspaceId
                ? useAppStore.getState().collections.find((c) => c.id === op.collectionId)
                : undefined
        const exp = op.expectedUpdatedAt ?? meta?.baseServerUpdatedAt ?? meta?.serverUpdatedAt ?? live?.updatedAt
        const res = await apiClient.patch<{ data: Collection }>(`/collections/${op.collectionId}`, {
            ...op.body,
            expectedUpdatedAt: exp,
        })
        const c = res.data.data
        snap.clearDirtyMeta('collection', op.collectionId, c.updatedAt)
        snap.applyServerCollection(op.workspaceId, c, { overwriteLocal: true })
        if (useAppStore.getState().activeWorkspaceId === op.workspaceId) {
            useAppStore.getState().updateCollection(op.collectionId, c)
        }
        await snap.persistSnapshotNow()
    } else if (op.type === 'collection_create') {
        const res = await apiClient.post<{ data: Collection }>('/collections', op.body)
        const c = res.data.data
        await squashTempCollectionPatches(op.replicaKey, op.tempId)
        useAppStore.getState().replaceCollection(op.tempId, c)
        snap.setWorkspaceSlice(op.workspaceId, useAppStore.getState().collections)
        const mem = snap.getMemorySnapshot()
        if (mem) {
            delete mem.metaCollection[op.tempId]
            mem.metaCollection[c.id] = { serverUpdatedAt: c.updatedAt, dirty: false }
        }
        await maybeEnqueueInitialCollectionPatch(op.replicaKey, c, op.workspaceId)
        await snap.persistSnapshotNow()
    } else if (op.type === 'collection_delete') {
        if (op.collectionId < 0) {
            snap.removeCollectionLocal(op.workspaceId, op.collectionId)
            if (useAppStore.getState().activeWorkspaceId === op.workspaceId) {
                useAppStore.getState().removeCollection(op.collectionId)
            }
            const mem = snap.getMemorySnapshot()
            if (mem) delete mem.metaCollection[op.collectionId]
            await snap.persistSnapshotNow()
            return
        }
        try {
            await apiClient.delete(`/collections/${op.collectionId}`)
        } catch (e) {
            if (!isNotFound(e)) throw e
        }
        snap.removeCollectionLocal(op.workspaceId, op.collectionId)
        if (useAppStore.getState().activeWorkspaceId === op.workspaceId) {
            useAppStore.getState().removeCollection(op.collectionId)
        }
        await snap.persistSnapshotNow()
    } else if (op.type === 'workspace_patch') {
        const memMeta = snap.getMemorySnapshot()
        const meta = memMeta?.metaWorkspace[op.workspaceId]
        const live = useAppStore.getState().workspaces.find((w) => w.id === op.workspaceId)
        const exp = op.expectedUpdatedAt ?? meta?.baseServerUpdatedAt ?? meta?.serverUpdatedAt ?? live?.updatedAt
        const res = await apiClient.patch<{ data: Workspace }>(`/workspaces/${op.workspaceId}`, {
            ...op.body,
            expectedUpdatedAt: exp,
        })
        const w = res.data.data
        snap.clearDirtyMeta('workspace', op.workspaceId, w.updatedAt)
        const memWs = snap.getMemorySnapshot()
        if (memWs) {
            const idx = memWs.workspaces.findIndex((x) => x.id === w.id)
            if (idx !== -1) memWs.workspaces[idx] = w
        }
        useAppStore.getState().updateWorkspace(op.workspaceId, w)
        await snap.persistSnapshotNow()
    } else if (op.type === 'workspace_create') {
        const res = await apiClient.post<{ data: Workspace }>('/workspaces', op.body)
        const w = res.data.data
        useAppStore.getState().replaceWorkspace(op.tempId, w)
        const mem = snap.getMemorySnapshot()
        if (mem) {
            delete mem.metaWorkspace[op.tempId]
            mem.metaWorkspace[w.id] = { serverUpdatedAt: w.updatedAt, dirty: false }
            const idx = mem.workspaces.findIndex((x) => x.id === op.tempId)
            if (idx !== -1) mem.workspaces[idx] = w
        }
        await snap.persistSnapshotNow()
    } else if (op.type === 'workspace_delete') {
        if (op.workspaceId < 0) {
            useAppStore.getState().removeWorkspace(op.workspaceId)
            const mem = snap.getMemorySnapshot()
            if (mem) {
                mem.workspaces = mem.workspaces.filter((x) => x.id !== op.workspaceId)
                delete mem.metaWorkspace[op.workspaceId]
                delete mem.collectionsByWorkspaceId[String(op.workspaceId)]
            }
            await snap.persistSnapshotNow()
            return
        }
        try {
            await apiClient.delete(`/workspaces/${op.workspaceId}`)
        } catch (e) {
            if (!isNotFound(e)) throw e
        }
        useAppStore.getState().removeWorkspace(op.workspaceId)
        const mem = snap.getMemorySnapshot()
        if (mem) {
            mem.workspaces = mem.workspaces.filter((x) => x.id !== op.workspaceId)
            delete mem.metaWorkspace[op.workspaceId]
            delete mem.collectionsByWorkspaceId[String(op.workspaceId)]
        }
        await snap.persistSnapshotNow()
    } else if (op.type === 'environment_patch') {
        const memMeta = snap.getMemorySnapshot()
        const meta = memMeta?.metaEnv[op.environmentId]
        const live = useAppStore.getState().environments.find((e) => e.id === op.environmentId)
        const exp = op.expectedUpdatedAt ?? meta?.baseServerUpdatedAt ?? meta?.serverUpdatedAt ?? live?.updatedAt
        const res = await apiClient.patch<{ data: Environment }>(`/environments/${op.environmentId}`, {
            ...op.body,
            expectedUpdatedAt: exp,
        })
        const e = res.data.data
        snap.clearDirtyMeta('environment', op.environmentId, e.updatedAt)
        useAppStore.getState().updateEnvironment(op.environmentId, e)
        const memEnv = snap.getMemorySnapshot()
        if (memEnv) {
            const idx = memEnv.environments.findIndex((x) => x.id === e.id)
            if (idx !== -1) memEnv.environments[idx] = e
        }
        await snap.persistSnapshotNow()
    } else if (op.type === 'environment_create') {
        const res = await apiClient.post<{ data: Environment }>('/environments', op.body)
        const e = res.data.data
        useAppStore.getState().replaceEnvironment(op.tempId, e)
        const mem = snap.getMemorySnapshot()
        if (mem) {
            delete mem.metaEnv[op.tempId]
            mem.metaEnv[e.id] = { serverUpdatedAt: e.updatedAt, dirty: false }
            const idx = mem.environments.findIndex((x) => x.id === op.tempId)
            if (idx !== -1) mem.environments[idx] = e
        }
        await snap.persistSnapshotNow()
    } else if (op.type === 'environment_delete') {
        if (op.environmentId < 0) {
            useAppStore.getState().removeEnvironment(op.environmentId)
            const mem = snap.getMemorySnapshot()
            if (mem) {
                mem.environments = mem.environments.filter((x) => x.id !== op.environmentId)
                delete mem.metaEnv[op.environmentId]
            }
            await snap.persistSnapshotNow()
            return
        }
        try {
            await apiClient.delete(`/environments/${op.environmentId}`)
        } catch (e) {
            if (!isNotFound(e)) throw e
        }
        useAppStore.getState().removeEnvironment(op.environmentId)
        const mem = snap.getMemorySnapshot()
        if (mem) {
            mem.environments = mem.environments.filter((x) => x.id !== op.environmentId)
            delete mem.metaEnv[op.environmentId]
        }
        await snap.persistSnapshotNow()
    }
}

export function hydrateFromMemorySnapshot() {
    const mem = snap.getMemorySnapshot()
    if (!mem) return
    useAppStore.getState().setWorkspaces(mem.workspaces)
    if (mem.activeWorkspaceId != null) {
        useAppStore.getState().setActiveWorkspaceId(mem.activeWorkspaceId)
        useAppStore.getState().setCollections(mem.collectionsByWorkspaceId[String(mem.activeWorkspaceId)] ?? [])
    }
    useAppStore.getState().setEnvironments(mem.environments)
}

export async function hydrateFromDiskIfNeeded(): Promise<boolean> {
    const key = getReplicaKeyOrNull()
    if (!key) return false
    await snap.loadSnapshotForReplica(key)
    const mem = snap.getMemorySnapshot()
    if (!mem || (mem.workspaces.length === 0 && Object.keys(mem.collectionsByWorkspaceId).length === 0)) {
        return false
    }
    hydrateFromMemorySnapshot()
    const pending = await listPending(key)
    useSyncStore.getState().setSyncState({ pendingOutbox: pending.length })
    return true
}
