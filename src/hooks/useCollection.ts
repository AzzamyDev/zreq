import { useCallback } from 'react'
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
import { collectTopLevelSelectedItems, removeItemsById } from '../lib/collection-tree-select'
import { findTreeItem, findItemLocation, folderContainsId } from '../lib/collection-tree'

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
            const folder = findTreeItem(items, parentFolderId)
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
            const parent = findTreeItem(items, parentFolderId)
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
        await deleteItems(collectionId, [itemId])
    }

    const deleteItems = async (collectionId: number, itemIds: string[]) => {
        if (itemIds.length === 0) return
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])
        const idSet = new Set(itemIds)
        removeItemsById(items, idSet)
        useAppStore.getState().updateCollection(collectionId, { items })

        const state = useAppStore.getState()
        if (state.selectedItemId && idSet.has(state.selectedItemId)) {
            state.setSelectedItemId(null)
        }
        const sel = state.sidebarSelection
        if (sel?.collectionId === collectionId && sel.ids.some((id) => idSet.has(id))) {
            state.clearSidebarSelection()
        }

        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
    }

    const renameItem = async (collectionId: number, itemId: string, name: string) => {
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])
        const item = findTreeItem(items, itemId)
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
        const node = findTreeItem(items, folderId)
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
                protocol?: string
                subprotocols?: string
                savedMessages?: unknown[]
                messageTemplate?: string
            }
        ) => {
            const live = useAppStore.getState().collections
            const collection = live.find((c) => c.id === collectionId)
            if (!collection) return
            const items = structuredClone(collection.items || [])
            const node = findTreeItem(items, itemId)
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
            protocol: 'http' as const,
        }
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])

        if (parentFolderId) {
            const parent = findTreeItem(items, parentFolderId)
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

    const addWebSocketRequest = async (collectionId: number, name: string, parentFolderId?: string) => {
        const newRequest = {
            id: nanoid(),
            type: 'request' as const,
            name,
            method: 'GET' as const,
            url: 'wss://',
            headers: [],
            params: [],
            body: { type: 'none' as const, content: '' },
            auth: parentFolderId ? { type: 'inherit' as const } : { type: 'none' as const },
            protocol: 'ws' as const,
            subprotocols: '',
            savedMessages: [],
            messageTemplate: '',
        }
        const collection = collections.find((c) => c.id === collectionId)
        if (!collection) return
        const items = structuredClone(collection.items || [])

        if (parentFolderId) {
            const parent = findTreeItem(items, parentFolderId)
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

    const persistCollectionItems = async (collectionId: number, items: any[]) => {
        useAppStore.getState().updateCollection(collectionId, { items })
        await ensureReplicaLoaded()
        const wid = useAppStore.getState().activeWorkspaceId
        if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
        await writeCollectionPatch(collectionId, { items })
    }

    const transferTreeItems = useCallback(
        async (
            sourceCollectionId: number,
            destCollectionId: number,
            draggedIds: string[],
            dest: TreeMoveDestination
        ) => {
            const uniqueIds = [...new Set(draggedIds)]
            if (uniqueIds.length === 0) return
            const idSet = new Set(uniqueIds)

            if (dest.kind === 'intoFolder' && idSet.has(dest.folderId)) return

            const live = useAppStore.getState().collections
            const sourceCol = live.find((c) => c.id === sourceCollectionId)
            const destCol = live.find((c) => c.id === destCollectionId)
            if (!sourceCol || !destCol) return

            const sourceItems = structuredClone(sourceCol.items || [])
            const destItems =
                sourceCollectionId === destCollectionId ? sourceItems : structuredClone(destCol.items || [])

            const collected: any[] = []
            collectTopLevelSelectedItems(sourceItems, idSet, collected)
            if (collected.length === 0) return

            if (dest.kind === 'intoFolder') {
                for (const node of collected) {
                    if (node.type === 'folder' && folderContainsId(node, dest.folderId)) return
                }
                const folder = findTreeItem(destItems, dest.folderId)
                if (!folder || folder.type !== 'folder') return
            }

            if (dest.kind === 'beforeItem') {
                const target = findTreeItem(destItems, dest.itemId)
                if (!target) return
                if (idSet.has(dest.itemId)) return
            }

            removeItemsById(sourceItems, idSet)

            if (dest.kind === 'intoFolder') {
                const folder = findTreeItem(destItems, dest.folderId)
                if (!folder || folder.type !== 'folder') return
                folder.items = folder.items || []
                folder.items.push(...collected)
            } else if (dest.kind === 'beforeItem') {
                const loc = findItemLocation(destItems, dest.itemId)
                if (!loc) return
                loc.list.splice(loc.index, 0, ...collected)
            } else {
                destItems.push(...collected)
            }

            const state = useAppStore.getState()
            if (state.sidebarSelection?.collectionId === sourceCollectionId) {
                state.clearSidebarSelection()
            }

            await persistCollectionItems(sourceCollectionId, sourceItems)
            if (sourceCollectionId !== destCollectionId) {
                await persistCollectionItems(destCollectionId, destItems)
            }
        },
        []
    )

    const moveTreeItem = useCallback(
        async (collectionId: number, draggedId: string, dest: TreeMoveDestination) => {
            await transferTreeItems(collectionId, collectionId, [draggedId], dest)
        },
        [transferTreeItems]
    )

    const moveTreeItems = useCallback(
        async (collectionId: number, draggedIds: string[], dest: TreeMoveDestination) => {
            await transferTreeItems(collectionId, collectionId, draggedIds, dest)
        },
        [transferTreeItems]
    )

    const reorderSiblingsMulti = useCallback(
        async (collectionId: number, activeId: string, overId: string, draggedIds: string[]) => {
            const idSet = new Set(draggedIds.includes(activeId) ? draggedIds : [activeId])
            if (idSet.has(overId) && idSet.size === 1) return

            const live = useAppStore.getState().collections
            const collection = live.find((c) => c.id === collectionId)
            if (!collection) return
            const items = structuredClone(collection.items || [])
            const locA = findItemLocation(items, activeId)
            const locB = findItemLocation(items, overId)
            if (!locA || !locB) return
            if (locA.parentFolderId !== locB.parentFolderId) return

            const { list } = locA
            const moving = list.filter((item) => idSet.has(item.id))
            if (moving.length === 0) return

            const oldOverIndex = list.findIndex((item) => item.id === overId)
            const oldFirstMoving = list.findIndex((item) => idSet.has(item.id))
            const remaining = list.filter((item) => !idSet.has(item.id))

            let insertIdx = remaining.findIndex((item) => item.id === overId)
            if (insertIdx === -1) insertIdx = remaining.length
            else if (oldFirstMoving < oldOverIndex) insertIdx += 1

            remaining.splice(insertIdx, 0, ...moving)
            list.splice(0, list.length, ...remaining)

            useAppStore.getState().updateCollection(collectionId, { items })
            await ensureReplicaLoaded()
            const wid = useAppStore.getState().activeWorkspaceId
            if (wid != null) snap.setWorkspaceSlice(wid, useAppStore.getState().collections)
            await writeCollectionPatch(collectionId, { items })
        },
        []
    )

    const reorderSiblings = useCallback(async (collectionId: number, activeId: string, overId: string) => {
        await reorderSiblingsMulti(collectionId, activeId, overId, [activeId])
    }, [reorderSiblingsMulti])

    return {
        createCollection,
        saveRequestItem,
        addFolder,
        deleteItem,
        deleteItems,
        renameItem,
        renameCollection,
        deleteCollection,
        duplicateItem,
        addRequest,
        addWebSocketRequest,
        updateCollectionSettings,
        updateFolderSettings,
        persistRequestItem,
        moveTreeItem,
        moveTreeItems,
        transferTreeItems,
        reorderSiblings,
        reorderSiblingsMulti,
    }
}

export type TreeMoveDestination =
    | { kind: 'intoFolder'; folderId: string }
    | { kind: 'rootEnd' }
    | { kind: 'beforeItem'; itemId: string }

export type TreeDropPayload = TreeMoveDestination & { collectionId: number }
