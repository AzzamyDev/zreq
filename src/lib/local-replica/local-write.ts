import { useAppStore } from '@/store'
import { useAuthStore } from '@/store/authStore'
import type { Collection, Environment, Workspace } from '@/types'
import * as snap from './snapshot-store'
import { enqueueOp } from './outbox-ops'
import { getReplicaKeyOrNull, ensureReplicaLoaded, schedulePushOutbox } from './sync-engine'
import { useSyncStore } from '@/store/syncStore'

function expectedCollection(id: number): string | undefined {
    const m = snap.getMemorySnapshot()?.metaCollection[id]
    return m?.baseServerUpdatedAt ?? m?.serverUpdatedAt
}

function expectedWorkspace(id: number): string | undefined {
    const m = snap.getMemorySnapshot()?.metaWorkspace[id]
    return m?.baseServerUpdatedAt ?? m?.serverUpdatedAt
}

function expectedEnv(id: number): string | undefined {
    const m = snap.getMemorySnapshot()?.metaEnv[id]
    return m?.baseServerUpdatedAt ?? m?.serverUpdatedAt
}

export function seedCollectionMetaFromRow(c: Collection) {
    snap.applyMemory((mem) => {
        if (!mem.metaCollection[c.id]) {
            mem.metaCollection[c.id] = { serverUpdatedAt: c.updatedAt, dirty: false }
        }
    })
}

export function seedWorkspaceMetaFromRow(w: Workspace) {
    snap.applyMemory((mem) => {
        if (!mem.metaWorkspace[w.id]) {
            mem.metaWorkspace[w.id] = { serverUpdatedAt: w.updatedAt, dirty: false }
        }
    })
}

export function seedEnvMetaFromRow(e: Environment) {
    snap.applyMemory((mem) => {
        if (!mem.metaEnv[e.id]) {
            mem.metaEnv[e.id] = { serverUpdatedAt: e.updatedAt, dirty: false }
        }
    })
}

async function bumpPending() {
    const key = getReplicaKeyOrNull()
    if (key) {
        const { listPending } = await import('./outbox-ops')
        const n = (await listPending(key)).length
        useSyncStore.getState().setSyncState({ pendingOutbox: n })
    }
}

export async function writeCollectionPatch(collectionId: number, body: Record<string, unknown>) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    const wid = useAppStore.getState().activeWorkspaceId
    if (wid == null) return
    snap.applyMemory((mem) => {
        if (mem.metaCollection[collectionId]) return
        const c = useAppStore.getState().collections.find((x) => x.id === collectionId)
        if (c) mem.metaCollection[collectionId] = { serverUpdatedAt: c.updatedAt, dirty: false }
    })
    const row = useAppStore.getState().collections.find((x) => x.id === collectionId)
    const exp = expectedCollection(collectionId) ?? row?.updatedAt
    snap.markCollectionDirty(collectionId)
    snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
    await enqueueOp({
        type: 'collection_patch',
        replicaKey: key,
        collectionId,
        workspaceId: wid,
        body,
        expectedUpdatedAt: exp,
    })
    await bumpPending()
    schedulePushOutbox()
}

/** Optimistic collection (new or import) with optional tree `items`. */
export async function createLocalCollection(name: string, items: unknown[] = []) {
    const wid = useAppStore.getState().activeWorkspaceId
    const user = useAuthStore.getState().user
    if (wid == null || !user) return null
    const tempId = -Math.floor(Math.random() * 1e12 + Date.now())
    const now = new Date().toISOString()
    const col: Collection = {
        id: tempId,
        name,
        items: items as Collection['items'],
        userId: user.id,
        workspaceId: wid,
        createdAt: now,
        updatedAt: now,
    }
    useAppStore.getState().addCollection(col)
    await ensureReplicaLoaded()
    snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
    snap.applyMemory((mem) => {
        mem.metaCollection[tempId] = { serverUpdatedAt: now, dirty: false }
    })
    await writeCollectionCreate(tempId, { name, items, workspaceId: wid })
    return col
}

export async function writeCollectionCreate(tempId: number, payload: { name: string; items: unknown[]; workspaceId: number }) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    await enqueueOp({
        type: 'collection_create',
        replicaKey: key,
        workspaceId: payload.workspaceId,
        tempId,
        body: payload,
    })
    await bumpPending()
    schedulePushOutbox()
}

export async function writeCollectionDelete(collectionId: number, workspaceId: number) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    await enqueueOp({
        type: 'collection_delete',
        replicaKey: key,
        collectionId,
        workspaceId,
    })
    await bumpPending()
    schedulePushOutbox()
}

export async function writeWorkspacePatch(workspaceId: number, body: { name: string }) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    snap.applyMemory((mem) => {
        if (mem.metaWorkspace[workspaceId]) return
        const w = useAppStore.getState().workspaces.find((x) => x.id === workspaceId)
        if (w) mem.metaWorkspace[workspaceId] = { serverUpdatedAt: w.updatedAt, dirty: false }
    })
    const wrow = useAppStore.getState().workspaces.find((x) => x.id === workspaceId)
    const exp = expectedWorkspace(workspaceId) ?? wrow?.updatedAt
    snap.markWorkspaceDirty(workspaceId)
    await enqueueOp({
        type: 'workspace_patch',
        replicaKey: key,
        workspaceId,
        body,
        expectedUpdatedAt: exp,
    })
    await bumpPending()
    schedulePushOutbox()
}

export async function writeWorkspaceCreate(tempId: number, body: { name: string }) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    await enqueueOp({
        type: 'workspace_create',
        replicaKey: key,
        tempId,
        body,
    })
    await bumpPending()
    schedulePushOutbox()
}

export async function writeWorkspaceDelete(workspaceId: number) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    await enqueueOp({
        type: 'workspace_delete',
        replicaKey: key,
        workspaceId,
    })
    await bumpPending()
    schedulePushOutbox()
}

export async function writeEnvironmentPatch(environmentId: number, body: Record<string, unknown>) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    snap.applyMemory((mem) => {
        if (mem.metaEnv[environmentId]) return
        const e = useAppStore.getState().environments.find((x) => x.id === environmentId)
        if (e) mem.metaEnv[environmentId] = { serverUpdatedAt: e.updatedAt, dirty: false }
    })
    const erow = useAppStore.getState().environments.find((x) => x.id === environmentId)
    const exp = expectedEnv(environmentId) ?? erow?.updatedAt
    snap.markEnvDirty(environmentId)
    snap.applyMemory((mem) => {
        mem.environments = structuredClone(useAppStore.getState().environments)
    })
    await enqueueOp({
        type: 'environment_patch',
        replicaKey: key,
        environmentId,
        body,
        expectedUpdatedAt: exp,
    })
    await bumpPending()
    schedulePushOutbox()
}

export async function writeEnvironmentCreate(
    tempId: number,
    body: { name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }
) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    await enqueueOp({
        type: 'environment_create',
        replicaKey: key,
        tempId,
        body,
    })
    await bumpPending()
    schedulePushOutbox()
}

export async function writeEnvironmentDelete(environmentId: number) {
    const key = getReplicaKeyOrNull()
    if (!key) return
    await ensureReplicaLoaded()
    await enqueueOp({
        type: 'environment_delete',
        replicaKey: key,
        environmentId,
    })
    await bumpPending()
    schedulePushOutbox()
}
