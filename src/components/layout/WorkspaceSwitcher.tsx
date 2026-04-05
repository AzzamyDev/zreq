import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown, Pencil, Plus, Trash2, Users } from 'lucide-react'
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
import type { Workspace, WorkspaceMemberEntry } from '@/types'
import {
    fetchWorkspaceMembers,
    inviteWorkspaceMember,
    removeWorkspaceMember,
} from '@/lib/workspace-members-api'
import * as snap from '@/lib/local-replica/snapshot-store'
import { ensureReplicaLoaded } from '@/lib/local-replica/sync-engine'
import {
    writeWorkspaceCreate,
    writeWorkspacePatch,
    writeWorkspaceDelete,
} from '@/lib/local-replica/local-write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
        updateWorkspace,
        removeWorkspace,
    } = useAppStore()
    const [open, setOpen] = useState(false)

    const [createOpen, setCreateOpen] = useState(false)
    const [createName, setCreateName] = useState('')
    const [createErr, setCreateErr] = useState('')
    const [createBusy, setCreateBusy] = useState(false)

    const [editWs, setEditWs] = useState<Workspace | null>(null)
    const [editName, setEditName] = useState('')
    const [editErr, setEditErr] = useState('')
    const [editBusy, setEditBusy] = useState(false)

    const [deleteWs, setDeleteWs] = useState<Workspace | null>(null)
    const [deleteErr, setDeleteErr] = useState('')
    const [deleteBusy, setDeleteBusy] = useState(false)

    const [membersWs, setMembersWs] = useState<Workspace | null>(null)
    const [members, setMembers] = useState<WorkspaceMemberEntry[]>([])
    const [membersLoading, setMembersLoading] = useState(false)
    const [membersErr, setMembersErr] = useState('')
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteBusy, setInviteBusy] = useState(false)
    const [inviteErr, setInviteErr] = useState('')

    const user = useAuthStore((s) => s.user)
    const isWorkspaceOwner = (w: Workspace) => user != null && w.userId === user.id

    const active = workspaces.find((w) => w.id === activeWorkspaceId)

    const loadMembers = async (w: Workspace) => {
        setMembersLoading(true)
        setMembersErr('')
        try {
            const rows = await fetchWorkspaceMembers(w.id)
            setMembers(rows)
        } catch (e) {
            setMembersErr(fmtApiErr(e))
            setMembers([])
        } finally {
            setMembersLoading(false)
        }
    }

    const openMembers = (w: Workspace) => {
        setMembersWs(w)
        setInviteEmail('')
        setInviteErr('')
        setMembersErr('')
        void loadMembers(w)
    }

    const submitInvite = async () => {
        if (!membersWs) return
        const email = inviteEmail.trim()
        if (!email) {
            setInviteErr(t('workspace.memberEmailRequired'))
            return
        }
        setInviteBusy(true)
        setInviteErr('')
        try {
            await inviteWorkspaceMember(membersWs.id, email)
            setInviteEmail('')
            await loadMembers(membersWs)
        } catch (e) {
            setInviteErr(fmtApiErr(e))
        } finally {
            setInviteBusy(false)
        }
    }

    const onRemoveMember = async (memberUserId: number) => {
        if (!membersWs) return
        try {
            await removeWorkspaceMember(membersWs.id, memberUserId)
            await loadMembers(membersWs)
        } catch (e) {
            setMembersErr(fmtApiErr(e))
        }
    }

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

    const openEdit = (w: Workspace) => {
        setEditWs(w)
        setEditName(w.name)
        setEditErr('')
    }

    const submitEdit = async () => {
        if (!editWs) return
        const name = editName.trim()
        if (!name) {
            setEditErr(t('common.errors.nameRequired'))
            return
        }
        setEditBusy(true)
        setEditErr('')
        try {
            updateWorkspace(editWs.id, { name })
            await writeWorkspacePatch(editWs.id, { name })
            setEditWs(null)
        } catch (e) {
            setEditErr(fmtApiErr(e))
        } finally {
            setEditBusy(false)
        }
    }

    const openDelete = (w: Workspace) => {
        setDeleteWs(w)
        setDeleteErr('')
    }

    const submitDelete = async () => {
        if (!deleteWs) return
        setDeleteBusy(true)
        setDeleteErr('')
        try {
            const wid = deleteWs.id
            const wasActive = activeWorkspaceId === wid
            removeWorkspace(wid)
            await ensureReplicaLoaded()
            const mem = snap.getMemorySnapshot()
            if (mem) {
                mem.workspaces = useAppStore.getState().workspaces
                delete mem.metaWorkspace[wid]
                delete mem.collectionsByWorkspaceId[String(wid)]
                delete mem.environmentsByWorkspaceId[String(wid)]
            }
            await snap.persistSnapshotNow()
            await writeWorkspaceDelete(wid)
            const next = useAppStore.getState().workspaces
            if (wasActive) {
                if (next.length === 0) {
                    const u = useAuthStore.getState().user
                    if (u) {
                        const tempId = -Math.floor(Math.random() * 1e12 + Date.now())
                        const now = new Date().toISOString()
                        const def: Workspace = {
                            id: tempId,
                            name: 'Default',
                            userId: u.id,
                            createdAt: now,
                            updatedAt: now,
                        }
                        addWorkspace(def)
                        setActiveWorkspaceId(tempId)
                        snap.setWorkspacesLocal(useAppStore.getState().workspaces)
                        snap.applyMemory((m) => {
                            m.metaWorkspace[tempId] = { serverUpdatedAt: now, dirty: false }
                        })
                        await snap.persistSnapshotNow()
                        await writeWorkspaceCreate(tempId, { name: 'Default' })
                    }
                } else {
                    setActiveWorkspaceId(next[0].id)
                }
            }
            setDeleteWs(null)
            setOpen(false)
        } catch (e) {
            setDeleteErr(fmtApiErr(e))
        } finally {
            setDeleteBusy(false)
        }
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
                    <span className="truncate">{active?.name ?? t('common.workspace')}</span>
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
                                            <div
                                                className="flex shrink-0 gap-0.5"
                                                onPointerDown={(e) => e.stopPropagation()}
                                            >
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="text-muted-foreground hover:text-foreground"
                                                    aria-label={t('workspace.manageMembersAria', {
                                                        name: w.name,
                                                    })}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openMembers(w)
                                                        setOpen(false)
                                                    }}
                                                >
                                                    <Users className="size-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="text-muted-foreground hover:text-foreground"
                                                    aria-label={t('workspace.renameAria', { name: w.name })}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openEdit(w)
                                                    }}
                                                >
                                                    <Pencil className="size-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="text-muted-foreground hover:text-destructive"
                                                    aria-label={t('workspace.deleteAria', { name: w.name })}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openDelete(w)
                                                    }}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </div>
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

            <Dialog open={!!editWs} onOpenChange={(v) => !v && setEditWs(null)}>
                <DialogContent className="sm:max-w-sm" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('workspace.renameWorkspaceTitle')}</DialogTitle>
                        <DialogDescription>{t('workspace.renameWorkspaceDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void submitEdit()
                            }}
                        />
                        {editErr ? <p className="text-destructive text-xs">{editErr}</p> : null}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditWs(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="button" size="sm" disabled={editBusy} onClick={() => void submitEdit()}>
                            {editBusy ? t('common.saving') : t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteWs} onOpenChange={(v) => !v && setDeleteWs(null)}>
                <DialogContent className="sm:max-w-sm" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('workspace.deleteWorkspaceTitle')}</DialogTitle>
                        <DialogDescription>
                            {deleteWs ? t('workspace.deleteWorkspaceDescription', { name: deleteWs.name }) : null}
                        </DialogDescription>
                    </DialogHeader>
                    {deleteErr ? <p className="text-destructive text-xs">{deleteErr}</p> : null}
                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setDeleteWs(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={deleteBusy}
                            onClick={() => void submitDelete()}
                        >
                            {deleteBusy ? t('common.deleting') : t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={!!membersWs}
                onOpenChange={(v) => {
                    if (!v) {
                        setMembersWs(null)
                        setMembers([])
                    }
                }}
            >
                <DialogContent className="sm:max-w-md" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('workspace.membersTitle')}</DialogTitle>
                        <DialogDescription>
                            {membersWs ? (
                                <>
                                    <span className="font-medium text-foreground">{membersWs.name}</span>
                                    {' — '}
                                    {t('workspace.membersDescription')}
                                </>
                            ) : null}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                        <div className="flex gap-2">
                            <Input
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder={t('workspace.memberEmailPlaceholder')}
                                className="flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void submitInvite()
                                }}
                            />
                            <Button
                                type="button"
                                size="sm"
                                disabled={inviteBusy}
                                onClick={() => void submitInvite()}
                            >
                                {inviteBusy ? t('workspace.addingMember') : t('workspace.addMember')}
                            </Button>
                        </div>
                        {inviteErr ? <p className="text-destructive text-xs">{inviteErr}</p> : null}
                        {membersErr ? <p className="text-destructive text-xs">{membersErr}</p> : null}
                        <ul className="border-border max-h-48 overflow-auto rounded-md border text-sm">
                            {membersLoading ? (
                                <li className="text-muted-foreground px-3 py-2 text-xs">{t('common.loading')}</li>
                            ) : members.length === 0 ? (
                                <li className="text-muted-foreground px-3 py-2 text-xs">
                                    {t('workspace.membersEmpty')}
                                </li>
                            ) : (
                                members.map((row) => (
                                    <li
                                        key={row.user.id}
                                        className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0"
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate font-medium">{row.user.name}</div>
                                            <div className="text-muted-foreground truncate text-xs">
                                                {row.user.email}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            {row.isOwner ? (
                                                <span className="text-muted-foreground text-xs">
                                                    {t('workspace.memberRoleOwner')}
                                                </span>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="text-muted-foreground hover:text-destructive"
                                                    aria-label={t('workspace.removeMemberAria', {
                                                        name: row.user.name,
                                                    })}
                                                    onClick={() => void onRemoveMember(row.user.id)}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
