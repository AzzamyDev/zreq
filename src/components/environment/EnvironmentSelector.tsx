import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown, Layers, Settings2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '../ui/command'
import { useAppStore } from '../../store'
import EnvironmentManagerDialog from './EnvironmentManagerDialog'
import { cn } from '@/lib/utils'

export default function EnvironmentSelector() {
    const { t } = useTranslation()
    const { environments, activeEnvironmentId, setActiveEnvironmentId } = useAppStore()
    const [open, setOpen] = useState(false)
    const [manageOpen, setManageOpen] = useState(false)

    const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
    const label =
        activeEnv?.name ?? (activeEnvironmentId == null ? t('envSelector.noEnvironment') : t('envSelector.label'))

    const handlePick = (value: string) => {
        if (value === 'none') {
            setActiveEnvironmentId(null)
        } else {
            const id = parseInt(value, 10)
            if (!Number.isNaN(id)) setActiveEnvironmentId(id)
        }
        setOpen(false)
    }

    return (
        <>
            <div className="flex items-center gap-1.5">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger
                        type="button"
                        data-zreq-focus="environment-selector"
                        className={cn(
                            'border-input bg-background hover:bg-muted/50 inline-flex h-7 w-48 items-center justify-between gap-1 rounded-lg border px-2.5 text-xs font-normal shadow-xs outline-none transition-colors',
                            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
                        )}
                    >
                        <span className="flex min-w-0 items-center gap-1.5">
                            <Layers className="size-3.5 shrink-0 opacity-60" />
                            <span className="truncate text-left">{label}</span>
                        </span>
                        <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-0" align="end" sideOffset={6}>
                        <Command>
                            <CommandInput placeholder={t('envSelector.searchEnvironments')} />
                            <CommandList>
                                <CommandEmpty>{t('envSelector.noEnvironmentFound')}</CommandEmpty>
                                <CommandGroup>
                                    <CommandItem
                                        value="none"
                                        keywords={['none', 'no', 'environment']}
                                        onSelect={() => handlePick('none')}
                                    >
                                        {t('envSelector.noEnvironment')}
                                    </CommandItem>
                                    {environments.map((env) => (
                                        <CommandItem
                                            key={env.id}
                                            value={String(env.id)}
                                            keywords={[env.name, String(env.id)]}
                                            onSelect={() => handlePick(String(env.id))}
                                        >
                                            {env.name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    title={t('envSelector.manageEnvironments')}
                    onClick={() => setManageOpen(true)}
                >
                    <Settings2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            <EnvironmentManagerDialog open={manageOpen} onClose={() => setManageOpen(false)} />
        </>
    )
}
