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
