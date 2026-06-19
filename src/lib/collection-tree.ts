import type { Collection } from '../types'

export function findTreeItem(items: any[], id: string): any | null {
    for (const item of items) {
        if (item.id === id) return item
        if (item.type === 'folder' && item.items) {
            const found = findTreeItem(item.items, id)
            if (found) return found
        }
    }
    return null
}

export function findCollectionIdForItem(collections: Collection[], itemId: string): number | null {
    for (const collection of collections) {
        if (findTreeItem(collection.items ?? [], itemId)) return collection.id
    }
    return null
}

export function findItemLocation(
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

export function folderContainsId(node: any, id: string): boolean {
    if (node.id === id) return true
    for (const ch of node.items || []) {
        if (ch.id === id) return true
        if (ch.type === 'folder' && folderContainsId(ch, id)) return true
    }
    return false
}
