import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { WsConnectionState, WsHandshake } from '../../types'

interface WsConnectionStatsProps {
    wsState: WsConnectionState
    wsConnectedAt: number | null
    frameCount: number
    handshake: WsHandshake | null
    className?: string
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`
    return `${(ms / 1000).toFixed(1)} s`
}

const STATE_CLASS: Record<WsConnectionState, string> = {
    idle: 'bg-muted text-muted-foreground',
    connecting: 'bg-[var(--dracula-cyan)]/20 text-[var(--dracula-cyan)]',
    connected: 'bg-[var(--dracula-green)]/20 text-[var(--dracula-green)]',
    disconnected: 'bg-muted text-muted-foreground',
    error: 'bg-[var(--dracula-red)]/20 text-[var(--dracula-red)]',
}

export default function WsConnectionStats({
    wsState,
    wsConnectedAt,
    frameCount,
    handshake,
    className,
}: WsConnectionStatsProps) {
    const { t } = useTranslation()
    const [, setTick] = useState(0)

    useEffect(() => {
        if (wsState !== 'connected' || !wsConnectedAt) return
        const id = window.setInterval(() => setTick((n) => n + 1), 1000)
        return () => window.clearInterval(id)
    }, [wsState, wsConnectedAt])

    const duration =
        wsState === 'connected' && wsConnectedAt ? formatDuration(Date.now() - wsConnectedAt) : '—'

    const statusLabel =
        wsState === 'connecting'
            ? t('websocket.connecting')
            : wsState === 'connected'
              ? t('websocket.connected')
              : wsState === 'disconnected'
                ? t('websocket.disconnected')
                : wsState === 'error'
                  ? t('websocket.connectionError')
                  : t('websocket.disconnected')

    return (
        <div className={cn('flex flex-wrap items-center gap-3 px-3 py-2 text-xs', className)}>
            <span className={cn('rounded px-2 py-0.5 font-semibold', STATE_CLASS[wsState])}>{statusLabel}</span>
            {handshake?.status != null && (
                <span className="text-muted-foreground">
                    {t('websocket.handshake')} {handshake.status}
                </span>
            )}
            <span className="text-muted-foreground">{duration}</span>
            <span className="text-muted-foreground">
                {frameCount} {t('websocket.frames')}
            </span>
        </div>
    )
}
