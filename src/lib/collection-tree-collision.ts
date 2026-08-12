import type { CollisionDetection, DroppableContainer } from '@dnd-kit/core'
import { closestCenter, pointerWithin } from '@dnd-kit/core'
import { COL_SORT_PREFIX } from './collection-tree'

function isTreeDropContainer(container: DroppableContainer): boolean {
    return container.data.current?.treeDrop != null
}

function isColSortContainer(container: DroppableContainer): boolean {
    return String(container.id).startsWith(COL_SORT_PREFIX)
}

/** Prefer pointer position; explicit tree-drop zones beat sortable rows at boundaries. */
export const collectionTreeCollisionDetection: CollisionDetection = (args) => {
    const draggingCol = String(args.active.id).startsWith(COL_SORT_PREFIX)

    const pointerHits = pointerWithin(args)
    if (pointerHits.length > 0) {
        const scoped = pointerHits.filter((hit) => {
            const container = args.droppableContainers.find((d) => d.id === hit.id)
            if (!container) return false
            if (draggingCol) return isColSortContainer(container)
            return !isColSortContainer(container)
        })
        if (scoped.length > 0) {
            if (!draggingCol) {
                const treeDropHits = scoped.filter((hit) => {
                    const container = args.droppableContainers.find((d) => d.id === hit.id)
                    return container != null && isTreeDropContainer(container)
                })
                if (treeDropHits.length > 0) return treeDropHits
            }
            return scoped
        }
    }

    const center = closestCenter(args)
    if (draggingCol) {
        return center.filter((hit) => {
            const container = args.droppableContainers.find((d) => d.id === hit.id)
            return container != null && isColSortContainer(container)
        })
    }
    return center.filter((hit) => {
        const container = args.droppableContainers.find((d) => d.id === hit.id)
        return container == null || !isColSortContainer(container)
    })
}
