import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store'
import { useRequest } from '../../hooks/useRequest'
import { useAutosave } from '../../hooks/useAutosave'
import { useCollection } from '../../hooks/useCollection'
import UrlBar from './UrlBar'
import RequestTabs from './RequestTabs'
import SaveRequestDialog from '../collection/SaveRequestDialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

export default function RequestBuilder() {
    const { t } = useTranslation()
    useAutosave()
    const { sendRequest } = useRequest()
    const { persistRequestItem } = useCollection()
    const isLoading = useAppStore((s) => s.isLoading)
    const breadcrumb = useAppStore((s) => s.breadcrumb)
    const tabs = useAppStore((s) => s.tabs)
    const addTab = useAppStore((s) => s.addTab)
    const activeRequest = useAppStore((s) => s.activeRequest)
    const setActiveRequest = useAppStore((s) => s.setActiveRequest)
    const markActiveTabClean = useAppStore((s) => s.markActiveTabClean)

    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)

    const handleSave = useCallback(async () => {
        if (useAppStore.getState().tabs.length === 0) return
        const ar = useAppStore.getState().activeRequest
        if (ar.collectionId != null && ar.itemId) {
            setSaving(true)
            try {
                await persistRequestItem(ar.collectionId, ar.itemId, {
                    name: ar.name,
                    method: ar.method,
                    url: ar.url,
                    headers: ar.headers,
                    params: ar.params,
                    body: ar.body,
                    auth: ar.auth,
                    scripts: ar.scripts,
                })
                markActiveTabClean()
            } finally {
                setSaving(false)
            }
            return
        }
        setSaveDialogOpen(true)
    }, [persistRequestItem, markActiveTabClean])

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

    const noTabs = tabs.length === 0

    return (
        <div className="flex h-full flex-col">
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
                        {breadcrumb.length > 0 && (
                            <div className="flex items-center gap-1 px-3 pt-2 pb-1 text-xs text-muted-foreground">
                                {breadcrumb.map((segment, i) => (
                                    <React.Fragment key={i}>
                                        {i > 0 && <span className="opacity-50">/</span>}
                                        <span className={i === breadcrumb.length - 1 ? 'text-foreground font-medium' : ''}>
                                            {segment}
                                        </span>
                                    </React.Fragment>
                                ))}
                            </div>
                        )}
                        <div className="flex items-center gap-2 px-3 pb-2 pt-1">
                            <Input
                                value={activeRequest.name}
                                onChange={(e) => setActiveRequest({ name: e.target.value })}
                                placeholder={t('request.requestName')}
                                className="h-8 max-w-md"
                                aria-label={t('request.requestNameAria')}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0"
                                disabled={saving}
                                title={t('request.saveShortcutTitle')}
                                onClick={() => void handleSave()}
                            >
                                {saving ? t('common.saving') : t('common.save')}
                            </Button>
                        </div>
                        <div className="p-3 pt-0">
                            <UrlBar onSend={sendRequest} isLoading={isLoading} />
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">
                        <RequestTabs />
                    </div>
                </>
            )}
        </div>
    )
}
