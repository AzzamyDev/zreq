import type { ReactNode } from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import AppLogo from '@/components/AppLogo'
import WindowControls from '@/components/layout/WindowControls'
import { useMacWindowFullscreen } from '@/hooks/useMacWindowFullscreen'
import { useIsTauri } from '@/hooks/useIsTauri'
import {
    macTitlebarActive,
    macTrafficSpacerClass,
    MACOS_DRAG_HEADER_H,
} from '@/lib/platform'
import { cn } from '@/lib/utils'

type DesktopDragHeaderProps = {
    className?: string
    children?: ReactNode
}

/** Slim draggable title strip for screens without the main TopBar (auth, onboarding). */
export default function DesktopDragHeader({ className, children }: DesktopDragHeaderProps) {
    const { t } = useTranslation()
    const isTauri = useIsTauri()
    const macTitlebar = macTitlebarActive(isTauri)
    const fullscreen = useMacWindowFullscreen()
    const trafficSpacer = macTrafficSpacerClass(fullscreen)

    const toggleMacMaximize = useCallback(() => {
        void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
            getCurrentWindow().toggleMaximize()
        )
    }, [])

    if (!isTauri) return null

    return (
        <header
            className={cn(
                'flex shrink-0 items-stretch border-b border-border/70 bg-card/90 backdrop-blur-sm',
                macTitlebar ? cn(MACOS_DRAG_HEADER_H, 'macos-window-chrome') : 'h-9',
                className
            )}
        >
            {macTitlebar ? (
                <>
                    <div className={trafficSpacer} aria-hidden />
                    <div
                        onDoubleClick={toggleMacMaximize}
                        className="flex min-w-0 shrink-0 cursor-default items-center gap-2 select-none"
                    >
                        <AppLogo className="size-4 shrink-0 opacity-90" />
                        <span className="truncate text-xs font-medium tracking-wide text-muted-foreground">
                            {t('auth.appTitle')}
                        </span>
                        {children}
                    </div>
                    <div
                        className="min-w-0 flex-1 cursor-default select-none"
                        onDoubleClick={toggleMacMaximize}
                    />
                </>
            ) : (
                <div
                    data-tauri-drag-region
                    className="flex min-w-0 flex-1 cursor-default items-center gap-2 px-3 select-none"
                >
                    <AppLogo className="size-4 shrink-0 opacity-90" />
                    <span className="truncate text-xs font-medium tracking-wide text-muted-foreground">
                        {t('auth.appTitle')}
                    </span>
                    {children}
                </div>
            )}
            <WindowControls className="[&_button]:h-9 [&_button]:w-10" />
        </header>
    )
}
