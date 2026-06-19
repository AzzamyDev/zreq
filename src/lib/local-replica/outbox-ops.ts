import { nanoid } from 'nanoid'
import type { OutboxOp } from './types'
import { idbAddOutbox, idbDeleteOutbox, idbListOutboxForReplica, openLocalDb } from './db'

/** Accepts any outbox payload variant; `Omit<Union>` breaks excess-property checks on literals. */
export async function enqueueOp(
    op: Omit<OutboxOp, 'id' | 'createdAt'> & { id?: string } & Record<string, unknown>
): Promise<string> {
    const db = await openLocalDb()
    const id = (op.id as string | undefined) ?? nanoid()
    const full: OutboxOp = { ...op, id, createdAt: Date.now() } as OutboxOp
    await idbAddOutbox(db, full)
    return id
}

export async function removeOp(id: string) {
    const db = await openLocalDb()
    await idbDeleteOutbox(db, id)
}

export async function listPending(replicaKey: string): Promise<OutboxOp[]> {
    const db = await openLocalDb()
    return idbListOutboxForReplica(db, replicaKey)
}

type PatchEntity =
    | { kind: 'collection'; collectionId: number }
    | { kind: 'workspace'; workspaceId: number }
    | { kind: 'environment'; environmentId: number }

function isPatchOpForEntity(op: OutboxOp, entity: PatchEntity): boolean {
    if (entity.kind === 'collection') {
        return op.type === 'collection_patch' && op.collectionId === entity.collectionId
    }
    if (entity.kind === 'workspace') {
        return op.type === 'workspace_patch' && op.workspaceId === entity.workspaceId
    }
    return op.type === 'environment_patch' && op.environmentId === entity.environmentId
}

/** Merge pending patch ops for the same entity into one outbox entry (latest body wins). */
export async function enqueueCoalescedPatch(
    replicaKey: string,
    predicate: (op: OutboxOp) => boolean,
    newOp: Omit<OutboxOp, 'id' | 'createdAt'> & { id?: string } & Record<string, unknown>
): Promise<string> {
    const pending = await listPending(replicaKey)
    const matching = pending.filter(predicate)
    let mergedBody: Record<string, unknown> = {}
    for (const op of matching) {
        if ('body' in op && op.body && typeof op.body === 'object') {
            mergedBody = { ...mergedBody, ...(op.body as Record<string, unknown>) }
        }
        await removeOp(op.id)
    }
    if (newOp.body && typeof newOp.body === 'object') {
        mergedBody = { ...mergedBody, ...(newOp.body as Record<string, unknown>) }
    }
    return enqueueOp({ ...newOp, body: mergedBody })
}

/** Remove other pending patch ops for the same entity (safety net after a successful push). */
export async function removeSiblingPatchOps(
    replicaKey: string,
    entity: PatchEntity,
    exceptOpId?: string
): Promise<void> {
    const ops = await listPending(replicaKey)
    for (const op of ops) {
        if (exceptOpId && op.id === exceptOpId) continue
        if (isPatchOpForEntity(op, entity)) {
            await removeOp(op.id)
        }
    }
}

/** Remove pending patch (+ optional delete) ops for an entity (used when resolving conflicts). */
export async function removeSiblingOutboxOps(
    replicaKey: string,
    kind: 'collection' | 'workspace' | 'environment',
    entityId: number,
    options?: { includeDeletes?: boolean; exceptOpId?: string }
): Promise<void> {
    const includeDeletes = options?.includeDeletes ?? false
    const ops = await listPending(replicaKey)
    for (const op of ops) {
        if (options?.exceptOpId && op.id === options.exceptOpId) continue
        if (kind === 'collection') {
            if (op.type === 'collection_patch' && op.collectionId === entityId) {
                await removeOp(op.id)
            } else if (includeDeletes && op.type === 'collection_delete' && op.collectionId === entityId) {
                await removeOp(op.id)
            }
        } else if (kind === 'workspace') {
            if (op.type === 'workspace_patch' && op.workspaceId === entityId) {
                await removeOp(op.id)
            } else if (includeDeletes && op.type === 'workspace_delete' && op.workspaceId === entityId) {
                await removeOp(op.id)
            }
        } else if (kind === 'environment') {
            if (op.type === 'environment_patch' && op.environmentId === entityId) {
                await removeOp(op.id)
            } else if (includeDeletes && op.type === 'environment_delete' && op.environmentId === entityId) {
                await removeOp(op.id)
            }
        }
    }
}
