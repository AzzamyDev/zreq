import { useCallback } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/authStore'
import { nanoid } from 'nanoid'
import type { Collection } from '../types'
import * as snap from '@/lib/local-replica/snapshot-store'
import {
    writeCollectionCreate,
    writeCollectionDelete,
    writeCollectionPatch,
} from '@/lib/local-replica/local-write'
import { ensureReplicaLoaded } from '@/lib/local-replica/sync-engine'

export function useCollection() {
    const { collections } = useAppStore()

    const createCollection = async (name: string) => {
        const wid = useAppStore.getState().activeWorkspaceId
        const user = useAuthStore.getState().user
        if (wid == null || !user) return
        const tempId = -Math.floor(Math.random() * 1e12 + Date.now())
        const now = new Date().toISOString()
        const col: Collection = {
            id: tempId,
            name,
            items: [],
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
        await writeCollectionCreate(tempId, { name, items: [], workspaceId: wid })
        return col
    }

    const saveRequestItem = async (collectionId: number, item: any, parentFolderId?: string) => {
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])
        const newItem = { ...item, id: item.id || nanoid() }
        if (parentFolderId) {
            const folder = findItem(items, parentFolderId)
            if (folder && folder.type === 'folder') {
                folder.items = folder.items || []
                folder.items.push(newItem)
            }
        } else {
            items.push(newItem)
        }
        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid0 = useAppStore.getState().activeWorkspaceId
        if (wid0 != null) snap.setWorkspaceSlice(wid0, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
        return newItem
    }

    const addFolder = async (collectionId: number, name: string, parentFolderId?: string) => {
        const newFolder = { id: nanoid(), type: 'folder' as const, name, items: [] }
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])
        if (parentFolderId) {
            const parent = findItem(items, parentFolderId)
            if (parent) {
                parent.items = parent.items || []
                parent.items.push(newFolder)
            }
        } else {
            items.push(newFolder)
        }
        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
        return newFolder
    }

    const deleteItem = async (collectionId: number, itemId: string) => {
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])
        removeItem(items, itemId)
        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
    }

    const renameItem = async (collectionId: number, itemId: string, name: string) => {
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])
        const item = findItem(items, itemId)
        if (item) item.name = name
        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
    }

    const renameCollection = async (collectionId: number, name: string) => {
        useAppStore.getState().updateCollection(collectionId, { name })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { name })
    }

    const updateCollectionSettings = async (
        collectionId: number,
        updates: { name?: string; description?: string; auth?: any; variables?: any[] }
    ) => {
        useAppStore.getState().updateCollection(collectionId, updates)
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { ...updates } as Record<string, unknown>)
    }

    const updateFolderSettings = async (
        collectionId: number,
        folderId: string,
        updates: { name?: string; description?: string; auth?: any; variables?: any[] }
    ) => {
        const live = useAppStore.getState().collections
        const collection = live.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])
        const node = findItem(items, folderId)
        if (!node || node.type !== 'folder') return
        if (updates.name != null) node.name = updates.name
        if (updates.description !== undefined) node.description = updates.description
        if (updates.auth !== undefined) node.auth = updates.auth
        if (updates.variables !== undefined) node.variables = updates.variables
        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
    }

    const deleteCollection = async (collectionId: number) => {
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid == null) return
        useAppStore.getState().removeCollection(collectionId)
        await ensureReplicaLoaded()
        snap.removeCollectionLocal(wid, collectionId)
        const mem = snap.getMemorySnapshot()
        if (mem) delete mem.metaCollection[collectionId]
        await snap.persistSnapshotNow()
        await writeCollectionDelete(collectionId, wid)
    }

    const duplicateItem = async (collectionId: number, itemId: string) => {
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])

        function duplicateInTree(arr: any[]): boolean {
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].id === itemId) {
                    const copy = { ...structuredClone(arr[i]), id: nanoid(), name: arr[i].name + ' (copy)' }
                    arr.splice(i + 1, 0, copy)
                    return true
                }
                if (arr[i].type === 'folder' && arr[i].items) {
                    if (duplicateInTree(arr[i].items)) return true
                }
            }
            return false
        }

        duplicateInTree(items)
        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
    }

    const persistRequestItem = useCallback(
        async (
            collectionId: number,
            itemId: string,
            payload: {
                name: string
                method: string
                url: string
                headers: unknown[]
                params: unknown[]
                body: unknown
                auth: unknown
                scripts?: unknown
            }
        ) => {
            const live = useAppStore.getState().collections
            const collection = live.find((c) => c.id === collectionId)
            if (!collection) return
            const items = structuredClone(collection.items || [])
            const node = findItem(items, itemId)
            if (!node || node.type !== 'request') return
            Object.assign(node, {
                ...payload,
                type: 'request',
                id: itemId,
            })
            useAppStore.getState().updateCollection(collectionId, { items })
            await ensureReplicaLoaded()
            const wid = useAppStore.getState().activeWorkspaceId
            if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
            await writeCollectionPatch(collectionId, { items })
        },
        []
    )

    const addRequest = async (collectionId: number, name: string, parentFolderId?: string) => {
        const newRequest = {
            id: nanoid(),
            type: 'request' as const,
            name,
            method: 'GET' as const,
            url: '',
            headers: [],
            params: [],
            body: { type: 'none' as const, content: '' },
            auth: parentFolderId ? { type: 'inherit' as const } : { type: 'none' as const },
        }
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])

        if (parentFolderId) {
            const parent = findItem(items, parentFolderId)
            if (parent && parent.type === 'folder') {
                parent.items = parent.items || []
                parent.items.push(newRequest)
            }
        } else {
            items.push(newRequest)
        }

        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
        return newRequest
    }

    const moveTreeItem = useCallback(async (collectionId: number, draggedId: string, dest: TreeMoveDestination) => {
        if (dest.kind === 'intoFolder' && dest.folderId === draggedId) return

        const live = useAppStore.getState().collections
        const collection = live.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])

        const extracted = extractItem(items, draggedId)
        if (!extracted) return

        if (extracted.type === 'folder' && dest.kind === 'intoFolder') {
            if (folderContainsId(extracted, dest.folderId)) return
        }

        if (dest.kind === 'intoFolder') {
            const folder = findItem(items, dest.folderId)
            if (!folder || folder.type !== 'folder') return
            folder.items = folder.items || []
            folder.items.push(extracted)
        } else {
            items.push(extracted)
        }

        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
    }, [])

    const reorderSiblings = useCallback(async (collectionId: number, activeId: string, overId: string) => {
        if (activeId === overId) return
        const live = useAppStore.getState().collections
        const collection = live.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])
        const locA = findItemLocation(items, activeId)
        const locB = findItemLocation(items, overId)
        if (!locA || !locB) return
        if (locA.parentFolderId !== locB.parentFolderId) return
        const { list, index: oldIndex } = locA
        const { index: newIndex } = locB
        if (oldIndex === newIndex) return
        const next = arrayMove(list, oldIndex, newIndex)
        list.splice(0, list.length, ...next)
        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
    }, [])

    return {
        createCollection,
        saveRequestItem,
        addFolder,
        deleteItem,
        renameItem,
        renameCollection,
        deleteCollection,
        duplicateItem,
        addRequest,
        updateCollectionSettings,
        updateFolderSettings,
        persistRequestItem,
        moveTreeItem,
        reorderSiblings,
    }
}

function findItem(items: any[], id: string): any {
    for (const item of items) {
        if (item.id === id) return item
        if (item.type === 'folder' && item.items) {
            const found = findItem(item.items, id)
            if (found) return found
        }
    }
    return null
}

function findItemLocation(
    items: any[],
    itemId: string,
    parentFolderId: string | null = null
): { list: any[]; parentFolderId: string | null; index: number } | null {
    for (let i = 0; i < items.length; i++) {
        if (items[i].id === itemId) return { list: items, parentFolderId, index: i }
        if (items[i].type === 'folder' && items[i].items) {
            const found = findItemLocation(items[i].items, itemId, items[i].id)
            if (found) return found
        }
    }
    return null
}

function removeItem(items: any[], id: string): boolean {
    for (let i = 0; i < items.length; i++) {
        if (items[i].id === id) {
            items.splice(i, 1)
            return true
        }
        if (items[i].type === 'folder' && items[i].items) {
            if (removeItem(items[i].items, id)) return true
        }
    }
    return false
}

function extractItem(items: any[], id: string): any | null {
    for (let i = 0; i < items.length; i++) {
        if (items[i].id === id) return items.splice(i, 1)[0]
        if (items[i].type === 'folder' && items[i].items) {
            const found = extractItem(items[i].items, id)
            if (found) return found
        }
    }
    return null
}

function folderContainsId(node: any, id: string): boolean {
    if (node.id === id) return true
    for (const ch of node.items || []) {
        if (ch.id === id) return true
        if (ch.type === 'folder' && folderContainsId(ch, id)) return true
    }
    return false
}

export type TreeMoveDestination = { kind: 'intoFolder'; folderId: string } | { kind: 'rootEnd' }

export type TreeDropPayload = TreeMoveDestination & { collectionId: number }
