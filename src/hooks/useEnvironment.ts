import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store'
import type { Environment } from '../types'
import * as snap from '@/lib/local-replica/snapshot-store'
import { ensureReplicaLoaded } from '@/lib/local-replica/sync-engine'
import {
    writeEnvironmentCreate,
    writeEnvironmentDelete,
    writeEnvironmentPatch,
} from '@/lib/local-replica/local-write'

export function useEnvironment() {
    const { setEnvironments, updateEnvironment, removeEnvironment, setActiveEnvironmentId } = useAppStore()

    const createEnvironment = async (
        name: string,
        variables?: Array<{ key: string; value: string; enabled: boolean }>
    ) => {
        const user = useAuthStore.getState().user
        if (!user) return
        const tempId = -Math.floor(Math.random() * 1e12 + Date.now())
        const now = new Date().toISOString()
        const env: Environment = {
            id: tempId,
            name,
            variables: variables ?? [],
            userId: user.id,
            createdAt: now,
            updatedAt: now,
        }
        setEnvironments([...useAppStore.getState().environments, env])
        await ensureReplicaLoaded()
        snap.applyMemory((m) => {
            m.environments = [...useAppStore.getState().environments]
            m.metaEnv[tempId] = { serverUpdatedAt: now, dirty: false }
        })
        await snap.persistSnapshotNow()
        await writeEnvironmentCreate(tempId, { name, variables: variables ?? [] })
        return env
    }

    const updateVariables = async (id: number, variables: Array<{ key: string; value: string; enabled: boolean }>) => {
        updateEnvironment(id, { variables })
        await writeEnvironmentPatch(id, { variables })
    }

    const renameEnvironment = async (id: number, name: string) => {
        updateEnvironment(id, { name })
        await writeEnvironmentPatch(id, { name })
    }

    const deleteEnvironment = async (id: number) => {
        removeEnvironment(id)
        await ensureReplicaLoaded()
        const mem = snap.getMemorySnapshot()
        if (mem) {
            mem.environments = useAppStore.getState().environments
            delete mem.metaEnv[id]
        }
        await snap.persistSnapshotNow()
        await writeEnvironmentDelete(id)
    }

    return { createEnvironment, updateVariables, renameEnvironment, deleteEnvironment, setActiveEnvironmentId }
}
