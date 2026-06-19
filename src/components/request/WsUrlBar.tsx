import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PlugZap, Unplug } from 'lucide-react'
import { useAppStore } from '../../store'
import VarTemplateField from './VarTemplateField'
import { Input } from '../ui/input'
import type { WsConnectionState } from '../../types'

interface WsUrlBarProps {
    onConnect: () => void
    onDisconnect: () => void
    wsState: WsConnectionState
}

const STATUS_DOT: Record<WsConnectionState, string> = {
    idle: 'bg-muted-foreground/40',
    connecting: 'bg-[var(--dracula-yellow)] animate-pulse',
    connected: 'bg-[var(--dracula-cyan)] animate-pulse',
    disconnected: 'bg-muted-foreground/60',
    error: 'bg-[var(--dracula-red)]',
}

export default function WsUrlBar({ onConnect, onDisconnect, wsState }: WsUrlBarProps) {
    const { t } = useTranslation()
    const { activeRequest, activeTabId, setActiveRequest } = useAppStore()
    const isConnected = wsState === 'connected'
    const isConnecting = wsState === 'connecting'
    const busy = isConnected || isConnecting

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                if (busy) onDisconnect()
                else onConnect()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [busy, onConnect, onDisconnect])

    const handlePrimary = useCallback(() => {
        if (busy) onDisconnect()
        else onConnect()
    }, [busy, onConnect, onDisconnect])

    const statusLabel = t(`websocket.${wsState}`, { defaultValue: wsState })

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-input bg-[#1a1b26]">
                    <VarTemplateField
                        key={activeTabId}
                        value={activeRequest.url || ''}
                        onChange={(url) => setActiveRequest({ url })}
                        onMetaEnter={handlePrimary}
                        metaEnterDisabled={isConnecting}
                        className="w-full min-w-0 border-y border-[color-mix(in_srgb,#6272a4_38%,transparent)] bg-[#16171f] px-1 py-0"
                    />
                </div>

                <span
                    className="flex h-9 shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
                    title={statusLabel}
                >
                    <span className={`inline-block size-2 rounded-full ${STATUS_DOT[wsState]}`} />
                    <span className="hidden min-w-[4.5rem] sm:inline">{statusLabel}</span>
                </span>

                <button
                    type="button"
                    onClick={handlePrimary}
                    disabled={isConnecting}
                    className={`flex h-9 min-w-[96px] shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${
                        isConnected
                            ? 'border border-[var(--dracula-red)]/40 bg-[#ff5555]/15 text-[var(--dracula-red)] hover:bg-[#ff5555]/25'
                            : 'bg-primary text-primary-foreground hover:opacity-90'
                    }`}
                >
                    {isConnecting ? (
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
                            <span>{t('websocket.connecting')}</span>
                        </>
                    ) : isConnected ? (
                        <>
                            <Unplug className="size-4" />
                            <span>{t('websocket.disconnect')}</span>
                        </>
                    ) : (
                        <>
                            <PlugZap className="size-4" />
                            <span>{t('websocket.connect')}</span>
                        </>
                    )}
                </button>
            </div>

            <div className="flex min-w-0 items-center gap-2">
                <label className="shrink-0 text-xs text-muted-foreground" htmlFor="ws-subprotocols">
                    {t('websocket.subprotocols')}
                </label>
                <Input
                    id="ws-subprotocols"
                    value={activeRequest.subprotocols ?? ''}
                    onChange={(e) => setActiveRequest({ subprotocols: e.target.value })}
                    placeholder="graphql-transport-ws, json"
                    className="h-9 min-h-9 min-w-0 flex-1 px-3 py-2 font-mono text-xs"
                />
            </div>
        </div>
    )
}
