import type { Folder, RequestItem } from '../types'

export type SidebarSelection = {
    collectionId: number
    ids: string[]
    anchorId: string
}

export function flattenVisibleTreeItemIds(
    items: (Folder | RequestItem)[],
    collectionId: number,
    sidebarExpanded: Record<string, boolean>
): string[] {
    const ids: string[] = []
    const walk = (list: (Folder | RequestItem)[]) => {
        for (const item of list) {
            ids.push(item.id)
            if (item.type === 'folder') {
                const key = `fld:${collectionId}:${item.id}`
                if (sidebarExpanded[key] === true) {
                    walk(item.items ?? [])
                }
            }
        }
    }
    walk(items)
    return ids
}

export function rangeSelectIds(flatIds: string[], anchorId: string, targetId: string): string[] {
    const a = flatIds.indexOf(anchorId)
    const b = flatIds.indexOf(targetId)
    if (a === -1 || b === -1) return [targetId]
    const [lo, hi] = a < b ? [a, b] : [b, a]
    return flatIds.slice(lo, hi + 1)
}

export function collectTopLevelSelectedItems(items: any[], idSet: Set<string>, out: any[]): void {
    for (const item of items) {
        if (idSet.has(item.id)) {
            out.push(item)
        } else if (item.type === 'folder' && item.items?.length) {
            collectTopLevelSelectedItems(item.items, idSet, out)
        }
    }
}

export function collectItemsInTreeOrder(items: any[], idSet: Set<string>, out: any[]): void {
    for (const item of items) {
        if (idSet.has(item.id)) out.push(item)
        if (item.type === 'folder' && item.items?.length) {
            collectItemsInTreeOrder(item.items, idSet, out)
        }
    }
}

export function removeItemsById(items: any[], idSet: Set<string>): void {
    for (let i = items.length - 1; i >= 0; i--) {
        if (idSet.has(items[i].id)) {
            items.splice(i, 1)
        } else if (items[i].type === 'folder' && items[i].items) {
            removeItemsById(items[i].items, idSet)
        }
    }
}
