import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store'
import { METHOD_TEXT_CLASS, requestBadgeLabel } from '../../lib/httpMethodTheme'
import { X, Plus } from 'lucide-react'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import SaveRequestDialog from '@/components/collection/SaveRequestDialog'
import { useCollection } from '@/hooks/useCollection'

function useIsApplePlatform() {
    return useMemo(
        () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent),
        []
    )
}

type ClosePrompt =
    | { kind: 'one'; tabId: string }
    | { kind: 'others'; keepId: string }
    | { kind: 'all' }

export default function RequestTabBar() {
    const { t } = useTranslation()
    const isApple = useIsApplePlatform()
    const mod = isApple ? '⌘' : 'Ctrl+'
    const { persistRequestItem } = useCollection()
    const tabs = useAppStore((s) => s.tabs)
    const activeTabId = useAppStore((s) => s.activeTabId)
    const activeRequest = useAppStore((s) => s.activeRequest)
    const addTab = useAppStore((s) => s.addTab)
    const closeTab = useAppStore((s) => s.closeTab)
    const setActiveTab = useAppStore((s) => s.setActiveTab)
    const duplicateTab = useAppStore((s) => s.duplicateTab)
    const closeOtherTabs = useAppStore((s) => s.closeOtherTabs)
    const closeAllTabs = useAppStore((s) => s.closeAllTabs)
    const markActiveTabClean = useAppStore((s) => s.markActiveTabClean)

    const [closePrompt, setClosePrompt] = useState<ClosePrompt | null>(null)
    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
    const [savingPersist, setSavingPersist] = useState(false)
    const deferredCloseTabIdRef = useRef<string | null>(null)

    const tryCloseOne = (tabId: string) => {
        const ok = closeTab(tabId, false)
        if (!ok) setClosePrompt({ kind: 'one', tabId })
    }

    const tryCloseOthers = (keepId: string) => {
        const ok = closeOtherTabs(keepId, false)
        if (!ok) setClosePrompt({ kind: 'others', keepId })
    }

    const tryCloseAll = () => {
        const ok = closeAllTabs(false)
        if (!ok) setClosePrompt({ kind: 'all' })
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = e.target
            if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLTextAreaElement ||
                el instanceof HTMLSelectElement ||
                (el instanceof HTMLElement && el.isContentEditable)
            ) {
                return
            }

            const meta = e.metaKey || e.ctrlKey
            const st = useAppStore.getState()
            if (meta && e.key === 't') {
                e.preventDefault()
                st.addTab()
                return
            }
            if (meta && e.key === 'w') {
                e.preventDefault()
                const id = st.activeTabId
                if (!id) return
                if (e.altKey) {
                    st.closeTab(id, true)
                    return
                }
                const ok = st.closeTab(id, false)
                if (!ok) setClosePrompt({ kind: 'one', tabId: id })
            }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [])

    const promptTabName =
        closePrompt?.kind === 'one'
            ? (tabs.find((x) => x.id === closePrompt.tabId)?.name ?? '')
            : ''

    const saveThenCloseTab = async (tabId: string) => {
        const st = useAppStore.getState()
        if (st.activeTabId !== tabId) setActiveTab(tabId)
        const ar = useAppStore.getState().activeRequest
        if (ar.collectionId != null && ar.itemId) {
            setSavingPersist(true)
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
                    protocol: ar.protocol ?? 'http',
                    subprotocols: ar.subprotocols,
                    savedMessages: ar.savedMessages,
                    messageTemplate: ar.messageTemplate,
                })
                markActiveTabClean()
                closeTab(tabId, true)
                setClosePrompt(null)
            } finally {
                setSavingPersist(false)
            }
            return
        }
        deferredCloseTabIdRef.current = tabId
        setClosePrompt(null)
        setSaveDialogOpen(true)
    }

    const handleSaveDialogClose = () => {
        setSaveDialogOpen(false)
        const id = deferredCloseTabIdRef.current
        if (id) {
            setClosePrompt({ kind: 'one', tabId: id })
            deferredCloseTabIdRef.current = null
        }
    }

    const handleAfterNewSave = () => {
        const id = deferredCloseTabIdRef.current
        if (id) {
            closeTab(id, true)
            deferredCloseTabIdRef.current = null
        }
        setClosePrompt(null)
    }

    return (
        <>
            <Dialog open={closePrompt != null} onOpenChange={(o) => !o && setClosePrompt(null)}>
                <DialogContent showCloseButton className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {closePrompt?.kind === 'one' && t('requestTab.closeUnsavedTitle')}
                            {closePrompt?.kind === 'others' && t('requestTab.closeOthersUnsavedTitle')}
                            {closePrompt?.kind === 'all' && t('requestTab.closeAllUnsavedTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {closePrompt?.kind === 'one' &&
                                t('requestTab.closeUnsavedBody', { name: promptTabName || t('saveRequest.untitled') })}
                            {closePrompt?.kind === 'others' && t('requestTab.closeOthersUnsavedBody')}
                            {closePrompt?.kind === 'all' && t('requestTab.closeAllUnsavedBody')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:justify-between sm:gap-2">
                        <Button type="button" variant="outline" onClick={() => setClosePrompt(null)}>
                            {t('common.cancel')}
                        </Button>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            {closePrompt?.kind === 'one' ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={savingPersist}
                                        onClick={() => {
                                            closeTab(closePrompt.tabId, true)
                                            setClosePrompt(null)
                                        }}
                                    >
                                        {t('requestTab.dontSave')}
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={savingPersist}
                                        onClick={() => void saveThenCloseTab(closePrompt.tabId)}
                                    >
                                        {savingPersist ? t('common.saving') : t('common.save')}
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => {
                                        if (closePrompt?.kind === 'others') {
                                            closeOtherTabs(closePrompt.keepId, true)
                                        } else if (closePrompt?.kind === 'all') {
                                            closeAllTabs(true)
                                        }
                                        setClosePrompt(null)
                                    }}
                                >
                                    {t('requestTab.discardUnsaved')}
                                </Button>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <SaveRequestDialog
                open={saveDialogOpen}
                onClose={handleSaveDialogClose}
                defaultFolderId={activeRequest.folderId}
                onAfterSave={handleAfterNewSave}
            />

            <div className="flex shrink-0 items-center overflow-x-auto border-b border-border bg-background scrollbar-none">
                {tabs.map((tab) => (
                    <ContextMenu key={tab.id}>
                        <ContextMenuTrigger>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setActiveTab(tab.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        setActiveTab(tab.id)
                                    }
                                }}
                                className={`group flex min-w-[200px] max-w-[280px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 py-2 text-xs ${
                                    tab.id === activeTabId
                                        ? 'border-b-2 border-b-primary bg-muted/40'
                                        : 'border-b-2 border-b-transparent text-muted-foreground hover:bg-muted/20'
                                }`}
                            >
                                <span
                                    className={`shrink-0 text-[10px] font-bold ${METHOD_TEXT_CLASS[tab.method] ?? METHOD_TEXT_CLASS[requestBadgeLabel(tab.request)] ?? 'text-muted-foreground'}`}
                                >
                                    {tab.method}
                                </span>
                                <span className="flex-1 truncate">{tab.name}</span>
                                {tab.isDirty && (
                                    <span
                                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                                        title={t('requestTab.unsaved')}
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        tryCloseOne(tab.id)
                                    }}
                                    className="shrink-0 rounded p-0.5 opacity-0 hover:bg-muted-foreground/20 group-hover:opacity-100"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent align="start" side="bottom" className="min-w-[240px]">
                            <ContextMenuItem
                                onClick={() => {
                                    addTab()
                                }}
                            >
                                {t('requestTab.newRequest')}
                                <ContextMenuShortcut>{mod}T</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem
                                onClick={() => {
                                    duplicateTab(tab.id)
                                }}
                            >
                                {t('requestTab.duplicateTab')}
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                                onClick={() => {
                                    tryCloseOne(tab.id)
                                }}
                            >
                                {t('requestTab.closeTab')}
                                <ContextMenuShortcut>{mod}W</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem
                                onClick={() => {
                                    closeTab(tab.id, true)
                                }}
                            >
                                {t('requestTab.forceCloseTab')}
                                <ContextMenuShortcut>
                                    {isApple ? '⌥⌘W' : 'Alt+Ctrl+W'}
                                </ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem
                                disabled={tabs.length <= 1}
                                onClick={() => {
                                    tryCloseOthers(tab.id)
                                }}
                            >
                                {t('requestTab.closeOtherTabs')}
                            </ContextMenuItem>
                            <ContextMenuItem
                                disabled={tabs.length === 0}
                                onClick={() => {
                                    tryCloseAll()
                                }}
                            >
                                {t('requestTab.closeAllTabs')}
                            </ContextMenuItem>
                            <ContextMenuItem
                                disabled={tabs.length === 0}
                                variant="destructive"
                                onClick={() => {
                                    closeAllTabs(true)
                                }}
                            >
                                {t('requestTab.forceCloseAllTabs')}
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                ))}
                <button
                    type="button"
                    onClick={() => addTab()}
                    className="flex shrink-0 items-center justify-center px-2 py-2 text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                    title={t('requestTab.newTab')}
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>
        </>
    )
}
