import type { OutboxOp, ReplicaSnapshot } from './types'

const DB_NAME = 'zreq_local'
const DB_VERSION = 1

const SNAPSHOTS = 'snapshots'
const OUTBOX = 'outbox'

let dbSingleton: Promise<IDBDatabase> | null = null

export function openLocalDb(): Promise<IDBDatabase> {
    if (!dbSingleton) {
        dbSingleton = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION)
            req.onerror = () => reject(req.error)
            req.onsuccess = () => resolve(req.result)
            req.onupgradeneeded = () => {
                const db = req.result
                if (!db.objectStoreNames.contains(SNAPSHOTS)) {
                    db.createObjectStore(SNAPSHOTS, { keyPath: 'replicaKey' })
                }
                if (!db.objectStoreNames.contains(OUTBOX)) {
                    const ob = db.createObjectStore(OUTBOX, { keyPath: 'id' })
                    ob.createIndex('replicaKey', 'replicaKey', { unique: false })
                }
            }
        })
    }
    return dbSingleton
}

function txDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
    })
}

export async function idbGetSnapshot(db: IDBDatabase, replicaKey: string): Promise<ReplicaSnapshot | null> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(SNAPSHOTS, 'readonly')
        const req = tx.objectStore(SNAPSHOTS).get(replicaKey)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve((req.result as ReplicaSnapshot | undefined) ?? null)
    })
}

export async function idbPutSnapshot(db: IDBDatabase, snapshot: ReplicaSnapshot): Promise<void> {
    const tx = db.transaction(SNAPSHOTS, 'readwrite')
    tx.objectStore(SNAPSHOTS).put(snapshot)
    await txDone(tx)
}

export async function idbAddOutbox(db: IDBDatabase, op: OutboxOp): Promise<void> {
    const tx = db.transaction(OUTBOX, 'readwrite')
    tx.objectStore(OUTBOX).put(op)
    await txDone(tx)
}

export async function idbDeleteOutbox(db: IDBDatabase, id: string): Promise<void> {
    const tx = db.transaction(OUTBOX, 'readwrite')
    tx.objectStore(OUTBOX).delete(id)
    await txDone(tx)
}

export async function idbListOutboxForReplica(db: IDBDatabase, replicaKey: string): Promise<OutboxOp[]> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(OUTBOX, 'readonly')
        const idx = tx.objectStore(OUTBOX).index('replicaKey')
        const req = idx.getAll(replicaKey)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
            const list = (req.result as OutboxOp[]) ?? []
            list.sort((a, b) => a.createdAt - b.createdAt)
            resolve(list)
        }
    })
}
