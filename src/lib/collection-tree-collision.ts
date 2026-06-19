import type { CollisionDetection, DroppableContainer } from '@dnd-kit/core'
import { closestCenter, pointerWithin } from '@dnd-kit/core'

function isTreeDropContainer(container: DroppableContainer): boolean {
    return container.data.current?.treeDrop != null
}

/** Prefer pointer position; explicit tree-drop zones beat sortable rows at boundaries. */
export const collectionTreeCollisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args)
    if (pointerHits.length > 0) {
        const treeDropHits = pointerHits.filter((hit) => {
            const container = args.droppableContainers.find((d) => d.id === hit.id)
            return container != null && isTreeDropContainer(container)
        })
        if (treeDropHits.length > 0) return treeDropHits
        return pointerHits
    }
    return closestCenter(args)
}
