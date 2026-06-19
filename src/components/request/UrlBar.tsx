import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { flushSync } from 'react-dom'
import { useAppStore } from '../../store'
import MethodSelect from './MethodSelect'
import WsUrlBar from './WsUrlBar'
import type { HttpMethod } from '../../types'
import VarTemplateField from './VarTemplateField'
import { composeUrl, parseUrlToParams } from '../../lib/query-params'
import { SendHorizonal } from 'lucide-react'
import type { WsConnectionState } from '../../types'

interface UrlBarProps {
    onSend: () => void
    onWsConnect: () => void
    onWsDisconnect: () => void
    isLoading: boolean
    wsState: WsConnectionState
}

export default function UrlBar({ onSend, onWsConnect, onWsDisconnect, isLoading, wsState }: UrlBarProps) {
    const { t } = useTranslation()
    const { activeRequest, activeTabId, setActiveRequest } = useAppStore()
    const protocol = activeRequest.protocol ?? 'http'
    const composedUrl = useMemo(
        () => composeUrl(activeRequest.url || '', activeRequest.params),
        [activeRequest.url, activeRequest.params],
    )
    const [draftUrl, setDraftUrl] = useState<string | null>(null)

    useEffect(() => {
        setDraftUrl(null)
    }, [activeTabId, activeRequest.itemId])

    const handleUrlFocus = useCallback(() => {
        setDraftUrl((current) => current ?? composedUrl)
    }, [composedUrl])

    const handleUrlBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
        const next = e.relatedTarget as Node | null
        if (!e.currentTarget.contains(next)) {
            setDraftUrl(null)
        }
    }, [])

    useEffect(() => {
        if (protocol === 'ws') return
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                if (!isLoading) onSend()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onSend, isLoading, protocol])

    return (
        <div
            className={`relative flex ${protocol === 'ws' ? 'items-start gap-2.5' : 'items-center gap-2.5'}`}
        >
            {protocol === 'ws' ? (
                <WsUrlBar
                    onConnect={onWsConnect}
                    onDisconnect={onWsDisconnect}
                    wsState={wsState}
                />
            ) : (
                <>
                    <MethodSelect
                        value={activeRequest.method}
                        onChange={(val) => setActiveRequest({ method: val as HttpMethod })}
                    />

                    <div
                        className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-md border border-input bg-[#1a1b26]"
                        onFocusCapture={handleUrlFocus}
                        onBlurCapture={handleUrlBlur}
                    >
                        <VarTemplateField
                            value={draftUrl ?? composedUrl}
                            onChange={(fullUrl) => {
                                setDraftUrl(fullUrl)
                                const { baseUrl, params } = parseUrlToParams(
                                    fullUrl,
                                    activeRequest.params,
                                )
                                flushSync(() => setActiveRequest({ url: baseUrl, params }))
                            }}
                            onMetaEnter={() => {
                                if (!isLoading) onSend()
                            }}
                            metaEnterDisabled={isLoading}
                            className="h-full w-full min-w-0 border-y border-[color-mix(in_srgb,#6272a4_38%,transparent)] bg-[#16171f] px-1 py-0"
                        />
                    </div>

                    <button
                        onClick={onSend}
                        disabled={isLoading}
                        className="flex h-9 min-w-[72px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isLoading ? (
                            <>
                                <svg
                                    className="h-4 w-4 animate-spin"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                    />
                                </svg>
                                <span>{t('request.sending')}</span>
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <SendHorizonal className="size-4" />
                                <span>{t('request.send')}</span>
                            </div>
                        )}
                    </button>
                </>
            )}
        </div>
    )
}
