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

// ---------------------------------------------------------------------------
// Constants & module-level state
// ---------------------------------------------------------------------------

const SYNC_DEBOUNCE_MS = 450
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null

const PULLING_INDICATOR_DELAY_MS = 220
let pullingIndicatorTimer: ReturnType<typeof setTimeout> | null = null

/** Serialize pull+push so concurrent triggers never apply state twice. */
let pullPushChain: Promise<void> = Promise.resolve()

/**
 * Guard: prevent bootstrap workspace creation from running more than once per
 * replica across reloads. Persisted to localStorage so it survives page refresh.
 */
const BOOTSTRAP_WS_KEY = 'zreq_bootstrap_ws:'
const bootstrapAttempted = new Set<string>()

function hasBootstrappedWorkspace(replicaKey: string): boolean {
    if (bootstrapAttempted.has(replicaKey)) return true
    try { return localStorage.getItem(`${BOOTSTRAP_WS_KEY}${replicaKey}`) === '1' } catch { return false }
}

function markBootstrappedWorkspace(replicaKey: string) {
    bootstrapAttempted.add(replicaKey)
    try { localStorage.setItem(`${BOOTSTRAP_WS_KEY}${replicaKey}`, '1') } catch { /* ignore */ }
}

function clearBootstrappedWorkspace(replicaKey: string) {
    bootstrapAttempted.delete(replicaKey)
    try { localStorage.removeItem(`${BOOTSTRAP_WS_KEY}${replicaKey}`) } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getHttpStatus(e: unknown): number | null {
    return isAxiosError(e) ? (e.response?.status ?? null) : null
}

function isPermanentOutboxError(e: unknown): boolean {
    const status = getHttpStatus(e)
    return status === 400 || status === 403 || status === 404 || status === 409
}

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



// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

export function scheduleSync() {
    if (syncDebounceTimer != null) clearTimeout(syncDebounceTimer)
    syncDebounceTimer = setTimeout(() => {
        syncDebounceTimer = null
        void pullThenPush()
    }, SYNC_DEBOUNCE_MS)
}

// ---------------------------------------------------------------------------
// Online-first pull
//
// Server is the source of truth. Local snapshot is only used for:
//   1. Dirty-flag / conflict detection
//   2. Offline fallback (hydrateFromDiskIfNeeded)
//   3. Outbox temp-ID tracking
// ---------------------------------------------------------------------------

export async function pullRemoteFull(): Promise<boolean> {
    const key = getReplicaKeyOrNull()
    if (!key || !useAuthStore.getState().token) return false

    if (isRemoteSyncBlocked()) {
        const pending = await listPending(key)
        disarmPullingIndicator()
        useSyncStore.getState().setSyncState({ pendingOutbox: pending.length })
        return false
    }

    useSyncStore.getState().setSyncState({ lastError: null })
    armPullingIndicator()

    try {
        // Ensure snapshot is loaded for dirty-tracking / outbox ops
        await ensureReplicaLoaded()
        const m = snap.getMemorySnapshot() ?? (await snap.loadSnapshotForReplica(key))

        // ── 1. Fetch workspaces ──────────────────────────────────────────────
        console.log('[sync] pullRemoteFull: fetching workspaces...')
        const wsRes = await apiClient.get<{ data: Workspace[] }>('/workspaces')
        let remoteWs: Workspace[] = wsRes.data?.data ?? []
        console.log('[sync] pullRemoteFull: remote workspaces =', remoteWs.map(w => `${w.id}:${w.name}`))

        // Bootstrap: create default workspace only once per replica (guard against spam)
        if (remoteWs.length === 0) {
            if (hasBootstrappedWorkspace(key)) {
                // Already attempted once — don't create another. Bail and retry next cycle.
                disarmPullingIndicator()
                return false
            }
            markBootstrappedWorkspace(key)
            const cre = await apiClient.post<{ data: Workspace }>('/workspaces', { name: 'Default' })
            remoteWs = [cre.data.data]
        } else {
            // Server has at least one workspace, reset bootstrap guard so an intentional
            // "delete all workspaces" state can be recovered in a future session.
            clearBootstrappedWorkspace(key)
        }

        const allPendingOps = await listPending(key)

        // Pending workspace_create rows are not on the server yet; pull must not drop them
        // (pull runs before push — otherwise workspace_create sees no temp id and the op is
        // removed from the outbox without ever POSTing).
        const pendingWorkspaceCreates = allPendingOps.filter((o) => o.type === 'workspace_create')
        const mergedWorkspaces: Workspace[] = structuredClone(remoteWs)
        const mergedWsIds = new Set(mergedWorkspaces.map((w) => w.id))
        const prevSnapWorkspaces = m.workspaces
        for (const o of pendingWorkspaceCreates) {
            if (mergedWsIds.has(o.tempId)) continue
            const local = prevSnapWorkspaces.find((w) => w.id === o.tempId)
            if (local) {
                mergedWorkspaces.push(structuredClone(local))
                mergedWsIds.add(o.tempId)
                continue
            }
            const u = useAuthStore.getState().user
            if (u && o.body?.name) {
                const now = new Date().toISOString()
                mergedWorkspaces.push({
                    id: o.tempId,
                    name: o.body.name,
                    userId: u.id,
                    createdAt: now,
                    updatedAt: now,
                })
                mergedWsIds.add(o.tempId)
            }
        }

        let savedWid: number | null = null
        try {
            const raw = localStorage.getItem('zreq_workspace_id')
            if (raw) savedWid = parseInt(raw, 10)
        } catch { /* ignore */ }

        // ── 2. Select active workspace ────────────────────────────────────────
        //   1st: localStorage id if present in merged list (server + pending-create temps)
        //   2nd: snapshot active id if present in merged list
        //   3rd: first server workspace (oldest by createdAt)
        const wid =
            (savedWid != null && mergedWsIds.has(savedWid) ? savedWid : null) ??
            (m.activeWorkspaceId != null && mergedWsIds.has(m.activeWorkspaceId) ? m.activeWorkspaceId : null) ??
            remoteWs[0]!.id

        try { localStorage.setItem('zreq_workspace_id', String(wid)) } catch { /* ignore */ }

        // ── 3. Fetch collections for every workspace (so switching workspace isn't empty)
        const colResults = await Promise.all(
            remoteWs.map((w) =>
                apiClient.get<{ data: Collection[] }>('/collections', { params: { workspaceId: w.id } })
            )
        )

        // ── 4. Fetch environments per workspace ─────────────────────────────
        const envResults = await Promise.all(
            remoteWs.map((w) =>
                apiClient.get<{ data: Environment[] }>('/environments', { params: { workspaceId: w.id } })
            )
        )

        // ── 5. Merge collections + environments ───────────────────────────────
        // Online-first: server data is ALWAYS applied to snapshot/UI.
        // Conflicts are only raised when there is an active outbox op (user was
        // editing offline) AND the server version is newer than when the edit started.
        // A stale dirty flag from a crashed previous session must never hide data.

        // Build sets of pending-writes by entity id for fast lookup
        const pendingColPatchIds = new Set<number>()
        const pendingEnvPatchIds = new Set<number>()
        const pendingEnvCreateByWs = new Map<number, Set<number>>()
        const pendingEnvPatchTempByWs = new Map<number, Set<number>>()
        const colDelByWs = new Map<number, Set<number>>()
        const pendingEnvDelIds = new Set<number>()
        for (const o of allPendingOps) {
            if (o.type === 'collection_patch') pendingColPatchIds.add(o.collectionId)
            if (o.type === 'environment_patch') pendingEnvPatchIds.add(o.environmentId)
            if (o.type === 'environment_create') {
                const wid = 'workspaceId' in o ? o.workspaceId : 0
                let s = pendingEnvCreateByWs.get(wid)
                if (!s) {
                    s = new Set()
                    pendingEnvCreateByWs.set(wid, s)
                }
                s.add(o.tempId)
            }
            if (o.type === 'environment_patch' && o.environmentId < 0) {
                const wid = 'workspaceId' in o ? o.workspaceId : 0
                let s = pendingEnvPatchTempByWs.get(wid)
                if (!s) {
                    s = new Set()
                    pendingEnvPatchTempByWs.set(wid, s)
                }
                s.add(o.environmentId)
            }
            if (o.type === 'collection_delete') {
                let s = colDelByWs.get(o.workspaceId)
                if (!s) { s = new Set(); colDelByWs.set(o.workspaceId, s) }
                s.add(o.collectionId)
            }
            if (o.type === 'environment_delete') pendingEnvDelIds.add(o.environmentId)
        }

        const mergeRemoteCols = async (workspaceId: number, remoteCols: Collection[]) => {
            const pendingDeletes = colDelByWs.get(workspaceId) ?? new Set<number>()
            for (const r of remoteCols) {
                // Pending delete for this collection: skip restoring it from the server.
                // The delete op will be sent in the push phase — don't let pull undo it.
                if (pendingDeletes.has(r.id)) {
                    continue
                }

                const meta = m.metaCollection[r.id]
                const hasPendingPatch = pendingColPatchIds.has(r.id)

                if (hasPendingPatch && meta?.dirty) {
                    const base = meta.baseServerUpdatedAt ?? meta.serverUpdatedAt
                    if (r.updatedAt !== base) {
                        // Real conflict: server moved on while user was editing.
                        const localList = m.collectionsByWorkspaceId[String(workspaceId)] ?? []
                        const localCol = localList.find((c) => c.id === r.id)
                        if (!collectionContentMatchesServer(localCol, r)) {
                            addConflict({
                                kind: 'collection',
                                entityId: r.id,
                                workspaceId,
                                local: localCol ?? null,
                                server: r,
                            })
                        }
                        // Fall through: apply server version so user sees conflict state
                    } else {
                        // Server unchanged since edit started — keep local version.
                        // Only refresh serverUpdatedAt; push phase will send the patch.
                        m.metaCollection[r.id] = {
                            serverUpdatedAt: r.updatedAt,
                            dirty: true,
                            baseServerUpdatedAt: meta.baseServerUpdatedAt ?? meta.serverUpdatedAt,
                        }
                        continue
                    }
                }

                snap.applyServerCollection(workspaceId, r, { overwriteLocal: true })
                m.metaCollection[r.id] = { serverUpdatedAt: r.updatedAt, dirty: false }
            }
        }

        for (let i = 0; i < remoteWs.length; i++) {
            await mergeRemoteCols(remoteWs[i]!.id, colResults[i]?.data?.data ?? [])
        }

        const mergeRemoteEnvs = (workspaceId: number, remoteEnv: Environment[]) => {
            const key = String(workspaceId)
            const nextEnvs: Environment[] = []
            const pendingCreateTemp = pendingEnvCreateByWs.get(workspaceId) ?? new Set<number>()
            const pendingPatchTemp = pendingEnvPatchTempByWs.get(workspaceId) ?? new Set<number>()
            const liveActive = useAppStore.getState().activeWorkspaceId === workspaceId

            for (const r of remoteEnv) {
                if (pendingEnvDelIds.has(r.id)) continue

                const meta = m.metaEnv[r.id]
                const hasPendingPatch = pendingEnvPatchIds.has(r.id)

                if (hasPendingPatch && meta?.dirty) {
                    const base = meta.baseServerUpdatedAt ?? meta.serverUpdatedAt
                    if (r.updatedAt !== base) {
                        const localList = m.environmentsByWorkspaceId[key] ?? []
                        const local =
                            localList.find((e) => e.id === r.id) ??
                            (liveActive ? useAppStore.getState().environments.find((e) => e.id === r.id) : undefined)
                        if (!environmentContentMatchesServer(local, r)) {
                            addConflict({
                                kind: 'environment',
                                entityId: r.id,
                                workspaceId,
                                local: local ?? null,
                                server: r,
                            })
                        }
                    } else {
                        const localList = m.environmentsByWorkspaceId[key] ?? []
                        const localEnv =
                            localList.find((e) => e.id === r.id) ??
                            (liveActive ? useAppStore.getState().environments.find((e) => e.id === r.id) : undefined)
                        nextEnvs.push(localEnv ?? r)
                        m.metaEnv[r.id] = {
                            serverUpdatedAt: r.updatedAt,
                            dirty: true,
                            baseServerUpdatedAt: meta.baseServerUpdatedAt ?? meta.serverUpdatedAt,
                        }
                        continue
                    }
                }

                nextEnvs.push(r)
                m.metaEnv[r.id] = { serverUpdatedAt: r.updatedAt, dirty: false }
            }

            const includedIds = new Set(nextEnvs.map((e) => e.id))
            const pendingTempEnvIds = new Set<number>([...pendingCreateTemp, ...pendingPatchTemp])
            for (const tempId of pendingTempEnvIds) {
                if (pendingEnvDelIds.has(tempId)) continue
                if (includedIds.has(tempId)) continue
                const localList = m.environmentsByWorkspaceId[key] ?? []
                const localEnv =
                    localList.find((e) => e.id === tempId) ??
                    (liveActive ? useAppStore.getState().environments.find((e) => e.id === tempId) : undefined)
                if (!localEnv) continue
                nextEnvs.push(localEnv)
                if (!m.metaEnv[tempId]) {
                    m.metaEnv[tempId] = { serverUpdatedAt: localEnv.updatedAt, dirty: true }
                }
            }

            m.environmentsByWorkspaceId[key] = structuredClone(nextEnvs)
        }

        for (let i = 0; i < remoteWs.length; i++) {
            mergeRemoteEnvs(remoteWs[i]!.id, envResults[i]?.data?.data ?? [])
        }

        const nextEnvs = snap.getWorkspaceEnvSlice(wid)

        // ── 6. Update workspace meta ─────────────────────────────────────────
        for (const w of mergedWorkspaces) {
            if (!m.metaWorkspace[w.id]) {
                m.metaWorkspace[w.id] = { serverUpdatedAt: w.updatedAt, dirty: false }
            }
        }

        // ── 7. Commit snapshot & apply to UI ─────────────────────────────────
        // Use structuredClone so snapshot arrays are decoupled from Immer store
        // (Immer freezes state objects; sharing refs causes "readonly" errors).
        m.workspaces = structuredClone(mergedWorkspaces)
        m.activeWorkspaceId = wid
        m.lastSyncedAt = Date.now()
        snap.replaceMemorySnapshot(m)

        useAppStore.getState().applyRemotePullBundle({
            workspaces: mergedWorkspaces,
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
        console.error('[sync] pullRemoteFull ERROR:', e)
        disarmPullingIndicator()
        useSyncStore.getState().setSyncState({ lastError: formatRequestError(e) })
        return false
    }
}

// ---------------------------------------------------------------------------
// Outbox push
// ---------------------------------------------------------------------------

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
        } catch { /* ignore */ }
    }
    return null
}

async function squashTempEnvironmentOps(replicaKey: string, tempId: number, realId: number) {
    const ops = await listPending(replicaKey)
    for (const o of ops) {
        if (o.type === 'environment_patch' && o.environmentId === tempId) {
            // Upgrade patch to the real server ID so it doesn't fail with 404
            await removeOp(o.id)
            await enqueueOp({ ...o, id: undefined, environmentId: realId, replicaKey })
        } else if (o.type === 'environment_delete' && o.environmentId === tempId) {
            await removeOp(o.id)
            await enqueueOp({
                type: 'environment_delete',
                replicaKey,
                workspaceId: o.workspaceId,
                environmentId: realId,
            })
        }
    }
}

async function squashTempCollectionPatches(replicaKey: string, tempId: number, realId: number) {
    const ops = await listPending(replicaKey)
    for (const o of ops) {
        if (o.type === 'collection_patch' && o.collectionId === tempId) {
            // Stale patch for a temp ID — discard
            await removeOp(o.id)
        } else if (o.type === 'collection_delete' && o.collectionId === tempId) {
            // User deleted the collection before it synced — upgrade to the real server ID
            await removeOp(o.id)
            await enqueueOp({
                type: 'collection_delete',
                replicaKey,
                collectionId: realId,
                workspaceId: o.workspaceId,
            })
        }
    }
}

async function maybeEnqueueInitialCollectionPatch(replicaKey: string, created: Collection, workspaceId: number) {
    const live = useAppStore.getState().collections.find((c) => c.id === created.id)
    if (!live) return
    const itemsSame = JSON.stringify(live.items ?? []) === JSON.stringify(created.items ?? [])
    const nameSame = live.name === created.name
    if (itemsSame && nameSame) return
    const body: Record<string, unknown> = {}
    if (!nameSame) body.name = live.name
    if (!itemsSame) body.items = live.items
    await enqueueOp({ type: 'collection_patch', replicaKey, collectionId: created.id, workspaceId, body, expectedUpdatedAt: created.updatedAt })
}

async function handleStale409(op: OutboxOp, serverEntity: unknown) {
    if (op.type === 'collection_patch') {
        const srv = serverEntity as Collection
        addConflict({
            kind: 'collection',
            entityId: op.collectionId,
            workspaceId: op.workspaceId,
            local: snap.getWorkspaceSlice(op.workspaceId).find((c) => c.id === op.collectionId),
            server: srv,
            outboxOpId: op.id,
        })
    } else if (op.type === 'workspace_patch') {
        addConflict({
            kind: 'workspace',
            entityId: op.workspaceId,
            local: useAppStore.getState().workspaces.find((w) => w.id === op.workspaceId),
            server: serverEntity as Workspace,
            outboxOpId: op.id,
        })
    } else if (op.type === 'environment_patch') {
        const wid = op.workspaceId
        const local =
            snap.getWorkspaceEnvSlice(wid).find((x) => x.id === op.environmentId) ??
            useAppStore.getState().environments.find((x) => x.id === op.environmentId)
        addConflict({
            kind: 'environment',
            entityId: op.environmentId,
            workspaceId: wid,
            local: local ?? null,
            server: serverEntity as Environment,
            outboxOpId: op.id,
        })
    }
}

async function processOneOp(op: OutboxOp) {
    if (op.type === 'collection_patch') {
        const mem = snap.getMemorySnapshot()
        const meta = mem?.metaCollection[op.collectionId]
        const live = useAppStore.getState().activeWorkspaceId === op.workspaceId
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
        // Resolve workspaceId: outbox op may reference a temp/stale ID.
        // Positive IDs are real server IDs — use directly.
        // Negative/zero IDs are temp IDs that need workspace_create to complete first.
        const mem = snap.getMemorySnapshot()
        const serverWsIds = new Set((mem?.workspaces ?? []).map((w) => w.id).filter((id) => id > 0))
        const isValidServer = (id: number) => id > 0 && serverWsIds.has(id)

        let wsId = op.workspaceId
        if (wsId <= 0) {
            // Temp workspace ID — wait for the workspace_create op to settle first
            wsId =
                (mem?.activeWorkspaceId && mem.activeWorkspaceId > 0 ? mem.activeWorkspaceId : null) ??
                useAppStore.getState().workspaces.find((w) => w.id > 0)?.id ??
                0
            if (!wsId) throw new Error('no valid workspace yet — will retry on next sync')
        } else if (!isValidServer(wsId) && serverWsIds.size > 0) {
            // Server workspace list is loaded but doesn't include this ID — use active workspace
            wsId =
                (mem?.activeWorkspaceId && mem.activeWorkspaceId > 0 ? mem.activeWorkspaceId : null) ??
                useAppStore.getState().workspaces.find((w) => w.id > 0)?.id ??
                wsId // fall back to original if nothing better
        }

        const res = await apiClient.post<{ data: Collection }>('/collections', { ...op.body, workspaceId: wsId })
        const c = res.data.data
        await squashTempCollectionPatches(op.replicaKey, op.tempId, c.id)
        if (useAppStore.getState().activeWorkspaceId === wsId) {
            useAppStore.getState().replaceCollection(op.tempId, c)
            snap.setWorkspaceSlice(wsId, useAppStore.getState().collections)
        } else {
            // Collection belongs to a non-active workspace — update snapshot directly
            const slice = snap.getWorkspaceSlice(wsId)
            const idx = slice.findIndex((col) => col.id === op.tempId)
            if (idx !== -1) slice[idx] = c
            else slice.push(c)
            snap.setWorkspaceSlice(wsId, slice)
        }
        const memPost = snap.getMemorySnapshot()
        if (memPost) {
            delete memPost.metaCollection[op.tempId]
            memPost.metaCollection[c.id] = { serverUpdatedAt: c.updatedAt, dirty: false }
        }
        await maybeEnqueueInitialCollectionPatch(op.replicaKey, c, wsId)
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
        const memDel = snap.getMemorySnapshot()
        if (memDel) delete memDel.metaCollection[op.collectionId]
        await snap.persistSnapshotNow()

    } else if (op.type === 'workspace_patch') {
        const mem = snap.getMemorySnapshot()
        const meta = mem?.metaWorkspace[op.workspaceId]
        const live = useAppStore.getState().workspaces.find((w) => w.id === op.workspaceId)
        const exp = op.expectedUpdatedAt ?? meta?.baseServerUpdatedAt ?? meta?.serverUpdatedAt ?? live?.updatedAt
        const res = await apiClient.patch<{ data: Workspace }>(`/workspaces/${op.workspaceId}`, {
            ...op.body,
            expectedUpdatedAt: exp,
        })
        const w = structuredClone(res.data.data)
        snap.clearDirtyMeta('workspace', op.workspaceId, w.updatedAt)
        const memWs = snap.getMemorySnapshot()
        if (memWs) {
            const idx = memWs.workspaces.findIndex((x) => x.id === w.id)
            if (idx !== -1) memWs.workspaces[idx] = w
        }
        useAppStore.getState().updateWorkspace(op.workspaceId, w)
        await snap.persistSnapshotNow()

    } else if (op.type === 'workspace_create') {
        const inStore = useAppStore.getState().workspaces.some((w) => w.id === op.tempId)
        const inMem = snap.getMemorySnapshot()?.workspaces.some((w) => w.id === op.tempId) ?? false
        if (!inStore && !inMem) {
            // Still create on server — otherwise push removes this op and the workspace is lost
            // (e.g. pull/UI dropped the temp row before this run).
            const res = await apiClient.post<{ data: Workspace }>('/workspaces', op.body)
            const w = structuredClone(res.data.data)
            const app = useAppStore.getState()
            if (!app.workspaces.some((x) => x.id === w.id)) app.addWorkspace(w)
            const mem = snap.getMemorySnapshot()
            if (mem && !mem.workspaces.some((x) => x.id === w.id)) {
                mem.workspaces.push(w)
                mem.metaWorkspace[w.id] = { serverUpdatedAt: w.updatedAt, dirty: false }
            }
            await snap.persistSnapshotNow()
            return
        }

        const res = await apiClient.post<{ data: Workspace }>('/workspaces', op.body)
        const w = structuredClone(res.data.data)

        const app = useAppStore.getState()
        const alreadyInStore = app.workspaces.some((x) => x.id === w.id)
        if (alreadyInStore) {
            // Real workspace already in store (from pull) — just drop the temp entry
            app.removeWorkspace(op.tempId as number)
            if (app.activeWorkspaceId === op.tempId) {
                app.setActiveWorkspaceId(w.id)
                try { localStorage.setItem('zreq_workspace_id', String(w.id)) } catch { /* ignore */ }
            }
        } else {
            app.replaceWorkspace(op.tempId as number, w)
        }

        const mem = snap.getMemorySnapshot()
        if (mem) {
            delete mem.metaWorkspace[op.tempId]
            mem.metaWorkspace[w.id] = { serverUpdatedAt: w.updatedAt, dirty: false }
            const idx = mem.workspaces.findIndex((x) => x.id === op.tempId)
            if (idx !== -1) mem.workspaces[idx] = w
            else if (!mem.workspaces.some((x) => x.id === w.id)) mem.workspaces.push(w)
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
                delete mem.environmentsByWorkspaceId[String(op.workspaceId)]
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
            delete mem.environmentsByWorkspaceId[String(op.workspaceId)]
        }
        await snap.persistSnapshotNow()

    } else if (op.type === 'environment_patch') {
        const mem = snap.getMemorySnapshot()
        const wid =
            op.workspaceId ??
            mem?.activeWorkspaceId ??
            useAppStore.getState().activeWorkspaceId ??
            0
        if (!wid) throw new Error('environment_patch missing workspace')
        const meta = mem?.metaEnv[op.environmentId]
        const live =
            useAppStore.getState().activeWorkspaceId === wid
                ? useAppStore.getState().environments.find((e) => e.id === op.environmentId)
                : snap.getWorkspaceEnvSlice(wid).find((e) => e.id === op.environmentId)
        const exp = op.expectedUpdatedAt ?? meta?.baseServerUpdatedAt ?? meta?.serverUpdatedAt ?? live?.updatedAt
        const res = await apiClient.patch<{ data: Environment }>(`/environments/${op.environmentId}`, {
            ...op.body,
            expectedUpdatedAt: exp,
        })
        const e = res.data.data
        snap.clearDirtyMeta('environment', op.environmentId, e.updatedAt)
        snap.applyServerEnvironment(wid, e, { overwriteLocal: true })
        if (useAppStore.getState().activeWorkspaceId === wid) {
            useAppStore.getState().updateEnvironment(op.environmentId, e)
        }
        await snap.persistSnapshotNow()

    } else if (op.type === 'environment_create') {
        const wid =
            op.workspaceId ??
            snap.getMemorySnapshot()?.activeWorkspaceId ??
            useAppStore.getState().activeWorkspaceId ??
            0
        if (!wid) throw new Error('environment_create missing workspace')
        const inStore = useAppStore.getState().environments.some((e) => e.id === op.tempId)
        const inMem =
            snap.getMemorySnapshot()?.environmentsByWorkspaceId[String(wid)]?.some((e) => e.id === op.tempId) ??
            false
        if (!inStore && !inMem) return

        const res = await apiClient.post<{ data: Environment }>('/environments', {
            ...op.body,
            workspaceId: wid,
        })
        const e = res.data.data
        await squashTempEnvironmentOps(op.replicaKey, op.tempId, e.id)
        const app = useAppStore.getState()
        const alreadyInStore = app.environments.some((x) => x.id === e.id)
        if (alreadyInStore) {
            app.removeEnvironment(op.tempId)
            if (app.activeEnvironmentId === op.tempId) {
                app.setActiveEnvironmentId(e.id)
            }
        } else {
            app.replaceEnvironment(op.tempId, e)
        }
        const mem = snap.getMemorySnapshot()
        if (mem) {
            delete mem.metaEnv[op.tempId]
            mem.metaEnv[e.id] = { serverUpdatedAt: e.updatedAt, dirty: false }
            const key = String(wid)
            const list = mem.environmentsByWorkspaceId[key] ?? []
            const idx = list.findIndex((x) => x.id === op.tempId)
            if (idx !== -1) list[idx] = e
            else if (!list.some((x) => x.id === e.id)) list.push(e)
            mem.environmentsByWorkspaceId[key] = list
        }
        await snap.persistSnapshotNow()

    } else if (op.type === 'environment_delete') {
        const wid =
            op.workspaceId ??
            snap.getMemorySnapshot()?.activeWorkspaceId ??
            useAppStore.getState().activeWorkspaceId ??
            0
        if (op.environmentId < 0) {
            useAppStore.getState().removeEnvironment(op.environmentId)
            const mem = snap.getMemorySnapshot()
            if (mem && wid) {
                snap.removeEnvironmentLocal(wid, op.environmentId)
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
        const memDel = snap.getMemorySnapshot()
        if (memDel && wid) {
            snap.removeEnvironmentLocal(wid, op.environmentId)
        }
        await snap.persistSnapshotNow()
    }
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
                await removeOp(op.id)
            } else if (isPermanentOutboxError(e)) {
                // Permanent API errors should not block the rest of the queue.
                await removeOp(op.id)
                useSyncStore.getState().setSyncState({ lastError: formatRequestError(e) })
            } else {
                useSyncStore.getState().setSyncState({ lastError: formatRequestError(e) })
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

export function pullThenPush(): Promise<void> {
    const p = pullPushChain.then(() =>
        runPullThenPushOnce().catch(() => { /* errors recorded on sync store */ })
    )
    pullPushChain = p.catch(() => {})
    return p
}

// ---------------------------------------------------------------------------
// Startup hydration (offline fallback)
//
// Only shows cached data when the app is offline or the initial pull
// hasn't completed yet. Once pullRemoteFull succeeds, server data takes over.
// ---------------------------------------------------------------------------

export function hydrateFromMemorySnapshot() {
    const mem = snap.getMemorySnapshot()
    if (!mem) return
    useAppStore.getState().setWorkspaces(mem.workspaces)
    if (mem.workspaces.length > 0) {
        const wsIds = new Set(mem.workspaces.map((w) => w.id))
        let savedWid: number | null = null
        try {
            const raw = localStorage.getItem('zreq_workspace_id')
            if (raw) savedWid = parseInt(raw, 10)
        } catch { /* ignore */ }
        const validSavedWid = savedWid != null && wsIds.has(savedWid) ? savedWid : null
        if (savedWid != null && validSavedWid == null) {
            // localStorage points to a deleted workspace — clear it so pull can reset it cleanly
            try { localStorage.removeItem('zreq_workspace_id') } catch { /* ignore */ }
        }
        const wid =
            validSavedWid ??
            (mem.activeWorkspaceId != null && wsIds.has(mem.activeWorkspaceId) ? mem.activeWorkspaceId : null) ??
            mem.workspaces[0]?.id ?? null
        if (wid != null) {
            useAppStore.getState().setActiveWorkspaceId(wid)
            useAppStore.getState().setCollections(mem.collectionsByWorkspaceId[String(wid)] ?? [])
            useAppStore.getState().setEnvironments(mem.environmentsByWorkspaceId[String(wid)] ?? [])
        } else {
            useAppStore.getState().setEnvironments([])
        }
    } else {
        useAppStore.getState().setEnvironments([])
    }
}

export async function hydrateFromDiskIfNeeded(): Promise<boolean> {
    const key = getReplicaKeyOrNull()
    if (!key) return false

    // Skip if a successful remote pull has already hydrated the store
    if (useSyncStore.getState().lastSyncedAt != null) {
        console.log('[sync] hydrateFromDiskIfNeeded: skipped (pull already ran)')
        return false
    }

    await snap.loadSnapshotForReplica(key)
    const mem = snap.getMemorySnapshot()
    if (!mem || (mem.workspaces.length === 0 && Object.keys(mem.collectionsByWorkspaceId).length === 0)) {
        return false
    }
    console.log('[sync] hydrateFromDiskIfNeeded: hydrating from disk snapshot')
    hydrateFromMemorySnapshot()
    const pending = await listPending(key)
    useSyncStore.getState().setSyncState({ pendingOutbox: pending.length })
    return true
}
