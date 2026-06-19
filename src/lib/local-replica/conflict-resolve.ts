import { apiClient } from '@/lib/api-client'
import { useAppStore } from '@/store'
import { useSyncStore } from '@/store/syncStore'
import type { Collection, Environment, Workspace } from '@/types'
import * as snap from './snapshot-store'
import { removeOp, removeSiblingOutboxOps } from './outbox-ops'
import type { ConflictEntry } from './types'
import { getReplicaKeyOrNull, pullThenPush } from './sync-engine'

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
        const body: Record<string, unknown> = { force: true }
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
            force: true,
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
        const res = await apiClient.patch<{ data: Environment }>(`/environments/${c.entityId}`, {
            name: local.name,
            variables: local.variables,
            force: true,
        })
        const srv = res.data.data
        const wid = c.workspaceId ?? local.workspaceId ?? srv.workspaceId
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
