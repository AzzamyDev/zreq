import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown, LayoutGrid, Plus, Settings2, Users } from 'lucide-react'
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
import { useAppStore } from '@/store'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/types'
import * as snap from '@/lib/local-replica/snapshot-store'
import { ensureReplicaLoaded } from '@/lib/local-replica/sync-engine'
import { writeWorkspaceCreate } from '@/lib/local-replica/local-write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ManageWorkspaceDialog from '@/components/layout/ManageWorkspaceDialog'

export default function WorkspaceSwitcher() {
    const { t } = useTranslation()
    const fmtApiErr = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message
        if (Array.isArray(msg)) return String(msg[0])
        if (typeof msg === 'string') return msg
        return t('common.requestFailed')
    }
    const {
        workspaces,
        activeWorkspaceId,
        setActiveWorkspaceId,
        addWorkspace,
    } = useAppStore()
    const [open, setOpen] = useState(false)

    const [createOpen, setCreateOpen] = useState(false)
    const [createName, setCreateName] = useState('')
    const [createErr, setCreateErr] = useState('')
    const [createBusy, setCreateBusy] = useState(false)

    const [manageWsId, setManageWsId] = useState<number | null>(null)

    const user = useAuthStore((s) => s.user)
    const isWorkspaceOwner = (w: Workspace) => user != null && w.userId === user.id

    const active = workspaces.find((w) => w.id === activeWorkspaceId)

    const openCreate = () => {
        setCreateName('')
        setCreateErr('')
        setCreateOpen(true)
    }

    const submitCreate = async () => {
        const name = createName.trim()
        if (!name) {
            setCreateErr(t('common.errors.nameRequired'))
            return
        }
        setCreateBusy(true)
        setCreateErr('')
        try {
            const u = useAuthStore.getState().user
            if (!u) {
                setCreateErr(t('common.requestFailed'))
                return
            }
            const tempId = -Math.floor(Math.random() * 1e12 + Date.now())
            const now = new Date().toISOString()
            const w: Workspace = { id: tempId, name, userId: u.id, createdAt: now, updatedAt: now }
            addWorkspace(w)
            setActiveWorkspaceId(tempId)
            await ensureReplicaLoaded()
            snap.setWorkspacesLocal(useAppStore.getState().workspaces)
            snap.applyMemory((m) => {
                m.metaWorkspace[tempId] = { serverUpdatedAt: now, dirty: false }
            })
            await snap.persistSnapshotNow()
            await writeWorkspaceCreate(tempId, { name })
            setCreateOpen(false)
            setOpen(false)
        } catch (e) {
            setCreateErr(fmtApiErr(e))
        } finally {
            setCreateBusy(false)
        }
    }

    const openManage = (w: Workspace) => {
        setManageWsId(w.id)
        setOpen(false)
    }

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                    className={cn(
                        'min-w-[200px] border-input bg-background hover:bg-muted/50 inline-flex h-7 max-w-[200px] items-center justify-between gap-1 rounded-lg border px-2.5 text-xs font-normal shadow-xs outline-none transition-colors',
                        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
                    )}
                >
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Users className="size-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{active?.name ?? t('common.workspace')}</span>
                    </span>
                    <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start" sideOffset={6}>
                    <Command>
                        <CommandInput placeholder={t('workspace.searchWorkspaces')} />
                        <CommandList>
                            <CommandEmpty>{t('workspace.noWorkspaceFound')}</CommandEmpty>
                            <CommandGroup>
                                {workspaces.map((w) => (
                                    <CommandItem
                                        key={w.id}
                                        value={`${w.id} ${w.name}`}
                                        keywords={[w.name, String(w.id)]}
                                        onSelect={() => {
                                            setActiveWorkspaceId(w.id)
                                            setOpen(false)
                                        }}
                                        className="gap-1 pr-1"
                                    >
                                        <span className="min-w-0 flex-1 truncate">
                                            {w.name}
                                            {!isWorkspaceOwner(w) ? (
                                                <span className="text-muted-foreground ml-1 text-[10px] font-normal">
                                                    ({t('workspace.sharedWorkspaceHint')})
                                                </span>
                                            ) : null}
                                        </span>
                                        {isWorkspaceOwner(w) ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-muted-foreground shrink-0 hover:text-foreground"
                                                aria-label={t('workspace.manageAria', { name: w.name })}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openManage(w)
                                                }}
                                            >
                                                <Settings2 className="size-3.5" />
                                            </Button>
                                        ) : null}
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
                                onClick={() => {
                                    openCreate()
                                }}
                            >
                                <Plus className="size-3.5" />
                                {t('workspace.newWorkspace')}
                            </Button>
                        </div>
                    </Command>
                </PopoverContent>
            </Popover>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-sm" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('workspace.newWorkspaceTitle')}</DialogTitle>
                        <DialogDescription>{t('workspace.newWorkspaceDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Input
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder={t('workspace.namePlaceholder')}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void submitCreate()
                            }}
                        />
                        {createErr ? <p className="text-destructive text-xs">{createErr}</p> : null}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="button" size="sm" disabled={createBusy} onClick={() => void submitCreate()}>
                            {createBusy ? t('common.creating') : t('common.create')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ManageWorkspaceDialog
                workspaceId={manageWsId}
                open={manageWsId != null}
                onClose={() => setManageWsId(null)}
                onDeleted={() => setOpen(false)}
            />
        </>
    )
}
