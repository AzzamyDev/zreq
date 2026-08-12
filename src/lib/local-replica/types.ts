import type { Collection, Environment, Workspace } from '@/types'

export type EntityMeta = {
    serverUpdatedAt: string
    dirty: boolean
    /** Server revision when local edit started (optimistic lock baseline). */
    baseServerUpdatedAt?: string
}

export type ReplicaSnapshot = {
    replicaKey: string
    workspaces: Workspace[]
    activeWorkspaceId: number | null
    collectionsByWorkspaceId: Record<string, Collection[]>
    environmentsByWorkspaceId: Record<string, Environment[]>
    metaCollection: Record<number, EntityMeta>
    metaWorkspace: Record<number, EntityMeta>
    metaEnv: Record<number, EntityMeta>
    lastSyncedAt: number | null
}

export type OutboxOpBase = { id: string; replicaKey: string; createdAt: number }

export type OutboxOp =
    | (OutboxOpBase & {
          type: 'collection_patch'
          collectionId: number
          workspaceId: number
          body: Record<string, unknown>
          expectedUpdatedAt?: string
      })
    | (OutboxOpBase & {
          type: 'collection_create'
          workspaceId: number
          tempId: number
          body: {
              name: string
              items: unknown[]
              workspaceId: number
              description?: string
              auth?: unknown
              variables?: unknown[]
              sortOrder?: number
          }
      })
    | (OutboxOpBase & {
          type: 'collection_delete'
          collectionId: number
          workspaceId: number
      })
    | (OutboxOpBase & {
          type: 'workspace_patch'
          workspaceId: number
          body: { name: string }
          expectedUpdatedAt?: string
      })
    | (OutboxOpBase & {
          type: 'workspace_create'
          tempId: number
          body: { name: string }
      })
    | (OutboxOpBase & {
          type: 'workspace_delete'
          workspaceId: number
      })
    | (OutboxOpBase & {
          type: 'environment_patch'
          workspaceId: number
          environmentId: number
          body: Record<string, unknown>
          expectedUpdatedAt?: string
      })
    | (OutboxOpBase & {
          type: 'environment_create'
          workspaceId: number
          tempId: number
          body: { name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }
      })
    | (OutboxOpBase & {
          type: 'environment_delete'
          workspaceId: number
          environmentId: number
      })

export type ConflictEntry = {
    id: string
    kind: 'collection' | 'workspace' | 'environment'
    entityId: number
    workspaceId?: number
    local: unknown
    server: unknown
    outboxOpId?: string
}

export function emptySnapshot(replicaKey: string): ReplicaSnapshot {
    return {
        replicaKey,
        workspaces: [],
        activeWorkspaceId: null,
        collectionsByWorkspaceId: {},
        environmentsByWorkspaceId: {},
        metaCollection: {},
        metaWorkspace: {},
        metaEnv: {},
        lastSyncedAt: null,
    }
}
