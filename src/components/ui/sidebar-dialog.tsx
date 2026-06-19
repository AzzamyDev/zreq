import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export type SidebarDialogNavItem<T extends string = string> = {
    id: T
    label: string
    icon?: ReactNode
    tone?: 'default' | 'danger'
}

export interface SidebarDialogProps<T extends string = string> {
    open: boolean
    onClose: () => void
    navLabel: string
    navItems: SidebarDialogNavItem<T>[]
    activeSection: T
    onSectionChange: (section: T) => void
    sidebarHeader?: ReactNode
    children: ReactNode
    className?: string
    sidebarClassName?: string
    contentClassName?: string
}

export function SidebarDialog<T extends string>({
    open,
    onClose,
    navLabel,
    navItems,
    activeSection,
    onSectionChange,
    sidebarHeader,
    children,
    className,
    sidebarClassName,
    contentClassName,
}: SidebarDialogProps<T>) {
    const { t } = useTranslation()

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) onClose()
            }}
        >
            <DialogContent
                showCloseButton={false}
                className={cn(
                    'flex h-[min(640px,82vh)] max-h-[86vh] w-[min(800px,95vw)] !max-w-[95vw] flex-col overflow-hidden rounded-xl p-0 shadow-2xl',
                    className
                )}
                initialFocus={false}
            >
                <div className="relative flex min-h-0 flex-1 overflow-hidden">
                    <aside
                        className={cn(
                            'flex shrink-0 flex-col border-r border-border bg-muted/20',
                            sidebarClassName ?? 'w-52'
                        )}
                    >
                        {sidebarHeader}
                        <nav className="flex flex-1 flex-col gap-0.5 p-2 pt-3" aria-label={navLabel}>
                            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                {navLabel}
                            </p>
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onSectionChange(item.id)}
                                    className={cn(
                                        'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                                        activeSection === item.id
                                            ? item.tone === 'danger'
                                                ? 'bg-destructive/15 text-destructive'
                                                : 'bg-accent/20 text-foreground'
                                            : item.tone === 'danger'
                                              ? 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive'
                                              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                    )}
                                >
                                    {item.icon}
                                    {item.label}
                                </button>
                            ))}
                        </nav>
                    </aside>

                    <div className="relative flex min-w-0 flex-1 flex-col">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            type="button"
                            className="absolute right-4 top-4 z-10 shrink-0"
                            onClick={onClose}
                        >
                            <XIcon />
                            <span className="sr-only">{t('common.close')}</span>
                        </Button>

                        <ScrollArea className="min-h-0 flex-1">
                            <div className={cn('p-8 pt-10', contentClassName)}>{children}</div>
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
