import { useEffect, useRef } from 'react'
import { buildPersistPayload } from '../lib/persist-request'
import { useAppStore } from '../store'
import { useCollection } from './useCollection'

function readAutosaveEnabled(): boolean {
    try {
        return JSON.parse(localStorage.getItem('zreq_autosave') ?? 'null') === true
    } catch {
        return false
    }
}

/** Debounced PATCH of the active saved request when auto-save is on. */
export function useAutosave() {
    const activeRequest = useAppStore((s) => s.activeRequest)
    const selectedItemId = useAppStore((s) => s.selectedItemId)
    const { persistRequestItem } = useCollection()
    const skipUntil = useRef(0)

    useEffect(() => {
        if (selectedItemId) {
            skipUntil.current = Date.now() + 600
        }
    }, [selectedItemId])

    useEffect(() => {
        if (!readAutosaveEnabled()) return
        if (!activeRequest.collectionId || !activeRequest.itemId) return
        if (Date.now() < skipUntil.current) return

        const cid = activeRequest.collectionId
        const iid = activeRequest.itemId

        const t = window.setTimeout(() => {
            if (!readAutosaveEnabled()) return
            const s = useAppStore.getState().activeRequest
            if (s.collectionId !== cid || s.itemId !== iid) return
            void persistRequestItem(cid, iid, buildPersistPayload(s))
        }, 1200)

        return () => window.clearTimeout(t)
    }, [
        activeRequest.collectionId,
        activeRequest.itemId,
        activeRequest.name,
        activeRequest.method,
        activeRequest.url,
        activeRequest.headers,
        activeRequest.params,
        activeRequest.body,
        activeRequest.auth,
        activeRequest.scripts,
        activeRequest.protocol,
        activeRequest.subprotocols,
        activeRequest.savedMessages,
        activeRequest.messageTemplate,
        persistRequestItem,
        selectedItemId,
    ])
}
