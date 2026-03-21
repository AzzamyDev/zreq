import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown, Pencil, Plus, Server, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { normalizeBaseUrl, useInstanceStore, type BackendInstance } from '@/store/instanceStore'
import { applyInstanceSwitch, refreshSessionForCurrentBackend } from '@/lib/apply-instance-switch'
import { validatePostwomanBackend } from '@/lib/probe-backend'

type InstanceSwitcherProps = {
    /** Narrower trigger when used on auth screen */
    variant?: 'toolbar' | 'auth'
}

export default function InstanceSwitcher({ variant = 'toolbar' }: InstanceSwitcherProps) {
    const { t } = useTranslation()
    const instances = useInstanceStore((s) => s.instances)
    const activeInstanceId = useInstanceStore((s) => s.activeInstanceId)
    const addInstance = useInstanceStore((s) => s.addInstance)
    const updateInstance = useInstanceStore((s) => s.updateInstance)
    const removeInstance = useInstanceStore((s) => s.removeInstance)

    const [open, setOpen] = useState(false)

    const [createOpen, setCreateOpen] = useState(false)
    const [createName, setCreateName] = useState('')
    const [createUrl, setCreateUrl] = useState('')
    const [createErr, setCreateErr] = useState('')
    const [createBusy, setCreateBusy] = useState(false)

    const [editInst, setEditInst] = useState<BackendInstance | null>(null)
    const [editName, setEditName] = useState('')
    const [editUrl, setEditUrl] = useState('')
    const [editErr, setEditErr] = useState('')
    const [editBusy, setEditBusy] = useState(false)

    const [deleteInst, setDeleteInst] = useState<BackendInstance | null>(null)
    const [deleteErr, setDeleteErr] = useState('')
    const [deleteBusy, setDeleteBusy] = useState(false)

    const active = instances.find((i) => i.id === activeInstanceId)

    const openCreate = () => {
        setCreateName('')
        setCreateUrl('')
        setCreateErr('')
        setCreateOpen(true)
    }

    const submitCreate = async () => {
        setCreateBusy(true)
        setCreateErr('')
        const v = await validatePostwomanBackend(createUrl)
        if (!v.ok) {
            setCreateErr(
                t(
                    v.code === 'invalid_url'
                        ? 'instance.invalidUrl'
                        : v.code === 'unreachable'
                          ? 'instance.backendUnreachable'
                          : 'instance.backendInvalidResponse'
                )
            )
            setCreateBusy(false)
            return
        }
        const r = addInstance(createName, v.baseUrl)
        if (!r.ok) {
            setCreateErr(t('instance.invalidUrl'))
            setCreateBusy(false)
            return
        }
        applyInstanceSwitch(r.id)
        setCreateOpen(false)
        setOpen(false)
        setCreateBusy(false)
    }

    const openEdit = (inst: BackendInstance) => {
        setEditInst(inst)
        setEditName(inst.name)
        setEditUrl(inst.baseUrl)
        setEditErr('')
    }

    const submitEdit = async () => {
        if (!editInst) return
        const prevUrl = editInst.baseUrl
        setEditBusy(true)
        setEditErr('')
        const nextNorm = normalizeBaseUrl(editUrl)
        if (nextNorm !== prevUrl) {
            const v = await validatePostwomanBackend(editUrl)
            if (!v.ok) {
                setEditErr(
                    t(
                        v.code === 'invalid_url'
                            ? 'instance.invalidUrl'
                            : v.code === 'unreachable'
                              ? 'instance.backendUnreachable'
                              : 'instance.backendInvalidResponse'
                    )
                )
                setEditBusy(false)
                return
            }
        }
        const r = updateInstance(editInst.id, editName, editUrl)
        if (!r.ok) {
            setEditErr(t('instance.invalidUrl'))
            setEditBusy(false)
            return
        }
        const wasActive = editInst.id === activeInstanceId
        const nextUrl = useInstanceStore.getState().instances.find((i) => i.id === editInst.id)?.baseUrl
        setEditInst(null)
        setEditBusy(false)
        if (wasActive && nextUrl !== prevUrl) {
            refreshSessionForCurrentBackend()
        }
    }

    const openDelete = (inst: BackendInstance) => {
        setDeleteInst(inst)
        setDeleteErr('')
    }

    const submitDelete = () => {
        if (!deleteInst) return
        setDeleteBusy(true)
        setDeleteErr('')
        const wasActive = deleteInst.id === activeInstanceId
        const r = removeInstance(deleteInst.id)
        if (!r.ok) {
            setDeleteErr(r.reason === 'last' ? t('instance.cannotDeleteLast') : t('instance.missing'))
            setDeleteBusy(false)
            return
        }
        setDeleteInst(null)
        setDeleteBusy(false)
        setOpen(false)
        if (r.deletedActive) {
            refreshSessionForCurrentBackend()
        }
    }

    const selectInstance = (id: string) => {
        applyInstanceSwitch(id)
        setOpen(false)
    }

    const triggerClass =
        variant === 'auth'
            ? 'min-w-[200px] max-w-[min(100%,280px)] border-input bg-card hover:bg-muted/50 inline-flex h-9 items-center justify-between gap-1 rounded-lg border px-2.5 text-xs font-normal shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
            : 'min-w-[160px] max-w-[200px] border-input bg-background hover:bg-muted/50 inline-flex h-7 items-center justify-between gap-1 rounded-lg border px-2.5 text-xs font-normal shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger className={cn(triggerClass)}>
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Server className="size-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{active?.name ?? t('instance.label')}</span>
                    </span>
                    <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start" sideOffset={6}>
                    <Command>
                        <CommandInput placeholder={t('instance.searchPlaceholder')} />
                        <CommandList>
                            <CommandEmpty>{t('instance.noMatch')}</CommandEmpty>
                            <CommandGroup>
                                {instances.map((inst) => (
                                    <CommandItem
                                        key={inst.id}
                                        value={`${inst.id} ${inst.name} ${inst.baseUrl}`}
                                        keywords={[inst.name, inst.baseUrl, inst.id]}
                                        onSelect={() => selectInstance(inst.id)}
                                        className="gap-1 pr-1"
                                    >
                                        <span className="min-w-0 flex-1 truncate">
                                            <span className="block font-medium">{inst.name}</span>
                                            <span className="text-muted-foreground block truncate text-[10px]">
                                                {inst.baseUrl}
                                            </span>
                                        </span>
                                        <div
                                            className="flex shrink-0 gap-0.5"
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-muted-foreground hover:text-foreground"
                                                aria-label={t('instance.renameAria', { name: inst.name })}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openEdit(inst)
                                                }}
                                            >
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-muted-foreground hover:text-destructive"
                                                aria-label={t('instance.deleteAria', { name: inst.name })}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openDelete(inst)
                                                }}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                        <CommandSeparator />
                        <div className="p-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-full justify-start gap-1.5 px-2 text-xs font-normal"
                                onClick={() => openCreate()}
                            >
                                <Plus className="size-3.5" />
                                {t('instance.newInstance')}
                            </Button>
                        </div>
                    </Command>
                </PopoverContent>
            </Popover>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-sm" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('instance.newTitle')}</DialogTitle>
                        <DialogDescription>{t('instance.newDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                        <div className="grid gap-1">
                            <label className="text-muted-foreground text-xs">{t('common.name')}</label>
                            <Input
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                placeholder={t('instance.namePlaceholder')}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void submitCreate()
                                }}
                            />
                        </div>
                        <div className="grid gap-1">
                            <label className="text-muted-foreground text-xs">{t('instance.baseUrl')}</label>
                            <Input
                                value={createUrl}
                                onChange={(e) => setCreateUrl(e.target.value)}
                                placeholder={t('instance.urlPlaceholder')}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void submitCreate()
                                }}
                            />
                        </div>
                        {createErr ? <p className="text-destructive text-xs">{createErr}</p> : null}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={createBusy}
                            onClick={() => void submitCreate()}
                        >
                            {createBusy ? t('instance.validating') : t('common.create')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editInst} onOpenChange={(v) => !v && setEditInst(null)}>
                <DialogContent className="sm:max-w-sm" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('instance.editTitle')}</DialogTitle>
                        <DialogDescription>{t('instance.editDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                        <div className="grid gap-1">
                            <label className="text-muted-foreground text-xs">{t('common.name')}</label>
                            <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void submitEdit()
                                }}
                            />
                        </div>
                        <div className="grid gap-1">
                            <label className="text-muted-foreground text-xs">{t('instance.baseUrl')}</label>
                            <Input
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void submitEdit()
                                }}
                            />
                        </div>
                        {editErr ? <p className="text-destructive text-xs">{editErr}</p> : null}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditInst(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="button" size="sm" disabled={editBusy} onClick={() => void submitEdit()}>
                            {editBusy ? t('common.saving') : t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteInst} onOpenChange={(v) => !v && setDeleteInst(null)}>
                <DialogContent className="sm:max-w-sm" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('instance.deleteTitle')}</DialogTitle>
                        <DialogDescription>
                            {deleteInst ? t('instance.deleteDescription', { name: deleteInst.name }) : null}
                        </DialogDescription>
                    </DialogHeader>
                    {deleteErr ? <p className="text-destructive text-xs">{deleteErr}</p> : null}
                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setDeleteInst(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={deleteBusy}
                            onClick={() => submitDelete()}
                        >
                            {deleteBusy ? t('common.deleting') : t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
