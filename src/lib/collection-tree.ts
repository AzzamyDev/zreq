import { nanoid } from 'nanoid'
import type { Collection } from '../types'

export const COL_SORT_PREFIX = 'colsort:'

export function colSortId(collectionId: number): string {
    return `${COL_SORT_PREFIX}${collectionId}`
}

export function parseColSortId(id: string | number): number | null {
    const s = String(id)
    if (!s.startsWith(COL_SORT_PREFIX)) return null
    const n = Number(s.slice(COL_SORT_PREFIX.length))
    return Number.isFinite(n) ? n : null
}

export function sortCollectionsByOrder(cols: Collection[]): Collection[] {
    return [...cols].sort((a, b) => {
        const ao = a.sortOrder ?? 0
        const bo = b.sortOrder ?? 0
        if (ao !== bo) return ao - bo
        const at = a.createdAt.localeCompare(b.createdAt)
        if (at !== 0) return at
        return a.id - b.id
    })
}

function matchesQuery(text: string | undefined | null, q: string): boolean {
    if (!text) return false
    return text.toLowerCase().includes(q)
}

function filterTreeItems(items: any[], q: string): any[] {
    const out: any[] = []
    for (const item of items) {
        if (item.type === 'folder') {
            const nameHit = matchesQuery(item.name, q)
            if (nameHit) {
                out.push(item)
                continue
            }
            const children = filterTreeItems(item.items ?? [], q)
            if (children.length > 0) out.push({ ...item, items: children })
            continue
        }
        if (
            matchesQuery(item.name, q) ||
            matchesQuery(item.method, q) ||
            matchesQuery(item.url, q)
        ) {
            out.push(item)
        }
    }
    return out
}

/** Prune collections/folders/requests by name (also request method/url). */
export function filterCollectionsByQuery(cols: Collection[], rawQuery: string): Collection[] {
    const q = rawQuery.trim().toLowerCase()
    if (!q) return cols
    const out: Collection[] = []
    for (const col of cols) {
        const nameHit = matchesQuery(col.name, q)
        if (nameHit) {
            out.push(col)
            continue
        }
        const items = filterTreeItems(col.items ?? [], q)
        if (items.length > 0) out.push({ ...col, items })
    }
    return out
}

/** Deep-clone folder/request node; new ids for node, nested items, savedResponses. */
export function cloneTreeWithNewIds(node: any): any {
    const copy = structuredClone(node)
    copy.id = nanoid()
    if (copy.type === 'folder' && Array.isArray(copy.items)) {
        copy.items = copy.items.map(cloneTreeWithNewIds)
    }
    if (copy.type === 'request' && Array.isArray(copy.savedResponses)) {
        copy.savedResponses = copy.savedResponses.map((s: any) => ({ ...s, id: nanoid() }))
    }
    return copy
}

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
