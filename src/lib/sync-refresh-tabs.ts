import type { ActiveRequest, Collection, Folder, RequestItem, RequestTab } from '@/types'
import { withNormalizedQuery } from './query-params'
import { inferProtocolFromUrl } from './persist-request'

function findRequestItemById(items: (Folder | RequestItem)[], itemId: string): RequestItem | null {
    for (const it of items) {
        if (it.type === 'request' && it.id === itemId) return it
        if (it.type === 'folder') {
            const found = findRequestItemById(it.items, itemId)
            if (found) return found
        }
    }
    return null
}

function tabMethodLabel(req: ActiveRequest): string {
    return (req.protocol ?? 'http') === 'ws' ? 'WS' : req.method || 'GET'
}

/**
 * After a remote pull, refresh open tabs whose backing request item was updated on the server.
 *
 * Rules:
 * - Tabs with `isDirty = true` are skipped — the user has unsaved local edits that take
 *   precedence over the remote data.
 * - Saved-response tabs (`savedResponseId` set) are detached snapshots and are never mutated
 *   by sync.
 * - Tabs that have no `itemId` / `collectionId` (unsaved scratch tabs) are skipped.
 *
 * Returns a new tabs array and the set of tab IDs that were refreshed so the caller can
 * mirror the change to `activeRequest` if the active tab is among them.
 */
export function refreshTabsFromPulledCollections(
    tabs: RequestTab[],
    collections: Collection[],
): { tabs: RequestTab[]; refreshedTabIds: Set<string> } {
    const refreshedTabIds = new Set<string>()

    const nextTabs = tabs.map((tab) => {
        if (tab.isDirty) return tab
        if (!tab.request.itemId || !tab.request.collectionId) return tab
        if (tab.request.savedResponseId) return tab

        const col = collections.find((c) => c.id === tab.request.collectionId)
        if (!col) return tab

        const item = findRequestItemById(col.items, tab.request.itemId)
        if (!item) return tab

        const refreshed = withNormalizedQuery({
            method: item.method || 'GET',
            url: item.url || '',
            headers: Array.isArray(item.headers) ? item.headers : [],
            params: Array.isArray(item.params) ? item.params : [],
            body: item.body || { type: 'none', content: '' },
            auth: item.auth ?? (tab.request.folderId ? { type: 'inherit' } : { type: 'none' }),
            name: item.name || 'Untitled Request',
            itemId: item.id,
            scripts: item.scripts,
            collectionId: tab.request.collectionId,
            folderId: tab.request.folderId,
            protocol: inferProtocolFromUrl(item.url ?? '', item.protocol),
            subprotocols: item.subprotocols,
            savedMessages: item.savedMessages ? [...item.savedMessages] : [],
            messageTemplate: item.messageTemplate,
            savedResponses: item.savedResponses ? [...item.savedResponses] : [],
        })

        refreshedTabIds.add(tab.id)
        return {
            ...tab,
            request: refreshed,
            name: item.name || 'Untitled Request',
            method: tabMethodLabel(refreshed),
        }
    })

    return { tabs: nextTabs, refreshedTabIds }
}
