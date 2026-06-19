import { useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import ResponseStats from './ResponseStats'
import ResponseBody from './ResponseBody'
import ResponseHeaders from './ResponseHeaders'
import ResponseCookies from './ResponseCookies'
import ConsolePanel from './ConsolePanel'
import WsMessagePanel from './WsMessagePanel'
import WsConnectionStats from './WsConnectionStats'

function Spinner() {
    return (
        <div className="flex min-h-0 flex-1 items-center justify-center">
            <svg
                className="h-8 w-8 animate-spin text-muted-foreground"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
            >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
            </svg>
        </div>
    )
}

type ResponsePanelProps = {
    responsePanelRef: RefObject<PanelImperativeHandle | null>
}

export default function ResponsePanel({ responsePanelRef }: ResponsePanelProps) {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<string>('body')
    const [panelCollapsed, setPanelCollapsed] = useState(false)
    const { response, isLoading, activeRequest, activeTabId, tabs } = useAppStore()
    const consoleLogs = useAppStore((s) => s.consoleLogs)

    const protocol = activeRequest.protocol ?? 'http'
    const isWs = protocol === 'ws'
    const activeTabData = tabs.find((t) => t.id === activeTabId)
    const wsFrames = activeTabData?.wsFrames ?? []
    const wsHandshake = activeTabData?.wsHandshake ?? null
    const wsState = activeTabData?.wsState ?? 'idle'
    const wsConnectedAt = activeTabData?.wsConnectedAt ?? null

    const togglePanelCollapse = () => {
        const p = responsePanelRef.current
        if (!p) return
        if (p.isCollapsed()) {
            p.expand()
            setPanelCollapsed(false)
        } else {
            p.collapse()
            setPanelCollapsed(true)
        }
    }

    const collapseLabel = panelCollapsed ? t('response.expandPanel') : t('response.collapsePanel')

    const header = (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 pr-1">
            <div className="flex min-h-9 min-w-0 flex-1 items-center">
                {isWs ? (
                    <WsConnectionStats
                        wsState={wsState}
                        frameCount={wsFrames.length}
                        wsConnectedAt={wsConnectedAt}
                        handshake={wsHandshake}
                        className="min-w-0 flex-1 border-0 bg-transparent"
                    />
                ) : isLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                        {t('response.loading')}
                    </div>
                ) : response ? (
                    <ResponseStats
                        response={response}
                        className="min-w-0 flex-1 border-0 bg-transparent py-2 pl-3 pr-0"
                    />
                ) : (
                    <span className="px-3 py-2 text-xs font-medium text-muted-foreground">
                        {t('response.title')}
                    </span>
                )}
            </div>
            <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                aria-expanded={!panelCollapsed}
                aria-label={collapseLabel}
                title={collapseLabel}
                onClick={togglePanelCollapse}
            >
                {panelCollapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
        </div>
    )

    if (isWs) {
        return (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
                {header}
                {!panelCollapsed && (
                    <Tabs
                        value={activeTab}
                        onValueChange={(val) => setActiveTab(String(val))}
                        className="flex min-h-0 flex-1 flex-col overflow-hidden"
                    >
                        <div className="w-full border-b border-border">
                            <TabsList variant="line" className="w-fit justify-start rounded-none px-3">
                                <TabsTrigger className="w-[120px]" value="body">
                                    {t('websocket.frames')}
                                </TabsTrigger>
                                <TabsTrigger className="w-[120px]" value="console">
                                    {t('response.console')}
                                    {consoleLogs.length > 0 && (
                                        <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                            {consoleLogs.length}
                                        </span>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                        </div>
                        <TabsContent value="body" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            <WsMessagePanel frames={wsFrames} handshake={wsHandshake} />
                        </TabsContent>
                        <TabsContent value="console" className="min-h-0 flex-1 overflow-hidden">
                            <ConsolePanel />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        )
    }

    const contentType = response?.headers['content-type'] ?? response?.headers['Content-Type']
    const emptyHint = (
        <div className="flex h-full min-h-[8rem] items-center justify-center text-sm text-muted-foreground">
            {t('response.sendToSee')}
        </div>
    )

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {header}
            {!panelCollapsed && (
                <Tabs
                    value={activeTab}
                    onValueChange={(val) => setActiveTab(String(val))}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                    <div className="w-full border-b border-border">
                        <TabsList variant="line" className="w-fit justify-start rounded-none px-3">
                            <TabsTrigger className="w-[120px]" value="body">
                                {t('response.body')}
                            </TabsTrigger>
                            <TabsTrigger className="w-[120px]" value="headers">
                                {t('response.headers')}
                            </TabsTrigger>
                            <TabsTrigger className="w-[120px]" value="cookies">
                                {t('response.cookies')}
                            </TabsTrigger>
                            <TabsTrigger className="w-[120px]" value="console">
                                {t('response.console')}
                                {consoleLogs.length > 0 && (
                                    <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                        {consoleLogs.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>
                    </div>
                    <TabsContent value="body" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {isLoading && !response ? (
                            <Spinner />
                        ) : response ? (
                            <ResponseBody body={response.body} contentType={contentType} />
                        ) : (
                            emptyHint
                        )}
                    </TabsContent>
                    <TabsContent value="headers" className="min-h-0 flex-1 overflow-auto">
                        {response ? <ResponseHeaders headers={response.headers} /> : emptyHint}
                    </TabsContent>
                    <TabsContent value="cookies" className="min-h-0 flex-1 overflow-auto">
                        {response ? <ResponseCookies response={response} /> : emptyHint}
                    </TabsContent>
                    <TabsContent value="console" className="min-h-0 flex-1 overflow-hidden">
                        <ConsolePanel />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    )
}
