import type { Collection, Environment, Workspace } from '@/types'
import { emptySnapshot, type EntityMeta, type ReplicaSnapshot } from './types'
import { idbGetSnapshot, idbPutSnapshot, openLocalDb } from './db'

let memory: ReplicaSnapshot | null = null
let currentReplicaKey: string | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

export function getMemorySnapshot(): ReplicaSnapshot | null {
    return memory
}

export function getCurrentReplicaKey(): string | null {
    return currentReplicaKey
}

export function setCurrentReplicaKey(key: string | null) {
    currentReplicaKey = key
    if (key == null) memory = null
}

function ensureEnvironmentsByWorkspaceShape(m: ReplicaSnapshot) {
    const r = m as ReplicaSnapshot & { environments?: Environment[] }
    if (r.environmentsByWorkspaceId != null && typeof r.environmentsByWorkspaceId === 'object') {
        delete r.environments
        return
    }
    r.environmentsByWorkspaceId = {}
    const legacy = r.environments
    if (legacy?.length) {
        for (const e of legacy) {
            const wid = e.workspaceId ?? r.activeWorkspaceId ?? r.workspaces[0]?.id ?? 0
            const k = String(wid)
            const cur = r.environmentsByWorkspaceId[k] ?? []
            cur.push(structuredClone(e))
            r.environmentsByWorkspaceId[k] = cur
        }
    }
    delete r.environments
}

export async function loadSnapshotForReplica(replicaKey: string): Promise<ReplicaSnapshot> {
    const db = await openLocalDb()
    const row = await idbGetSnapshot(db, replicaKey)
    memory = row ? structuredClone(row) : emptySnapshot(replicaKey)
    ensureEnvironmentsByWorkspaceShape(memory)
    currentReplicaKey = replicaKey
    return memory
}

export function applyMemory(mutator: (s: ReplicaSnapshot) => void) {
    if (!memory || !currentReplicaKey) return
    mutator(memory)
    schedulePersist()
}

function schedulePersist() {
    if (!memory) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
        persistTimer = null
        void flushPersist()
    }, 120)
}

async function flushPersist() {
    if (!memory) return
    const db = await openLocalDb()
    await idbPutSnapshot(db, structuredClone(memory))
}

export async function persistSnapshotNow() {
    if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
    }
    await flushPersist()
}

/** Replace memory from remote pull (merges meta / dirty rules in sync-engine before calling). */
export function replaceMemorySnapshot(next: ReplicaSnapshot) {
    memory = structuredClone(next)
    currentReplicaKey = next.replicaKey
    schedulePersist()
}

export function markCollectionDirty(collectionId: number) {
    if (!memory) return
    const prev = memory.metaCollection[collectionId]
    if (prev?.dirty) {
        schedulePersist()
        return
    }
    const serverUpdatedAt = prev?.serverUpdatedAt ?? new Date(0).toISOString()
    memory.metaCollection[collectionId] = {
        serverUpdatedAt,
        dirty: true,
        baseServerUpdatedAt: serverUpdatedAt,
    }
    schedulePersist()
}

export function markWorkspaceDirty(workspaceId: number) {
    if (!memory) return
    const prev = memory.metaWorkspace[workspaceId]
    if (prev?.dirty) {
        schedulePersist()
        return
    }
    const serverUpdatedAt = prev?.serverUpdatedAt ?? new Date(0).toISOString()
    memory.metaWorkspace[workspaceId] = {
        serverUpdatedAt,
        dirty: true,
        baseServerUpdatedAt: serverUpdatedAt,
    }
    schedulePersist()
}

export function markEnvDirty(environmentId: number) {
    if (!memory) return
    const prev = memory.metaEnv[environmentId]
    if (prev?.dirty) {
        schedulePersist()
        return
    }
    const serverUpdatedAt = prev?.serverUpdatedAt ?? new Date(0).toISOString()
    memory.metaEnv[environmentId] = {
        serverUpdatedAt,
        dirty: true,
        baseServerUpdatedAt: serverUpdatedAt,
    }
    schedulePersist()
}

export function setWorkspaceSlice(workspaceId: number, collections: Collection[]) {
    if (!memory) return
    memory.collectionsByWorkspaceId[String(workspaceId)] = structuredClone(collections)
}

export function getWorkspaceSlice(workspaceId: number): Collection[] {
    if (!memory) return []
    return structuredClone(memory.collectionsByWorkspaceId[String(workspaceId)] ?? [])
}

export function applyServerCollection(
    workspaceId: number,
    col: Collection,
    opts: { overwriteLocal: boolean }
) {
    if (!memory) return
    const key = String(workspaceId)
    const list = memory.collectionsByWorkspaceId[key] ?? []
    const idx = list.findIndex((c) => c.id === col.id)
    const meta = memory.metaCollection[col.id]
    if (meta?.dirty && !opts.overwriteLocal) return
    const next = [...list]
    if (idx === -1) next.push(structuredClone(col))
    else next[idx] = structuredClone(col)
    memory.collectionsByWorkspaceId[key] = next
    memory.metaCollection[col.id] = { serverUpdatedAt: col.updatedAt, dirty: false }
}

export function removeCollectionLocal(workspaceId: number, collectionId: number) {
    if (!memory) return
    const key = String(workspaceId)
    const list = memory.collectionsByWorkspaceId[key] ?? []
    memory.collectionsByWorkspaceId[key] = list.filter((c) => c.id !== collectionId)
    delete memory.metaCollection[collectionId]
}

export function setWorkspacesLocal(ws: Workspace[]) {
    if (!memory) return
    memory.workspaces = structuredClone(ws)
}

export function setWorkspaceEnvSlice(workspaceId: number, envs: Environment[]) {
    if (!memory) return
    memory.environmentsByWorkspaceId[String(workspaceId)] = structuredClone(envs)
}

export function getWorkspaceEnvSlice(workspaceId: number): Environment[] {
    if (!memory) return []
    return structuredClone(memory.environmentsByWorkspaceId[String(workspaceId)] ?? [])
}

export function applyServerEnvironment(
    workspaceId: number,
    env: Environment,
    opts: { overwriteLocal: boolean }
) {
    if (!memory) return
    const key = String(workspaceId)
    const list = memory.environmentsByWorkspaceId[key] ?? []
    const idx = list.findIndex((e) => e.id === env.id)
    const meta = memory.metaEnv[env.id]
    if (meta?.dirty && !opts.overwriteLocal) return
    const next = [...list]
    if (idx === -1) next.push(structuredClone(env))
    else next[idx] = structuredClone(env)
    memory.environmentsByWorkspaceId[key] = next
    memory.metaEnv[env.id] = { serverUpdatedAt: env.updatedAt, dirty: false }
}

export function removeEnvironmentLocal(workspaceId: number, environmentId: number) {
    if (!memory) return
    const key = String(workspaceId)
    const list = memory.environmentsByWorkspaceId[key] ?? []
    memory.environmentsByWorkspaceId[key] = list.filter((e) => e.id !== environmentId)
    delete memory.metaEnv[environmentId]
}

export function setActiveWorkspaceIdLocal(id: number | null) {
    if (!memory) return
    memory.activeWorkspaceId = id
}

export function clearDirtyMeta(
    kind: 'collection' | 'workspace' | 'environment',
    id: number,
    serverUpdatedAt: string
) {
    if (!memory) return
    if (kind === 'collection') {
        memory.metaCollection[id] = { serverUpdatedAt, dirty: false }
    } else if (kind === 'workspace') {
        memory.metaWorkspace[id] = { serverUpdatedAt, dirty: false }
    } else {
        memory.metaEnv[id] = { serverUpdatedAt, dirty: false }
    }
}
