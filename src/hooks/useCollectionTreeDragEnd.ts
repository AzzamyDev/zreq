import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useCollection, type TreeDropPayload } from './useCollection'
import { useAppStore } from '../store'
import { findCollectionIdForItem } from '../lib/collection-tree'

function resolveDragIds(
    sourceCollectionId: number,
    activeId: string,
    sidebarSelection: ReturnType<typeof useAppStore.getState>['sidebarSelection']
): string[] {
    if (
        sidebarSelection?.collectionId === sourceCollectionId &&
        sidebarSelection.ids.includes(activeId)
    ) {
        return sidebarSelection.ids
    }
    return [activeId]
}

export function useCollectionTreeDragEnd() {
    const { transferTreeItems, reorderSiblingsMulti } = useCollection()

    return useCallback(
        async (e: DragEndEvent) => {
            const { active, over } = e
            if (!over) return

            const activeId = String(active.id)
            const collections = useAppStore.getState().collections
            const sourceCollectionId = findCollectionIdForItem(collections, activeId)
            if (sourceCollectionId == null) return

            const sidebarSelection = useAppStore.getState().sidebarSelection
            const dragIds = resolveDragIds(sourceCollectionId, activeId, sidebarSelection)

            if (over.data.current?.treeDrop) {
                const payload = over.data.current.treeDrop as TreeDropPayload
                const { collectionId: destCollectionId, ...dest } = payload
                await transferTreeItems(sourceCollectionId, destCollectionId, dragIds, dest)
                return
            }

            const overId = String(over.id)
            if (activeId === overId) return

            const destCollectionId = findCollectionIdForItem(collections, overId)
            if (destCollectionId == null) return

            if (destCollectionId !== sourceCollectionId) {
                await transferTreeItems(sourceCollectionId, destCollectionId, dragIds, {
                    kind: 'beforeItem',
                    itemId: overId,
                })
                return
            }

            await reorderSiblingsMulti(sourceCollectionId, activeId, overId, dragIds)
        },
        [transferTreeItems, reorderSiblingsMulti]
    )
}
