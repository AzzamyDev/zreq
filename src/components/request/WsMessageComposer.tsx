import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { Radio, Send, Zap } from 'lucide-react'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'

interface WsMessageComposerProps {
    onSend: (data: string, isBinary: boolean) => void
    onPing: (payload?: string) => void
    disabled?: boolean
}

export default function WsMessageComposer({ onSend, onPing, disabled }: WsMessageComposerProps) {
    const { t } = useTranslation()
    const { activeRequest, setActiveRequest, activeTabId } = useAppStore()
    const [mode, setMode] = useState<'text' | 'binary'>('text')
    const [message, setMessage] = useState(activeRequest.messageTemplate ?? '')
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setMessage(activeRequest.messageTemplate ?? '')
    }, [activeTabId, activeRequest.messageTemplate])

    const handleSend = useCallback(() => {
        if (!message.trim() && mode === 'text') return
        onSend(message, mode === 'binary')
        setActiveRequest({ messageTemplate: message })
    }, [message, mode, onSend, setActiveRequest])

    const loadBinaryFile = useCallback(async () => {
        try {
            const selected = await open({
                multiple: false,
            })
            if (!selected || Array.isArray(selected)) return
            const bytes = await readFile(selected)
            const b64 = btoa(String.fromCharCode(...bytes))
            setMessage(b64)
            setMode('binary')
        } catch {
            fileInputRef.current?.click()
        }
    }, [])

    const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const buf = await file.arrayBuffer()
        const bytes = new Uint8Array(buf)
        const b64 = btoa(String.fromCharCode(...bytes))
        setMessage(b64)
        setMode('binary')
        e.target.value = ''
    }, [])

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border border-border p-0.5">
                    <button
                        type="button"
                        onClick={() => setMode('text')}
                        className={`rounded px-2.5 py-1 text-xs font-medium ${
                            mode === 'text'
                                ? 'bg-primary/20 text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t('websocket.text')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('binary')}
                        className={`rounded px-2.5 py-1 text-xs font-medium ${
                            mode === 'binary'
                                ? 'bg-primary/20 text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t('websocket.binary')}
                    </button>
                </div>
                {mode === 'binary' && (
                    <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => void loadBinaryFile()}>
                        {t('websocket.loadFile')}
                    </Button>
                )}
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleFileInput(e)} />
            </div>

            <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={disabled}
                placeholder={mode === 'text' ? t('websocket.messagePlaceholder') : t('websocket.binaryPlaceholder')}
                className="min-h-[140px] flex-1 resize-none rounded-md border border-input bg-[#16171f] p-4 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--dracula-cyan)]/40 disabled:opacity-60"
            />

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    disabled={disabled}
                    onClick={handleSend}
                    className="h-9 gap-2 px-4 py-2"
                >
                    <Send className="size-4" />
                    {t('websocket.sendMessage')}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onPing()}
                    className="h-9 gap-2 px-4 py-2"
                >
                    <Zap className="size-4" />
                    {t('websocket.sendPing')}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onPing(mode === 'binary' && message ? message : undefined)}
                    className="h-9 gap-2 px-4 py-2 text-xs"
                >
                    <Radio className="size-3.5" />
                    {t('websocket.sendPingWithPayload')}
                </Button>
            </div>
        </div>
    )
}
