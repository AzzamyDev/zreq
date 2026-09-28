import { apiClient } from '@/lib/api-client'
import { useAppStore } from '@/store'
import { useAuthStore } from '@/store/authStore'
import { useSyncStore } from '@/store/syncStore'
import type { Collection, Environment, Workspace } from '@/types'
import * as snap from './snapshot-store'
import { removeOp, removeSiblingOutboxOps } from './outbox-ops'
import type { ConflictEntry } from './types'
import { getReplicaKeyOrNull, pullThenPush } from './sync-engine'

/**
 * Extract `updatedAt` from the server snapshot stored in a ConflictEntry.
 * This is the optimistic-lock token the server requires on every "keep local" PATCH.
 */
function getServerUpdatedAt(c: ConflictEntry): string | undefined {
    const srv = c.server
    if (!srv || typeof srv !== 'object') return undefined
    return (srv as Record<string, unknown>).updatedAt as string | undefined
}

/**
 * Returns true when the current user is the owner of the workspace.
 * Only owners may send `force: true`; members must omit it.
 */
function isWorkspaceOwner(workspaceId: number | undefined | null): boolean {
    if (workspaceId == null) return false
    const currentUserId = useAuthStore.getState().user?.id
    if (currentUserId == null) return false
    const ws = useAppStore.getState().workspaces.find((w) => w.id === workspaceId)
    return ws?.userId === currentUserId
}

async function removeSiblingOutboxOpsForConflict(c: ConflictEntry) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await removeSiblingOutboxOps(key, c.kind, c.entityId, { includeDeletes: true })
}

export async function resolveConflictKeepServer(c: ConflictEntry) {
    if (c.outboxOpId) await removeOp(c.outboxOpId)
    await removeSiblingOutboxOpsForConflict(c)

    if (c.kind === 'collection' && c.workspaceId != null) {
        const srv = c.server as Collection
        snap.clearDirtyMeta('collection', srv.id, srv.updatedAt)
        snap.applyServerCollection(c.workspaceId, srv, { overwriteLocal: true })
        if (useAppStore.getState().activeWorkspaceId === c.workspaceId) {
            useAppStore.getState().updateCollection(srv.id, srv)
        }
    } else if (c.kind === 'workspace') {
        const srv = structuredClone(c.server) as Workspace
        snap.clearDirtyMeta('workspace', srv.id, srv.updatedAt)
        useAppStore.getState().updateWorkspace(srv.id, srv)
        const mem = snap.getMemorySnapshot()
        if (mem) {
            const i = mem.workspaces.findIndex((w) => w.id === srv.id)
            if (i !== -1) mem.workspaces[i] = srv
        }
    } else if (c.kind === 'environment') {
        const srv = c.server as Environment
        const wid = c.workspaceId ?? srv.workspaceId
        snap.clearDirtyMeta('environment', srv.id, srv.updatedAt)
        snap.applyServerEnvironment(wid, srv, { overwriteLocal: true })
        if (useAppStore.getState().activeWorkspaceId === wid) {
            useAppStore.getState().updateEnvironment(srv.id, srv)
        }
    }

    await snap.persistSnapshotNow()
    useSyncStore.getState().removeConflict(c.id)
    await pullThenPush()
}

export async function resolveConflictKeepLocal(c: ConflictEntry) {
    if (c.kind === 'collection' && c.workspaceId != null) {
        const local = c.local as Collection | null
        if (!local) {
            await pullThenPush()
            if (c.outboxOpId) await removeOp(c.outboxOpId)
            useSyncStore.getState().removeConflict(c.id)
            return
        }
        const body: Record<string, unknown> = {
            // Server requires expectedUpdatedAt on every PATCH (returns 400 without it).
            expectedUpdatedAt: getServerUpdatedAt(c),
            // force:true lets the server skip its RBAC ownership check, but only
            // the workspace owner is allowed to send it.
            ...(isWorkspaceOwner(c.workspaceId) ? { force: true } : {}),
        }
        if (local.name != null) body.name = local.name
        if (local.items != null) body.items = local.items
        const res = await apiClient.patch<{ data: Collection }>(`/collections/${c.entityId}`, body)
        const srv = res.data.data
        snap.clearDirtyMeta('collection', srv.id, srv.updatedAt)
        snap.applyServerCollection(c.workspaceId, srv, { overwriteLocal: true })
        if (useAppStore.getState().activeWorkspaceId === c.workspaceId) {
            useAppStore.getState().updateCollection(srv.id, srv)
        }
    } else if (c.kind === 'workspace') {
        const local = c.local as Workspace | null
        if (!local) {
            await pullThenPush()
            if (c.outboxOpId) await removeOp(c.outboxOpId)
            useSyncStore.getState().removeConflict(c.id)
            return
        }
        const res = await apiClient.patch<{ data: Workspace }>(`/workspaces/${c.entityId}`, {
            name: local.name,
            expectedUpdatedAt: getServerUpdatedAt(c),
            ...(isWorkspaceOwner(c.entityId) ? { force: true } : {}),
        })
        const srv = structuredClone(res.data.data)
        snap.clearDirtyMeta('workspace', srv.id, srv.updatedAt)
        useAppStore.getState().updateWorkspace(srv.id, srv)
        const mem = snap.getMemorySnapshot()
        if (mem) {
            const i = mem.workspaces.findIndex((w) => w.id === srv.id)
            if (i !== -1) mem.workspaces[i] = srv
        }
    } else if (c.kind === 'environment') {
        const local = c.local as Environment | null
        if (!local) {
            await pullThenPush()
            if (c.outboxOpId) await removeOp(c.outboxOpId)
            useSyncStore.getState().removeConflict(c.id)
            return
        }
        const envWid = c.workspaceId ?? local.workspaceId ?? (c.server as Environment | null)?.workspaceId
        const res = await apiClient.patch<{ data: Environment }>(`/environments/${c.entityId}`, {
            name: local.name,
            variables: local.variables,
            expectedUpdatedAt: getServerUpdatedAt(c),
            ...(isWorkspaceOwner(envWid) ? { force: true } : {}),
        })
        const srv = res.data.data
        const wid = envWid ?? srv.workspaceId
        snap.clearDirtyMeta('environment', srv.id, srv.updatedAt)
        snap.applyServerEnvironment(wid, srv, { overwriteLocal: true })
        if (useAppStore.getState().activeWorkspaceId === wid) {
            useAppStore.getState().updateEnvironment(srv.id, srv)
        }
    }

    await snap.persistSnapshotNow()
    if (c.outboxOpId) await removeOp(c.outboxOpId)
    await removeSiblingOutboxOpsForConflict(c)
    useSyncStore.getState().removeConflict(c.id)
    await pullThenPush()
}
