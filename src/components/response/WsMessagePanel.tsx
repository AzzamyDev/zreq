import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { WsFrame, WsHandshake } from '../../types'

function decodePreview(data: string, isBinary?: boolean): string {
    if (!isBinary) return data
    try {
        const raw = atob(data)
        const hex = [...raw.slice(0, 64)]
            .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
            .join(' ')
        return raw.length > 64 ? `${hex} …` : hex
    } catch {
        return data.slice(0, 80)
    }
}

interface WsMessagePanelProps {
    frames: WsFrame[]
    handshake: WsHandshake | null
}

export default function WsMessagePanel({ frames, handshake }: WsMessagePanelProps) {
    const { t } = useTranslation()
    const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing' | 'system'>('all')
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})

    const filtered = frames.filter((f) => filter === 'all' || f.direction === filter)

    const borderColor = (frame: WsFrame) => {
        if (frame.direction === 'outgoing') return 'border-l-[var(--dracula-green)]'
        if (frame.direction === 'incoming') return 'border-l-[var(--dracula-purple)]'
        return 'border-l-muted-foreground'
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {handshake && Object.keys(handshake.headers).length > 0 && (
                <div className="shrink-0 border-b border-border bg-muted/10 px-3 py-2">
                    <div className="mb-1 text-xs font-semibold text-muted-foreground">{t('websocket.handshake')}</div>
                    <div className="max-h-24 overflow-auto font-mono text-[11px] text-muted-foreground">
                        {Object.entries(handshake.headers).map(([k, v]) => (
                            <div key={k}>
                                <span className="text-[var(--dracula-cyan)]">{k}</span>: {v}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
                {(['all', 'incoming', 'outgoing', 'system'] as const).map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={cn(
                            'rounded-md px-2.5 py-1 text-[11px] capitalize transition-colors',
                            filter === key
                                ? 'bg-primary/20 text-primary'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                        )}
                    >
                        {key}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">
                {filtered.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        {t('websocket.noFramesHint')}
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {filtered.map((frame) => {
                            const isOpen = expanded[frame.id]
                            const preview = decodePreview(frame.data, frame.isBinary)
                            const showFull = isOpen || preview.length <= 120
                            return (
                                <li
                                    key={frame.id}
                                    className={cn(
                                        'rounded-r border border-border/50 border-l-4 bg-[#16171f]/80 px-3 py-2',
                                        borderColor(frame),
                                    )}
                                >
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <span>{new Date(frame.timestamp).toLocaleTimeString()}</span>
                                        <span className="uppercase">{frame.opcode ?? frame.direction}</span>
                                        <span>{frame.direction}</span>
                                    </div>
                                    <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-foreground">
                                        {showFull
                                            ? frame.isBinary
                                                ? decodePreview(frame.data, true)
                                                : frame.data
                                            : `${preview.slice(0, 120)}…`}
                                    </pre>
                                    {(frame.data.length > 120 || frame.isBinary) && (
                                        <button
                                            type="button"
                                            className="mt-1 text-[10px] text-[var(--dracula-cyan)] hover:underline"
                                            onClick={() =>
                                                setExpanded((prev) => ({ ...prev, [frame.id]: !prev[frame.id] }))
                                            }
                                        >
                                            {isOpen ? t('websocket.showLess') : t('websocket.showFull')}
                                        </button>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
