import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe2, Layers, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

type AuthShellProps = {
    title: string
    description?: string
    pill?: string
    children: ReactNode
    className?: string
}

export default function AuthShell({ title, description, pill, children, className }: AuthShellProps) {
    const { t } = useTranslation()
    const bullets = [
        { icon: Globe2, text: t('auth.shellBullet1') },
        { icon: Layers, text: t('auth.shellBullet2') },
        { icon: Zap, text: t('auth.shellBullet3') },
    ] as const

    return (
        <div
            className={cn(
                'relative h-full min-h-0 w-full max-w-full overflow-x-hidden overflow-y-auto bg-background text-foreground',
                className
            )}
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_0%_-20%,color-mix(in_srgb,var(--primary)_22%,transparent),transparent_55%),radial-gradient(ellipse_90%_70%_at_100%_0%,color-mix(in_srgb,var(--dracula-cyan)_12%,transparent),transparent_50%)]"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute -left-40 top-1/4 size-[min(100vw,520px)] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--primary)_35%,transparent)_0%,transparent_68%)] opacity-40 blur-3xl"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute -right-32 bottom-0 size-[min(90vw,480px)] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--dracula-pink)_18%,transparent)_0%,transparent_70%)] opacity-35 blur-3xl"
            />

            <div className="relative z-10 mx-auto grid min-h-full w-full min-w-0 max-w-6xl lg:grid-cols-[1fr_minmax(0,440px)]">
                <aside className="relative hidden flex-col justify-between gap-12 p-10 xl:p-14 lg:flex">
                    <div>
                        <p className="text-primary mb-3 text-xs font-semibold tracking-[0.2em] uppercase">
                            {t('auth.shellEyebrow')}
                        </p>
                        <h2 className="font-heading text-foreground mb-4 max-w-md text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
                            {t('auth.shellTitle')}
                        </h2>
                        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
                            {t('auth.shellSubtitle')}
                        </p>
                    </div>
                    <ul className="max-w-md space-y-4">
                        {bullets.map(({ icon: Icon, text }, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                                <span className="bg-primary/15 text-primary mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl">
                                    <Icon className="size-4" aria-hidden />
                                </span>
                                <span className="text-muted-foreground leading-snug">{text}</span>
                            </li>
                        ))}
                    </ul>
                </aside>

                <div className="flex min-w-0 flex-col justify-center px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
                    <div className="mb-8 flex items-center gap-3 lg:hidden">
                        <div className="bg-primary/20 text-primary flex size-11 items-center justify-center rounded-2xl font-bold tracking-tight">
                            P
                        </div>
                        <div>
                            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                {t('auth.shellEyebrow')}
                            </p>
                            <p className="font-heading text-base font-semibold">{t('auth.appTitle')}</p>
                        </div>
                    </div>

                    <div
                        className={cn(
                            'border-border/80 bg-card/75 w-full rounded-2xl border shadow-[0_24px_80px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl',
                            'ring-foreground/5 ring-1'
                        )}
                    >
                        <div className="p-7 sm:p-8">
                            {pill ? (
                                <span className="bg-primary/15 text-primary mb-4 inline-flex rounded-full px-3 py-1 text-xs font-medium">
                                    {pill}
                                </span>
                            ) : null}
                            <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
                            {description ? (
                                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                                    {description}
                                </p>
                            ) : null}
                            <div className="mt-8 space-y-6">{children}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
