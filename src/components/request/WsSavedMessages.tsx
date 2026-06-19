import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import { BookmarkPlus, Play } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import type { WsFrame, WsSavedMessage } from '../../types'

interface WsSavedMessagesProps {
    onSend: (data: string, isBinary: boolean) => void
}

function frameToSaved(frame: WsFrame): WsSavedMessage {
    return {
        id: nanoid(),
        name: `${frame.opcode ?? 'message'} ${new Date(frame.timestamp).toLocaleTimeString()}`,
        direction: frame.direction === 'incoming' ? 'incoming' : 'outgoing',
        data: frame.data,
        isBinary: frame.isBinary,
        timestamp: frame.timestamp,
    }
}

export default function WsSavedMessages({ onSend }: WsSavedMessagesProps) {
    const { t } = useTranslation()
    const activeTabId = useAppStore((s) => s.activeTabId)
    const activeTab = useAppStore((s) => s.tabs.find((tab) => tab.id === s.activeTabId))
    const activeRequest = useAppStore((s) => s.activeRequest)
    const setActiveRequest = useAppStore((s) => s.setActiveRequest)
    const saved = activeRequest.savedMessages ?? []
    const frames = activeTab?.wsFrames ?? []

    const saveFrame = (frame: WsFrame) => {
        const next = [...saved, frameToSaved(frame)]
        setActiveRequest({ savedMessages: next })
    }

    const removeSaved = (id: string) => {
        setActiveRequest({ savedMessages: saved.filter((m) => m.id !== id) })
    }

    const loadTemplate = (msg: WsSavedMessage) => {
        setActiveRequest({ messageTemplate: msg.data })
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 p-3">
            <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('websocket.savedMessages')}
                </h3>
                {saved.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('websocket.noSavedMessages')}</p>
                ) : (
                    <ul className="space-y-1">
                        {saved.map((msg) => (
                            <li
                                key={msg.id}
                                className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-xs"
                            >
                                <span
                                    className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] ${
                                        msg.direction === 'outgoing'
                                            ? 'bg-[var(--dracula-green)]/15 text-[var(--dracula-green)]'
                                            : 'bg-[var(--dracula-purple)]/15 text-[var(--dracula-purple)]'
                                    }`}
                                >
                                    {msg.direction === 'outgoing' ? '↑' : '↓'}
                                    {msg.isBinary ? ' bin' : ''}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-medium">{msg.name ?? msg.data.slice(0, 40)}</span>
                                <Button type="button" variant="ghost" size="icon-xs" onClick={() => loadTemplate(msg)} title={t('websocket.useAsTemplate')}>
                                    <Play className="size-3.5" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => onSend(msg.data, !!msg.isBinary)}
                                    title={t('websocket.sendMessage')}
                                >
                                    <Play className="size-3.5 rotate-90" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeSaved(msg.id)}>
                                    ×
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {activeTabId && frames.length > 0 && (
                <section className="min-h-0 flex-1 overflow-auto">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('websocket.saveToCollection')}
                    </h3>
                    <ul className="space-y-1">
                        {[...frames].reverse().slice(0, 20).map((frame) => (
                            <li
                                key={frame.id}
                                className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1 text-xs"
                            >
                                <span className="font-mono text-muted-foreground">{frame.opcode}</span>
                                <span className="min-w-0 flex-1 truncate font-mono">{frame.data.slice(0, 60)}</span>
                                <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2" onClick={() => saveFrame(frame)}>
                                    <BookmarkPlus className="size-3" />
                                    {t('websocket.saveFrame')}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    )
}
