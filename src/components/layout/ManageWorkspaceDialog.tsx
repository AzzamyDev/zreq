import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, FolderKanban, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarDialog } from '@/components/ui/sidebar-dialog'
import { useAppStore } from '@/store'
import { useAuthStore } from '@/store/authStore'
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

type Section = 'general' | 'members' | 'danger'

interface ManageWorkspaceDialogProps {
    workspaceId: number | null
    open: boolean
    onClose: () => void
    onDeleted?: () => void
}

function workspaceInitial(name: string) {
    const trimmed = name.trim()
    return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

export default function ManageWorkspaceDialog({
    workspaceId,
    open,
    onClose,
    onDeleted,
}: ManageWorkspaceDialogProps) {
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
    const workspace = workspaces.find((w) => w.id === workspaceId) ?? null
    const user = useAuthStore((s) => s.user)

    const [section, setSection] = useState<Section>('general')
    const [editName, setEditName] = useState('')
    const [editErr, setEditErr] = useState('')
    const [editBusy, setEditBusy] = useState(false)
    const [editSuccess, setEditSuccess] = useState(false)

    const [members, setMembers] = useState<WorkspaceMemberEntry[]>([])
    const [membersLoading, setMembersLoading] = useState(false)
    const [membersErr, setMembersErr] = useState('')
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteBusy, setInviteBusy] = useState(false)
    const [inviteErr, setInviteErr] = useState('')

    const [deleteConfirm, setDeleteConfirm] = useState(false)
    const [deleteErr, setDeleteErr] = useState('')
    const [deleteBusy, setDeleteBusy] = useState(false)

    const isOwner = workspace != null && user != null && workspace.userId === user.id

    useEffect(() => {
        if (!open || !workspace) return
        setSection('general')
        setEditName(workspace.name)
        setEditErr('')
        setEditSuccess(false)
        setInviteEmail('')
        setInviteErr('')
        setMembersErr('')
        setDeleteConfirm(false)
        setDeleteErr('')
    }, [open, workspace?.id, workspace?.name])

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

    useEffect(() => {
        if (!open || !workspace || section !== 'members') return
        void loadMembers(workspace)
    }, [open, workspace?.id, section])

    const submitRename = async () => {
        if (!workspace) return
        const name = editName.trim()
        if (!name) {
            setEditErr(t('common.errors.nameRequired'))
            return
        }
        setEditBusy(true)
        setEditErr('')
        try {
            updateWorkspace(workspace.id, { name })
            await writeWorkspacePatch(workspace.id, { name })
            setEditSuccess(true)
            setTimeout(() => setEditSuccess(false), 2000)
        } catch (e) {
            setEditErr(fmtApiErr(e))
        } finally {
            setEditBusy(false)
        }
    }

    const submitInvite = async () => {
        if (!workspace) return
        const email = inviteEmail.trim()
        if (!email) {
            setInviteErr(t('workspace.memberEmailRequired'))
            return
        }
        setInviteBusy(true)
        setInviteErr('')
        try {
            await inviteWorkspaceMember(workspace.id, email)
            setInviteEmail('')
            await loadMembers(workspace)
        } catch (e) {
            setInviteErr(fmtApiErr(e))
        } finally {
            setInviteBusy(false)
        }
    }

    const onRemoveMember = async (memberUserId: number) => {
        if (!workspace) return
        try {
            await removeWorkspaceMember(workspace.id, memberUserId)
            await loadMembers(workspace)
        } catch (e) {
            setMembersErr(fmtApiErr(e))
        }
    }

    const submitDelete = async () => {
        if (!workspace) return
        setDeleteBusy(true)
        setDeleteErr('')
        try {
            const wid = workspace.id
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
            onDeleted?.()
            onClose()
        } catch (e) {
            setDeleteErr(fmtApiErr(e))
        } finally {
            setDeleteBusy(false)
        }
    }

    const NAV_ITEMS: { id: Section; label: string; icon: ReactNode; tone?: 'danger' }[] = [
        { id: 'general', label: t('workspace.navGeneral'), icon: <FolderKanban className="h-4 w-4" /> },
        { id: 'members', label: t('workspace.navMembers'), icon: <Users className="h-4 w-4" /> },
        {
            id: 'danger',
            label: t('workspace.navDanger'),
            icon: <AlertTriangle className="h-4 w-4" />,
            tone: 'danger',
        },
    ]

    const dialogOpen = open && workspace != null && isOwner
    const initial = workspace ? workspaceInitial(workspace.name) : '?'

    return (
        <SidebarDialog
            open={dialogOpen}
            onClose={onClose}
            navLabel={t('workspace.manageTitle')}
            navItems={NAV_ITEMS}
            activeSection={section}
            onSectionChange={setSection}
            className="h-[min(600px,82vh)] w-[760px]"
            sidebarHeader={
                workspace ? (
                    <div className="border-b border-border/70 px-4 py-5">
                        <div className="flex items-center gap-3">
                            <div
                                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/25 text-sm font-semibold text-accent-foreground ring-2 ring-accent/30"
                                aria-hidden
                            >
                                {initial}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{workspace.name}</p>
                                <p className="text-xs text-muted-foreground">{t('workspace.manageSubtitle')}</p>
                            </div>
                        </div>
                    </div>
                ) : null
            }
        >
                        {section === 'general' && workspace && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-200">
                                <header className="space-y-1 pr-8">
                                    <h2 className="text-xl font-semibold">{t('workspace.generalTitle')}</h2>
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        {t('workspace.generalSectionDesc')}
                                    </p>
                                </header>

                                <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
                                    <div className="flex-1 space-y-1.5">
                                        <label htmlFor="ws-name" className="text-sm font-medium">
                                            {t('workspace.workspaceNameLabel')}
                                        </label>
                                        <p className="text-xs text-muted-foreground">
                                            {t('workspace.renameWorkspaceDescription')}
                                        </p>
                                        <Input
                                            id="ws-name"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            placeholder={t('workspace.namePlaceholder')}
                                            className="max-w-md"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') void submitRename()
                                            }}
                                        />
                                        {editErr ? (
                                            <p className="text-xs text-destructive">{editErr}</p>
                                        ) : null}
                                        {editSuccess ? (
                                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                                {t('workspace.renameSuccess')}
                                            </p>
                                        ) : null}
                                    </div>
                                    <Button
                                        size="sm"
                                        className="shrink-0"
                                        disabled={editBusy || !editName.trim()}
                                        onClick={() => void submitRename()}
                                    >
                                        {editBusy ? t('common.saving') : t('common.save')}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {section === 'members' && workspace && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-200">
                                <header className="space-y-1 pr-8">
                                    <h2 className="text-xl font-semibold">{t('workspace.membersTitle')}</h2>
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        {t('workspace.membersDescription')}
                                    </p>
                                </header>

                                <div className="space-y-4">
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        <Input
                                            type="email"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            placeholder={t('workspace.memberEmailPlaceholder')}
                                            className="max-w-md flex-1"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') void submitInvite()
                                            }}
                                        />
                                        <Button
                                            size="sm"
                                            disabled={inviteBusy}
                                            onClick={() => void submitInvite()}
                                        >
                                            {inviteBusy ? t('workspace.addingMember') : t('workspace.addMember')}
                                        </Button>
                                    </div>
                                    {inviteErr ? <p className="text-xs text-destructive">{inviteErr}</p> : null}
                                    {membersErr ? <p className="text-xs text-destructive">{membersErr}</p> : null}

                                    <ul className="max-h-64 overflow-auto rounded-xl border border-border text-sm">
                                        {membersLoading ? (
                                            <li className="text-muted-foreground px-4 py-3 text-xs">
                                                {t('common.loading')}
                                            </li>
                                        ) : members.length === 0 ? (
                                            <li className="text-muted-foreground px-4 py-3 text-xs">
                                                {t('workspace.membersEmpty')}
                                            </li>
                                        ) : (
                                            members.map((row) => (
                                                <li
                                                    key={row.user.id}
                                                    className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 last:border-b-0"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium">{row.user.name}</div>
                                                        <div className="text-muted-foreground truncate text-xs">
                                                            {row.user.email}
                                                        </div>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        {row.isOwner ? (
                                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                                {t('workspace.memberRoleOwner')}
                                                            </span>
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                                                onClick={() => void onRemoveMember(row.user.id)}
                                                            >
                                                                <Trash2 className="size-3.5" />
                                                                {t('workspace.removeMember')}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </li>
                                            ))
                                        )}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {section === 'danger' && workspace && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-200">
                                <header className="space-y-1 pr-8">
                                    <h2 className="text-xl font-semibold text-destructive">
                                        {t('workspace.dangerTitle')}
                                    </h2>
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        {t('workspace.dangerSectionDesc')}
                                    </p>
                                </header>

                                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 dark:bg-destructive/10">
                                    <div className="flex gap-4">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
                                            <Trash2 className="size-5 text-destructive" aria-hidden />
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-3">
                                            <div>
                                                <p className="font-medium text-destructive">
                                                    {t('workspace.deleteWorkspaceTitle')}
                                                </p>
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {t('workspace.deleteWorkspaceDescription', {
                                                        name: workspace.name,
                                                    })}
                                                </p>
                                            </div>

                                            {deleteConfirm ? (
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setDeleteConfirm(false)
                                                            setDeleteErr('')
                                                        }}
                                                    >
                                                        {t('common.cancel')}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        size="sm"
                                                        disabled={deleteBusy}
                                                        onClick={() => void submitDelete()}
                                                    >
                                                        {deleteBusy
                                                            ? t('common.deleting')
                                                            : t('workspace.confirmDelete')}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="border border-destructive/40"
                                                    onClick={() => setDeleteConfirm(true)}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                    {t('workspace.deleteWorkspaceAction')}
                                                </Button>
                                            )}
                                            {deleteErr ? (
                                                <p className="text-xs text-destructive">{deleteErr}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
        </SidebarDialog>
    )
}
