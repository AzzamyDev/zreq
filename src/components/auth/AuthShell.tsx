import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe2, Layers, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import AppLogo from '@/components/AppLogo'
import DesktopDragHeader from '@/components/layout/DesktopDragHeader'
import { useInstanceStore } from '@/store/instanceStore'

type AuthShellProps = {
    title: string
    description?: string
    pill?: string
    showInstanceBadge?: boolean
    children: ReactNode
    className?: string
}

function instanceHostname(baseUrl: string): string {
    try {
        return new URL(baseUrl).host
    } catch {
        return baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    }
}

export default function AuthShell({
    title,
    description,
    pill,
    showInstanceBadge = false,
    children,
    className,
}: AuthShellProps) {
    const { t } = useTranslation()
    const activeBaseUrl = useInstanceStore((s) => s.getActiveBaseUrl())
    const instanceLabel = instanceHostname(activeBaseUrl)

    const bullets = [
        { icon: Globe2, text: t('auth.shellBullet1') },
        { icon: Layers, text: t('auth.shellBullet2') },
        { icon: Zap, text: t('auth.shellBullet3') },
    ] as const

    return (
        <div
            className={cn(
                'auth-nebula-shell relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden text-foreground',
                className
            )}
        >
            <DesktopDragHeader />
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div aria-hidden className="auth-nebula-grid" />
                <div aria-hidden className="auth-nebula-orb auth-nebula-orb-a" />
                <div aria-hidden className="auth-nebula-orb auth-nebula-orb-b" />

                <div className="relative z-10 mx-auto flex h-full w-full min-w-0 max-w-[1280px] flex-col lg:flex-row lg:items-stretch">
                    <aside className="relative hidden min-h-0 min-w-0 flex-1 flex-col justify-between gap-8 p-8 lg:flex lg:p-10 2xl:gap-12 2xl:p-[4.75rem]">
                        <div>
                            <div className="auth-nebula-logo">
                                <AppLogo className="size-7" />
                            </div>
                            <p className="auth-nebula-eyebrow mt-8 2xl:mt-11">{t('auth.shellEyebrow')}</p>
                            <h2 className="auth-nebula-heading mt-[1.125rem] max-w-[560px]">
                                {t('auth.shellTitle')}
                            </h2>
                            <p className="mt-6 max-w-[430px] text-base leading-[1.65] text-[var(--auth-nebula-fg-soft)]">
                                {t('auth.shellSubtitle')}
                            </p>
                        </div>
                        <ul className="flex max-w-[420px] flex-col gap-5">
                            {bullets.map(({ icon: Icon, text }, i) => (
                                <li key={i} className="flex items-start gap-3.5">
                                    <span className="auth-nebula-bullet-icon shrink-0">
                                        <Icon className="size-[18px]" aria-hidden />
                                    </span>
                                    <span className="text-sm leading-snug text-[var(--auth-nebula-fg-muted)]">
                                        {text}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </aside>

                    <div className="flex min-h-0 min-w-0 flex-col justify-center px-5 py-8 sm:px-8 sm:py-10 lg:w-[min(556px,46%)] lg:shrink-0 lg:px-6 lg:py-10 xl:pr-12 2xl:py-[4.75rem] 2xl:pr-[4.75rem]">
                        <div className="mb-8 flex items-center gap-3 lg:hidden">
                            <div className="auth-nebula-logo size-11 shrink-0">
                                <AppLogo className="size-7" />
                            </div>
                            <div>
                                <p className="auth-nebula-eyebrow text-[0.65rem] tracking-[0.18em]">
                                    {t('auth.shellEyebrow')}
                                </p>
                                <p className="mt-1 text-base font-semibold">{t('auth.appTitle')}</p>
                            </div>
                        </div>

                        <div className="auth-nebula-card w-full max-w-[430px] lg:ml-auto">
                            <div className="p-8 xl:p-[2.375rem]">
                                {showInstanceBadge && instanceLabel ? (
                                    <div className="auth-nebula-instance-badge">
                                        <span className="auth-nebula-instance-dot" aria-hidden />
                                        {instanceLabel}
                                    </div>
                                ) : pill ? (
                                    <span className="auth-nebula-pill">{pill}</span>
                                ) : null}

                                <h1 className="auth-nebula-card-title mt-[1.375rem]">{title}</h1>
                                {description ? (
                                    <p className="mt-1.5 text-sm text-[var(--auth-nebula-fg-soft)]">
                                        {description}
                                    </p>
                                ) : null}
                                <div className="mt-6 space-y-5 2xl:mt-7 2xl:space-y-6">{children}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
