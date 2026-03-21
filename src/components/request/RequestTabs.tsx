import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { useAppStore } from '../../store'
import KVEditor from './KVEditor'
import AuthEditor from './AuthEditor'
import BodyEditor from './BodyEditor'
import ScriptEditor from './ScriptEditor'
import type { KV, AuthConfig, RequestBody } from '../../types'

function countActive(pairs: KV[]): number {
    return pairs.filter((p) => p.enabled && p.key).length
}

function Badge({ count }: { count: number }) {
    if (count === 0) return null
    return (
        <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {count}
        </span>
    )
}

export default function RequestTabs() {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<string>('params')
    const { activeRequest, setActiveRequest } = useAppStore()

    const paramsCount = countActive(activeRequest.params)
    const headersCount = countActive(activeRequest.headers)

    const bodyActive =
        activeRequest.body.type !== 'none' && !!activeRequest.body.content ? 1 : 0
    const authActive = activeRequest.auth.type !== 'none' ? 1 : 0

    return (
        <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(String(val))}
            className="flex h-full min-h-0 flex-col"
        >
            <div className='border-b border-border w-full'>
                <TabsList variant="line" className="w-fit justify-start rounded-none px-3">
                    <TabsTrigger id="request-tab-params" className="min-w-[120px]" value="params">
                        {t('request.params')}
                        <Badge count={paramsCount} />
                    </TabsTrigger>
                    <TabsTrigger className="min-w-[120px]" value="headers">
                        {t('request.headers')}
                        <Badge count={headersCount} />
                    </TabsTrigger>
                    <TabsTrigger className="min-w-[120px]" value="body">
                        {t('request.body')}
                        <Badge count={bodyActive} />
                    </TabsTrigger>
                    <TabsTrigger className="min-w-[120px]" value="auth">
                        {t('request.auth')}
                        <Badge count={authActive} />
                    </TabsTrigger>
                    <TabsTrigger className="min-w-[120px]" value="pre-request">{t('request.preRequest')}</TabsTrigger>
                    <TabsTrigger className="min-w-[120px]" value="post-response">{t('request.postResponse')}</TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="params" className="min-h-0 flex-1 overflow-auto p-3">
                <KVEditor
                    pairs={activeRequest.params}
                    onChange={(pairs: KV[]) => setActiveRequest({ params: pairs })}
                    keyPlaceholder={t('request.param')}
                    valuePlaceholder={t('common.value')}
                />
            </TabsContent>

            <TabsContent value="headers" className="min-h-0 flex-1 overflow-auto p-3">
                <KVEditor
                    pairs={activeRequest.headers}
                    onChange={(pairs: KV[]) => setActiveRequest({ headers: pairs })}
                    keyPlaceholder={t('request.header')}
                    valuePlaceholder={t('common.value')}
                />
            </TabsContent>

            <TabsContent value="body" className="min-h-0 flex-1 overflow-auto" keepMounted>
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

            <TabsContent value="pre-request" className="min-h-0 flex-1 overflow-auto" keepMounted>
                <ScriptEditor
                    docVariant="pre"
                    value={activeRequest.scripts?.preRequest ?? ''}
                    onChange={(v) => setActiveRequest({ scripts: { ...activeRequest.scripts, preRequest: v } })}
                    label={t('request.scriptPreLabel')}
                />
            </TabsContent>

            <TabsContent value="post-response" className="min-h-0 flex-1 overflow-auto" keepMounted>
                <ScriptEditor
                    docVariant="post"
                    value={activeRequest.scripts?.postResponse ?? ''}
                    onChange={(v) => setActiveRequest({ scripts: { ...activeRequest.scripts, postResponse: v } })}
                    label={t('request.scriptPostLabel')}
                />
            </TabsContent>
        </Tabs>
    )
}
