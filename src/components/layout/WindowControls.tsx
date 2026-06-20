import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isMacOS } from '@/lib/platform'
import { useIsTauri } from '@/hooks/useIsTauri'

function RestoreIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 10 10"
            aria-hidden
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
        >
            <rect x="2.5" y="0.5" width="6.5" height="6.5" rx="0.5" />
            <path d="M0.5 3.5V9.5H6.5" />
        </svg>
    )
}

type WindowControlsProps = {
    className?: string
}

export default function WindowControls({ className }: WindowControlsProps) {
    const { t } = useTranslation()
    const isTauri = useIsTauri()
    const [maximized, setMaximized] = useState(false)

    useEffect(() => {
        if (!isTauri) return
        let unlisten: (() => void) | undefined
        void (async () => {
            const { getCurrentWindow } = await import('@tauri-apps/api/window')
            const win = getCurrentWindow()
            setMaximized(await win.isMaximized())
            unlisten = await win.onResized(async () => {
                setMaximized(await win.isMaximized())
            })
        })()
        return () => {
            unlisten?.()
        }
    }, [isTauri])

    const withWindow = useCallback(
        (action: (win: import('@tauri-apps/api/window').Window) => Promise<void>) => {
            void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
                action(getCurrentWindow())
            )
        },
        []
    )

    if (!isTauri || isMacOS()) return null

    const btn =
        'inline-flex h-12 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground'

    return (
        <div
            data-tauri-no-drag
            className={cn(
                'flex shrink-0 items-stretch border-l border-border/70',
                className
            )}
        >
            <button
                type="button"
                data-tauri-no-drag
                className={btn}
                title={t('window.minimize')}
                aria-label={t('window.minimize')}
                onClick={() => withWindow((win) => win.minimize())}
            >
                <Minus className="size-3.5" strokeWidth={2.25} />
            </button>
            <button
                type="button"
                data-tauri-no-drag
                className={btn}
                title={maximized ? t('window.restore') : t('window.maximize')}
                aria-label={maximized ? t('window.restore') : t('window.maximize')}
                onClick={() => withWindow((win) => win.toggleMaximize())}
            >
                {maximized ? (
                    <RestoreIcon className="size-2.5" />
                ) : (
                    <Square className="size-3" strokeWidth={2} />
                )}
            </button>
            <button
                type="button"
                data-tauri-no-drag
                className={cn(
                    btn,
                    'hover:bg-destructive hover:text-destructive-foreground'
                )}
                title={t('window.closeApp')}
                aria-label={t('window.closeApp')}
                onClick={() => withWindow((win) => win.close())}
            >
                <X className="size-3.5" strokeWidth={2.25} />
            </button>
        </div>
    )
}
