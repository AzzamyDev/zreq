import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '../ui/command'
import { useAppStore } from '../../store'
import EnvironmentManagerDialog from './EnvironmentManagerDialog'
import { cn } from '@/lib/utils'

const MANAGE_VALUE = '__manage__'

export default function EnvironmentSelector() {
    const { t } = useTranslation()
    const { environments, activeEnvironmentId, setActiveEnvironmentId } = useAppStore()
    const [open, setOpen] = useState(false)
    const [manageOpen, setManageOpen] = useState(false)

    const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
    const label =
        activeEnv?.name ?? (activeEnvironmentId == null ? t('envSelector.noEnvironment') : t('envSelector.label'))

    const handlePick = (raw: string) => {
        const value = raw === MANAGE_VALUE || raw.startsWith(MANAGE_VALUE) ? MANAGE_VALUE : raw
        if (value === MANAGE_VALUE) {
            setOpen(false)
            setManageOpen(true)
            return
        }
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
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                    type="button"
                    data-zreq-focus="environment-selector"
                    className={cn(
                        'border-input bg-background hover:bg-muted/50 inline-flex h-7 w-48 items-center justify-between gap-1 rounded-lg border px-2.5 text-xs font-normal shadow-xs outline-none transition-colors',
                        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
                    )}
                >
                    <span className="truncate text-left">{label}</span>
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
                            <CommandSeparator />
                            <CommandGroup>
                                <CommandItem
                                    value={MANAGE_VALUE}
                                    keywords={['manage', 'environments', 'settings', 'edit']}
                                    onSelect={() => handlePick(MANAGE_VALUE)}
                                >
                                    {t('envSelector.manageEnvironments')}
                                </CommandItem>
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            <EnvironmentManagerDialog open={manageOpen} onClose={() => setManageOpen(false)} />
        </>
    )
}
