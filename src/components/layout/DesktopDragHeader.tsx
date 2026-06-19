import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import AppLogo from '@/components/AppLogo'
import WindowControls from '@/components/layout/WindowControls'
import { useIsTauri } from '@/hooks/useIsTauri'
import { cn } from '@/lib/utils'

type DesktopDragHeaderProps = {
    className?: string
    children?: ReactNode
}

/** Slim draggable title strip for screens without the main TopBar (auth, onboarding). */
export default function DesktopDragHeader({ className, children }: DesktopDragHeaderProps) {
    const { t } = useTranslation()
    const isTauri = useIsTauri()

    if (!isTauri) return null

    return (
        <header
            className={cn(
                'flex h-9 shrink-0 items-stretch border-b border-border/70 bg-card/90 backdrop-blur-sm',
                className
            )}
        >
            <div
                data-tauri-drag-region
                className="flex min-w-0 flex-1 items-center gap-2 px-3 select-none"
            >
                <AppLogo className="size-4 shrink-0 opacity-90" />
                <span className="truncate text-xs font-medium tracking-wide text-muted-foreground">
                    {t('auth.appTitle')}
                </span>
                {children}
            </div>
            <WindowControls className="[&_button]:h-9 [&_button]:w-10" />
        </header>
    )
}
