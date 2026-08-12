import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
    METHOD_BG_CLASS,
    METHOD_COLOR,
    METHOD_FOCUS_RING_CLASS,
    METHOD_TEXT_CLASS,
} from '../../lib/httpMethodTheme'
import type { HttpMethod } from '../../types'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

interface MethodSelectProps {
    value: string
    onChange: (val: string) => void
}

export default function MethodSelect({ value, onChange }: MethodSelectProps) {
    const [open, setOpen] = useState(false)
    const textClass = METHOD_TEXT_CLASS[value] ?? 'text-foreground'
    const ringClass = METHOD_FOCUS_RING_CLASS[value] ?? 'focus:ring-ring'
    const triggerBg = METHOD_BG_CLASS[value] ?? 'bg-transparent'

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger
                className={cn(
                    'inline-flex h-9 w-[105px] shrink-0 cursor-pointer items-center justify-between gap-1 rounded-md border border-input/80 px-2.5 text-sm font-semibold outline-none transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                    'hover:brightness-110 data-popup-open:brightness-110',
                    triggerBg,
                    textClass,
                    ringClass
                )}
                aria-label="HTTP method"
            >
                <span className="truncate tracking-wide">{value}</span>
                <ChevronDown
                    className={cn(
                        'size-3.5 shrink-0 opacity-60 transition-transform duration-150',
                        open && 'rotate-180'
                    )}
                    aria-hidden
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="min-w-[132px] rounded-xl border border-border/60 bg-popover p-1.5 shadow-lg ring-1 ring-foreground/8"
            >
                {METHODS.map((m) => {
                    const selected = m === value
                    const color = METHOD_COLOR[m] ?? 'var(--foreground)'
                    const tint = METHOD_BG_CLASS[m] ?? ''
                    return (
                        <DropdownMenuItem
                            key={m}
                            onClick={() => {
                                onChange(m)
                                setOpen(false)
                            }}
                            className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 font-semibold tracking-wide',
                                'focus:bg-[var(--sidebar-row-hover)] data-highlighted:bg-[var(--sidebar-row-hover)]',
                                selected && tint
                            )}
                        >
                            <span
                                className="flex size-3.5 shrink-0 items-center justify-center"
                                style={{ color }}
                                aria-hidden
                            >
                                {selected ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                            </span>
                            <span className="flex-1 text-sm" style={{ color }}>
                                {m}
                            </span>
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
