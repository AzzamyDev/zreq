import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store'
import { useRequest } from '../../hooks/useRequest'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useAutosave } from '../../hooks/useAutosave'
import { useCollection } from '../../hooks/useCollection'
import UrlBar from './UrlBar'
import RequestTabs from './RequestTabs'
import SaveRequestDialog from '../collection/SaveRequestDialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

import { buildPersistPayload, inferProtocolFromUrl } from '../../lib/persist-request'
import { findTreeItem } from '../../lib/collection-tree'
import { withNormalizedQuery } from '../../lib/query-params'
import type { ActiveRequest, AuthConfig, RequestItem } from '../../types'

function authKey(auth: AuthConfig | undefined, folderId?: string): unknown[] {
    const resolved = auth ?? (folderId ? { type: 'inherit' as const } : { type: 'none' as const })
    if (resolved.type === 'bearer') return ['bearer', resolved.token ?? '']
    if (resolved.type === 'basic') return ['basic', resolved.username ?? '', resolved.password ?? '']
    if (resolved.type === 'jwt') return ['jwt', resolved.token ?? '', resolved.prefix ?? '']
    if (resolved.type === 'apikey') return ['apikey', resolved.key ?? '', resolved.value ?? '', resolved.addTo ?? 'header']
    if (resolved.type === 'inherit') return ['inherit']
    return ['none', resolved.overrideParent === true]
}

/** Everything except the name, so a rename can be told apart from other edits. */
function requestEditFingerprint(ar: ActiveRequest): string {
    const normalized = withNormalizedQuery(ar)
    const pairs = (rows: { key: string; value: string; enabled: boolean }[] | undefined) =>
        (rows ?? []).map((row) => ({ key: row.key, value: row.value, enabled: row.enabled !== false }))
    return JSON.stringify({
        method: normalized.method,
        url: normalized.url,
        headers: pairs(normalized.headers),
        params: pairs(normalized.params),
        body: {
            type: normalized.body?.type ?? 'none',
            content: normalized.body?.content ?? '',
        },
        auth: authKey(normalized.auth, normalized.folderId),
        scripts: {
            preRequest: normalized.scripts?.preRequest ?? '',
            postResponse: normalized.scripts?.postResponse ?? '',
            checks: (normalized.scripts?.checks ?? []).map((check) =>
                check.kind === 'status'
                    ? { kind: 'status' as const, expected: check.expected }
                    : { kind: 'json' as const, path: check.path, expected: check.expected },
            ),
        },
        protocol: normalized.protocol ?? 'http',
        subprotocols: normalized.subprotocols ?? '',
        savedMessages: normalized.savedMessages ?? [],
        messageTemplate: normalized.messageTemplate ?? '',
    })
}

function savedRequestFingerprint(item: RequestItem, live: ActiveRequest): string {
    if (live.savedResponseId) {
        const saved = item.savedResponses?.find((entry) => entry.id === live.savedResponseId)
        if (!saved?.requestSnapshot) return ''
        const snap = saved.requestSnapshot
        return requestEditFingerprint({
            ...live,
            method: snap.method,
            url: snap.url,
            headers: snap.headers,
            params: snap.params,
            body: snap.body,
            auth: snap.auth,
        })
    }
    return requestEditFingerprint({
        ...live,
        method: item.method || 'GET',
        url: item.url || '',
        headers: Array.isArray(item.headers) ? item.headers : [],
        params: Array.isArray(item.params) ? item.params : [],
        body: item.body || { type: 'none', content: '' },
        auth: item.auth ?? (live.folderId ? { type: 'inherit' } : { type: 'none' }),
        scripts: item.scripts,
        protocol: inferProtocolFromUrl(item.url ?? '', item.protocol),
        subprotocols: item.subprotocols,
        savedMessages: item.savedMessages ? [...item.savedMessages] : [],
        messageTemplate: item.messageTemplate,
    })
}

function nameWasTheOnlyChange(live: ActiveRequest): boolean {
    if (live.collectionId == null || !live.itemId) return false
    const collection = useAppStore.getState().collections.find((c) => c.id === live.collectionId)
    const item = collection ? (findTreeItem(collection.items, live.itemId) as RequestItem | null) : null
    if (!item || item.type !== 'request') return false
    const saved = savedRequestFingerprint(item, live)
    return saved !== '' && saved === requestEditFingerprint(live)
}

const NAME_SAVE_DEBOUNCE_MS = 600

export default function RequestBuilder() {
    const { t } = useTranslation()
    useAutosave()
    const { sendRequest } = useRequest()
    const ws = useWebSocket()
    const { persistRequestItem, updateSavedResponse, renameItem } = useCollection()
    const renameItemRef = useRef(renameItem)
    renameItemRef.current = renameItem
    const committedNameKey = useRef('')
    const committedName = useRef<string | null>(null)
    const isLoading = useAppStore((s) => s.isLoading)
    const breadcrumb = useAppStore((s) => s.breadcrumb)
    const setBreadcrumb = useAppStore((s) => s.setBreadcrumb)
    const tabs = useAppStore((s) => s.tabs)
    const addTab = useAppStore((s) => s.addTab)
    const activeRequest = useAppStore((s) => s.activeRequest)
    const setActiveRequest = useAppStore((s) => s.setActiveRequest)
    const markActiveTabClean = useAppStore((s) => s.markActiveTabClean)

    const [saveDialogOpen, setSaveDialogOpen] = useState(false)

    const handleSave = useCallback(async () => {
        if (useAppStore.getState().tabs.length === 0) return
        const ar = useAppStore.getState().activeRequest

        // Viewing a saved response: "Save" overwrites that same entry with what's currently open
        // in this tab (response + request fields), not a new entry and not the live request.
        if (ar.savedResponseId) {
            const currentResponse = useAppStore.getState().response
            if (!currentResponse || ar.collectionId == null || !ar.itemId) return
            await updateSavedResponse(ar.collectionId, ar.itemId, ar.savedResponseId, {
                name: ar.name,
                response: structuredClone(currentResponse),
                requestSnapshot: structuredClone({
                    method: ar.method,
                    url: ar.url,
                    headers: ar.headers,
                    params: ar.params,
                    body: ar.body,
                    auth: ar.auth,
                }),
                savedAt: Date.now(),
            })
            markActiveTabClean()
            return
        }

        if (ar.collectionId != null && ar.itemId) {
            await persistRequestItem(ar.collectionId, ar.itemId, buildPersistPayload(ar))
            markActiveTabClean()
            return
        }
        setSaveDialogOpen(true)
    }, [persistRequestItem, updateSavedResponse, markActiveTabClean])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault()
                void handleSave()
            }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [handleSave])

    useEffect(() => {
        const key =
            activeRequest.collectionId != null && activeRequest.itemId
                ? `${activeRequest.collectionId}:${activeRequest.itemId}:${activeRequest.savedResponseId ?? ''}`
                : ''
        if (committedNameKey.current !== key) {
            committedNameKey.current = key
            committedName.current = activeRequest.name
            return
        }
        if (!key || activeRequest.collectionId == null || !activeRequest.itemId) return
        if (activeRequest.name === committedName.current) return
        const trimmed = activeRequest.name.trim()
        if (!trimmed || trimmed === committedName.current) return

        const collectionId = activeRequest.collectionId
        const itemId = activeRequest.itemId
        const savedResponseId = activeRequest.savedResponseId
        const timer = window.setTimeout(() => {
            const live = useAppStore.getState().activeRequest
            if (
                live.collectionId !== collectionId ||
                live.itemId !== itemId ||
                live.savedResponseId !== savedResponseId ||
                live.name.trim() !== trimmed
            ) {
                return
            }
            committedName.current = trimmed
            if (live.name !== trimmed) {
                setActiveRequest({ name: trimmed })
                const path = useAppStore.getState().breadcrumb
                if (path.length > 0) setBreadcrumb([...path.slice(0, -1), trimmed])
            }
            const write = savedResponseId
                ? updateSavedResponse(collectionId, itemId, savedResponseId, { name: trimmed })
                : renameItemRef.current(collectionId, itemId, trimmed)
            void write.then(() => {
                const still = useAppStore.getState().activeRequest
                const stillThisRequest =
                    still.collectionId === collectionId &&
                    still.itemId === itemId &&
                    still.savedResponseId === savedResponseId &&
                    still.name.trim() === trimmed
                if (stillThisRequest && nameWasTheOnlyChange(still)) markActiveTabClean()
            })
        }, NAME_SAVE_DEBOUNCE_MS)

        return () => window.clearTimeout(timer)
    }, [
        activeRequest.name,
        activeRequest.collectionId,
        activeRequest.itemId,
        activeRequest.savedResponseId,
        setActiveRequest,
        setBreadcrumb,
        updateSavedResponse,
        markActiveTabClean,
    ])

    const noTabs = tabs.length === 0
    const isWs = (activeRequest.protocol ?? 'http') === 'ws'

    return (
        <div className="flex h-full min-h-0 flex-col">
            <SaveRequestDialog
                open={saveDialogOpen}
                onClose={() => setSaveDialogOpen(false)}
                defaultFolderId={activeRequest.folderId}
            />
            {noTabs ? (
                <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
                    <p className="max-w-sm text-sm text-muted-foreground">
                        {t('request.noTabsHint')}
                    </p>
                    <Button type="button" onClick={() => addTab()}>
                        {t('request.newTab')}
                    </Button>
                </div>
            ) : (
                <>
                    <div className="border-b border-border">
                        <div className="flex items-center gap-2 px-3 py-2">
                            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                {breadcrumb.slice(0, -1).map((segment, i) => (
                                    <React.Fragment key={`${segment}-${i}`}>
                                        {i > 0 && <span className="opacity-50">/</span>}
                                        <span className="max-w-40 truncate">{segment}</span>
                                    </React.Fragment>
                                ))}
                                {breadcrumb.length > 1 && <span className="opacity-50">/</span>}
                                <Input
                                    value={activeRequest.name}
                                    onChange={(e) => {
                                        const name = e.target.value
                                        setActiveRequest({ name })
                                        if (breadcrumb.length > 0) {
                                            setBreadcrumb([...breadcrumb.slice(0, -1), name])
                                        }
                                    }}
                                    placeholder={t('request.requestName')}
                                    style={{
                                        width: `${Math.min(
                                            36,
                                            Math.max((activeRequest.name || t('request.requestName')).length + 1, 8),
                                        )}ch`,
                                    }}
                                    className="h-7 w-auto max-w-full shrink border-0 bg-transparent px-1 py-0 text-xs shadow-none md:text-xs focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
                                    aria-label={t('request.requestNameAria')}
                                />
                            </div>
                        </div>
                        <div className={`px-3 pt-0 ${isWs ? 'pb-3' : 'pb-2.5'}`}>
                            <UrlBar
                                onSend={sendRequest}
                                onWsConnect={() => void ws.connect()}
                                onWsDisconnect={() => void ws.disconnect()}
                                isLoading={isLoading}
                                wsState={ws.wsState}
                            />
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto pt-2">
                        <RequestTabs
                            onWsSend={(data, isBinary) => void ws.sendMessage(data, isBinary)}
                            onWsPing={() => void ws.sendPing()}
                            wsConnected={ws.isConnected}
                        />
                    </div>
                </>
            )}
        </div>
    )
}
