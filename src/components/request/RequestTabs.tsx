import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { useAppStore } from '../../store'
import KVEditor from './KVEditor'
import AuthEditor from './AuthEditor'
import BodyEditor from './BodyEditor'
import ScriptsPanel from './ScriptsPanel'
import WsMessageComposer from './WsMessageComposer'
import WsSavedMessages from './WsSavedMessages'
import type { KV, AuthConfig, RequestBody } from '../../types'

function countActive(pairs: KV[]): number {
    return pairs.filter((p) => p.enabled && p.key).length
}

function TabDot({ show }: { show: boolean }) {
    if (!show) return null
    return (
        <span
            className="bg-primary ml-1.5 inline-block size-1.5 shrink-0 rounded-full"
            aria-hidden
        />
    )
}

const TAB_TRIGGER_CLASS =
    'min-w-[120px] border-transparent px-3 pb-2.5 pt-1 data-active:border-transparent data-active:bg-transparent data-active:after:-bottom-px data-active:after:h-0.5 data-active:after:bg-primary dark:data-active:border-transparent dark:data-active:bg-transparent'

interface RequestTabsProps {
    onWsSend: (data: string, isBinary: boolean) => void
    onWsPing: (payload?: string) => void
    wsConnected: boolean
}

export default function RequestTabs({ onWsSend, onWsPing, wsConnected }: RequestTabsProps) {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<string>('params')
    const { activeRequest, setActiveRequest } = useAppStore()
    const protocol = activeRequest.protocol ?? 'http'
    const isWs = protocol === 'ws'

    const paramsCount = countActive(activeRequest.params)
    const headersCount = countActive(activeRequest.headers)

    const bodyActive =
        activeRequest.body.type !== 'none' && !!activeRequest.body.content ? 1 : 0
    const authActive =
        activeRequest.auth.type !== 'none' ||
        (activeRequest.auth.type === 'none' &&
            !activeRequest.auth.overrideParent &&
            !!activeRequest.folderId)
            ? 1
            : 0
    const scriptsCount = [activeRequest.scripts?.preRequest, activeRequest.scripts?.postResponse].filter(
        (s) => !!s?.trim()
    ).length
    const savedCount = activeRequest.savedMessages?.length ?? 0
    const messageActive = activeRequest.messageTemplate?.trim() ? 1 : 0

    if (isWs) {
        return (
            <Tabs
                value={activeTab === 'params' || activeTab === 'body' ? 'message' : activeTab}
                onValueChange={(val) => setActiveTab(String(val))}
                className="flex h-full min-h-0 flex-col"
            >
                <div className="w-full border-b border-border">
                    <TabsList variant="line" className="w-fit items-end justify-start gap-1 rounded-none px-3">
                        <TabsTrigger
                            className={`${TAB_TRIGGER_CLASS} data-active:after:bg-[var(--dracula-cyan)]/50`}
                            value="headers"
                        >
                            {t('request.headers')}
                            <TabDot show={headersCount > 0} />
                        </TabsTrigger>
                        <TabsTrigger
                            className={`${TAB_TRIGGER_CLASS} data-active:after:bg-[var(--dracula-cyan)]/50`}
                            value="auth"
                        >
                            {t('request.auth')}
                            <TabDot show={authActive > 0} />
                        </TabsTrigger>
                        <TabsTrigger
                            className={`${TAB_TRIGGER_CLASS} data-active:after:bg-[var(--dracula-cyan)]/50`}
                            value="message"
                        >
                            {t('websocket.message')}
                            <TabDot show={messageActive > 0} />
                        </TabsTrigger>
                        <TabsTrigger
                            className={`${TAB_TRIGGER_CLASS} data-active:after:bg-[var(--dracula-cyan)]/50`}
                            value="saved"
                        >
                            {t('websocket.savedMessages')}
                            <TabDot show={savedCount > 0} />
                        </TabsTrigger>
                        <TabsTrigger
                            className={`${TAB_TRIGGER_CLASS} data-active:after:bg-[var(--dracula-cyan)]/50`}
                            value="scripts"
                        >
                            {t('request.scripts')}
                            <TabDot show={scriptsCount > 0} />
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="headers" className="min-h-0 flex-1 overflow-auto p-3">
                    <KVEditor
                        pairs={activeRequest.headers}
                        onChange={(pairs: KV[]) => setActiveRequest({ headers: pairs })}
                        keyPlaceholder={t('request.header')}
                        valuePlaceholder={t('common.value')}
                    />
                </TabsContent>

                <TabsContent value="auth" className="min-h-0 flex-1 overflow-auto">
                    <AuthEditor
                        auth={activeRequest.auth}
                        onChange={(auth: AuthConfig) => setActiveRequest({ auth })}
                    />
                </TabsContent>

                <TabsContent value="message" className="min-h-0 flex-1 overflow-hidden">
                    <WsMessageComposer onSend={onWsSend} onPing={onWsPing} disabled={!wsConnected} />
                </TabsContent>

                <TabsContent value="saved" className="min-h-0 flex-1 overflow-auto">
                    <WsSavedMessages onSend={onWsSend} />
                </TabsContent>

                <TabsContent value="scripts" className="min-h-0 flex-1 overflow-hidden" keepMounted>
                    <ScriptsPanel
                        preRequest={activeRequest.scripts?.preRequest ?? ''}
                        postResponse={activeRequest.scripts?.postResponse ?? ''}
                        onPreChange={(v) =>
                            setActiveRequest({ scripts: { ...activeRequest.scripts, preRequest: v } })
                        }
                        onPostChange={(v) =>
                            setActiveRequest({ scripts: { ...activeRequest.scripts, postResponse: v } })
                        }
                    />
                </TabsContent>
            </Tabs>
        )
    }

    return (
        <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(String(val))}
            className="flex h-full min-h-0 flex-col"
        >
            <div className='border-b border-border w-full'>
                <TabsList variant="line" className="w-fit items-end justify-start gap-1 rounded-none px-3">
                    <TabsTrigger
                        id="request-tab-params"
                        className={TAB_TRIGGER_CLASS}
                        value="params"
                    >
                        {t('request.params')}
                        <TabDot show={paramsCount > 0} />
                    </TabsTrigger>
                    <TabsTrigger className={TAB_TRIGGER_CLASS} value="headers">
                        {t('request.headers')}
                        <TabDot show={headersCount > 0} />
                    </TabsTrigger>
                    <TabsTrigger className={TAB_TRIGGER_CLASS} value="body">
                        {t('request.body')}
                        <TabDot show={bodyActive > 0} />
                    </TabsTrigger>
                    <TabsTrigger className={TAB_TRIGGER_CLASS} value="auth">
                        {t('request.auth')}
                        <TabDot show={authActive > 0} />
                    </TabsTrigger>
                    <TabsTrigger className={TAB_TRIGGER_CLASS} value="scripts">
                        {t('request.scripts')}
                        <TabDot show={scriptsCount > 0} />
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="params" className="min-h-0 flex-1 overflow-auto p-3">
                <KVEditor
                    pairs={activeRequest.params}
                    onChange={(pairs: KV[]) => setActiveRequest({ params: pairs })}
                    keyPlaceholder={t('common.key')}
                    valuePlaceholder={t('common.value')}
                    sectionTitle={t('request.queryParams')}
                />
            </TabsContent>

            <TabsContent value="headers" className="min-h-0 flex-1 overflow-auto p-3">
                <KVEditor
                    pairs={activeRequest.headers}
                    onChange={(pairs: KV[]) => setActiveRequest({ headers: pairs })}
                    keyPlaceholder={t('common.key')}
                    valuePlaceholder={t('common.value')}
                    sectionTitle={t('request.requestHeaders')}
                />
            </TabsContent>

            <TabsContent value="body" className="min-h-0 flex-1 overflow-hidden" keepMounted>
                <BodyEditor
                    body={activeRequest.body}
                    onChange={(body: RequestBody) => setActiveRequest({ body })}
                />
            </TabsContent>

            <TabsContent value="auth" className="min-h-0 flex-1 overflow-auto">
                <AuthEditor
                    auth={activeRequest.auth}
                    onChange={(auth: AuthConfig) => setActiveRequest({ auth })}
                />
            </TabsContent>

            <TabsContent value="scripts" className="min-h-0 flex-1 overflow-hidden" keepMounted>
                <ScriptsPanel
                    preRequest={activeRequest.scripts?.preRequest ?? ''}
                    postResponse={activeRequest.scripts?.postResponse ?? ''}
                    onPreChange={(v) =>
                        setActiveRequest({ scripts: { ...activeRequest.scripts, preRequest: v } })
                    }
                    onPostChange={(v) =>
                        setActiveRequest({ scripts: { ...activeRequest.scripts, postResponse: v } })
                    }
                />
            </TabsContent>
        </Tabs>
    )
}
