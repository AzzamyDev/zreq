import { create } from 'zustand'
import type { ConflictEntry } from '@/lib/local-replica/types'

export type SyncUiState = {
    online: boolean
    /** Session-only: block pull & push while browser may still be online (not persisted — sync stays automatic after reload). */
    forceOfflineSync: boolean
    instanceReachable: boolean | null
    pulling: boolean
    pushing: boolean
    pendingOutbox: number
    lastSyncedAt: number | null
    lastError: string | null
    conflicts: ConflictEntry[]
}

type SyncStore = SyncUiState & {
    setOnline: (v: boolean) => void
    setForceOfflineSync: (v: boolean) => void
    setInstanceReachable: (v: boolean | null) => void
    setSyncState: (p: Partial<SyncUiState>) => void
    addConflict: (c: ConflictEntry) => void
    removeConflict: (id: string) => void
    clearConflicts: () => void
}

const initial: SyncUiState = {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    forceOfflineSync: false,
    instanceReachable: null,
    pulling: false,
    pushing: false,
    pendingOutbox: 0,
    lastSyncedAt: null,
    lastError: null,
    conflicts: [],
}

export const useSyncStore = create<SyncStore>()((set) => ({
    ...initial,

    setOnline: (online) => set({ online }),

    setForceOfflineSync: (forceOfflineSync) => set({ forceOfflineSync }),

    setInstanceReachable: (instanceReachable) => set({ instanceReachable }),

    setSyncState: (p) => set((s) => ({ ...s, ...p })),

    addConflict: (c) =>
        set((s) => {
            const rest = s.conflicts.filter((x) => !(x.kind === c.kind && x.entityId === c.entityId))
            return { conflicts: [...rest, c] }
        }),

    removeConflict: (id) =>
        set((s) => ({
            conflicts: s.conflicts.filter((c) => c.id !== id),
        })),

    clearConflicts: () => set({ conflicts: [] }),
}))
