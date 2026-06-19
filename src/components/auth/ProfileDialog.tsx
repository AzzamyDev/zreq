import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { apiClient } from '../../lib/api-client'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { AlertTriangle, Shield, Trash2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarDialog } from '../ui/sidebar-dialog'

interface ProfileDialogProps {
    open: boolean
    onClose: () => void
}

type Section = 'account' | 'security' | 'danger'

function userInitials(name: string, email: string) {
    const fromName = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')
    if (fromName) return fromName
    return email.slice(0, 2).toUpperCase()
}

export default function ProfileDialog({ open, onClose }: ProfileDialogProps) {
    const { t } = useTranslation()
    const { user, setAuth, token, logout } = useAuthStore()
    const [section, setSection] = useState<Section>('account')
    const [name, setName] = useState(user?.name ?? '')
    const [currentPw, setCurrentPw] = useState('')
    const [newPw, setNewPw] = useState('')
    const [confirmPw, setConfirmPw] = useState('')
    const [nameError, setNameError] = useState('')
    const [pwError, setPwError] = useState('')
    const [nameSuccess, setNameSuccess] = useState(false)
    const [pwSuccess, setPwSuccess] = useState(false)

    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deletePhrase, setDeletePhrase] = useState('')
    const [deleteError, setDeleteError] = useState('')
    const [deleteLoading, setDeleteLoading] = useState(false)

    const initials = useMemo(
        () => userInitials(user?.name ?? '', user?.email ?? ''),
        [user?.name, user?.email]
    )

    useEffect(() => {
        if (open && user) {
            setName(user.name)
            setSection('account')
            setDeletePhrase('')
            setDeleteError('')
        }
    }, [open, user])

    useEffect(() => {
        if (!open || !user?.id || !token) return
        if (user.hasPassword !== undefined) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await apiClient.get<{ data?: { hasPassword?: boolean; name?: string } }>(
                    `/users/${user.id}`
                )
                const d = res.data.data
                if (cancelled || !d || typeof d.hasPassword !== 'boolean') return
                setAuth(token, {
                    ...user,
                    name: d.name ?? user.name,
                    hasPassword: d.hasPassword,
                })
            } catch {
                /* ignore */
            }
        })()
        return () => {
            cancelled = true
        }
    }, [open, user, token, setAuth])

    const handleSaveName = async () => {
        setNameError('')
        if (!name.trim()) {
            setNameError(t('profile.errors.nameRequired'))
            return
        }
        try {
            const res = await apiClient.patch(`/users/${user?.id}`, { name })
            setAuth(token!, { ...user!, name: res.data.data?.name ?? name })
            setNameSuccess(true)
            setTimeout(() => setNameSuccess(false), 2000)
        } catch {
            setNameError(t('profile.errors.nameUpdateFailed'))
        }
    }

    const needsCurrentPassword = user?.hasPassword === true

    const handleChangePassword = async () => {
        setPwError('')
        if (needsCurrentPassword && !currentPw) {
            setPwError(t('profile.errors.allFieldsRequired'))
            return
        }
        if (!newPw) {
            setPwError(t('profile.errors.allFieldsRequired'))
            return
        }
        if (newPw !== confirmPw) {
            setPwError(t('profile.errors.passwordsNoMatch'))
            return
        }
        if (newPw.length < 6) {
            setPwError(t('profile.errors.passwordMin'))
            return
        }
        try {
            await apiClient.patch(`/users/${user?.id}/password`, {
                ...(needsCurrentPassword ? { currentPassword: currentPw } : {}),
                newPassword: newPw,
            })
            setCurrentPw('')
            setNewPw('')
            setConfirmPw('')
            setPwSuccess(true)
            if (token && user) setAuth(token, { ...user, hasPassword: true })
            setTimeout(() => setPwSuccess(false), 2000)
        } catch (err: any) {
            setPwError(err.response?.data?.message ?? t('profile.errors.passwordChangeFailed'))
        }
    }

    const handleDeleteAccount = async () => {
        setDeleteError('')
        if (deletePhrase.trim() !== 'DELETE') {
            setDeleteError(t('profile.typeDeleteError'))
            return
        }
        setDeleteLoading(true)
        try {
            await apiClient.delete(`/users/${user?.id}`)
            setDeleteOpen(false)
            onClose()
            logout()
        } catch (err: any) {
            setDeleteError(err.response?.data?.message ?? t('profile.deleteAccountFailed'))
        } finally {
            setDeleteLoading(false)
        }
    }

    const handleClose = () => {
        setNameError('')
        setPwError('')
        setNameSuccess(false)
        setPwSuccess(false)
        setDeleteOpen(false)
        setDeletePhrase('')
        setDeleteError('')
        onClose()
    }

    const NAV_ITEMS: { id: Section; label: string; icon: ReactNode; tone?: 'danger' }[] = [
        { id: 'account', label: t('profile.navAccount'), icon: <User className="h-4 w-4" /> },
        { id: 'security', label: t('profile.navSecurity'), icon: <Shield className="h-4 w-4" /> },
        {
            id: 'danger',
            label: t('profile.navDanger'),
            icon: <AlertTriangle className="h-4 w-4" />,
            tone: 'danger',
        },
    ]

    return (
        <>
            <SidebarDialog
                open={open}
                onClose={handleClose}
                navLabel={t('profile.title')}
                navItems={NAV_ITEMS}
                activeSection={section}
                onSectionChange={setSection}
                sidebarHeader={
                    <div className="border-b border-border/70 px-4 py-5">
                        <div className="flex items-center gap-3">
                            <div
                                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/25 text-sm font-semibold text-accent-foreground ring-2 ring-accent/30"
                                aria-hidden
                            >
                                {initials}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{user?.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                            </div>
                        </div>
                    </div>
                }
            >
                            {section === 'account' && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-200">
                                    <header className="space-y-1 pr-8">
                                        <h2 className="text-xl font-semibold">{t('profile.accountTitle')}</h2>
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            {t('profile.accountSectionDesc')}
                                        </p>
                                    </header>

                                    <div className="space-y-6">
                                        <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
                                            <div className="flex-1 space-y-1.5">
                                                <label htmlFor="profile-name" className="text-sm font-medium">
                                                    {t('profile.displayName')}
                                                </label>
                                                <p className="text-xs text-muted-foreground">
                                                    {t('profile.displayNameHint')}
                                                </p>
                                                <Input
                                                    id="profile-name"
                                                    placeholder={t('profile.displayNamePlaceholder')}
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveName()
                                                    }}
                                                    className="max-w-md"
                                                />
                                                {nameError && (
                                                    <p className="text-xs text-destructive">{nameError}</p>
                                                )}
                                                {nameSuccess && (
                                                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                                        {t('profile.nameSaved')}
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                className="shrink-0"
                                                onClick={handleSaveName}
                                                disabled={!name.trim()}
                                            >
                                                {t('profile.saveName')}
                                            </Button>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label htmlFor="profile-email" className="text-sm font-medium">
                                                {t('common.email')}
                                            </label>
                                            <p className="text-xs text-muted-foreground">{t('profile.emailHint')}</p>
                                            <Input
                                                id="profile-email"
                                                type="email"
                                                value={user?.email ?? ''}
                                                disabled
                                                readOnly
                                                className="max-w-md opacity-80"
                                                aria-describedby="profile-email-hint"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {section === 'security' && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-200">
                                    <header className="space-y-1 pr-8">
                                        <h2 className="text-xl font-semibold">{t('profile.securityTitle')}</h2>
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            {needsCurrentPassword
                                                ? t('profile.securitySectionDesc')
                                                : t('profile.setPasswordHint')}
                                        </p>
                                    </header>

                                    <div className="space-y-6">
                                        <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
                                            <div>
                                                <p className="text-sm font-medium">{t('profile.loginMethodLabel')}</p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {needsCurrentPassword
                                                        ? t('profile.loginMethodPassword')
                                                        : t('profile.loginMethodOAuth')}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                                                    needsCurrentPassword
                                                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                        : 'bg-muted text-muted-foreground'
                                                )}
                                            >
                                                {needsCurrentPassword
                                                    ? t('profile.passwordEnabled')
                                                    : t('profile.passwordNotSet')}
                                            </span>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {needsCurrentPassword
                                                        ? t('profile.changePasswordTitle')
                                                        : t('profile.setPasswordTitle')}
                                                </p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {t('profile.passwordRequirements')}
                                                </p>
                                            </div>

                                            <div className="max-w-md space-y-2.5">
                                                {needsCurrentPassword && (
                                                    <Input
                                                        type="password"
                                                        placeholder={t('profile.currentPasswordPlaceholder')}
                                                        value={currentPw}
                                                        onChange={(e) => setCurrentPw(e.target.value)}
                                                    />
                                                )}
                                                <Input
                                                    type="password"
                                                    placeholder={t('profile.newPasswordPlaceholder')}
                                                    value={newPw}
                                                    onChange={(e) => setNewPw(e.target.value)}
                                                />
                                                <Input
                                                    type="password"
                                                    placeholder={t('profile.confirmPasswordPlaceholder')}
                                                    value={confirmPw}
                                                    onChange={(e) => setConfirmPw(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleChangePassword()
                                                    }}
                                                />
                                            </div>

                                            {pwError && (
                                                <p className="text-xs text-destructive">{pwError}</p>
                                            )}
                                            {pwSuccess && (
                                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                                    {t('profile.passwordChanged')}
                                                </p>
                                            )}

                                            <Button size="sm" onClick={handleChangePassword}>
                                                {needsCurrentPassword
                                                    ? t('profile.changePassword')
                                                    : t('profile.setPassword')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {section === 'danger' && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-200">
                                    <header className="space-y-1 pr-8">
                                        <h2 className="text-xl font-semibold text-destructive">
                                            {t('profile.dangerTitle')}
                                        </h2>
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            {t('profile.dangerSectionDesc')}
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
                                                        {t('profile.deleteAccount')}
                                                    </p>
                                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                        {t('profile.deleteAccountWarning')}
                                                    </p>
                                                </div>
                                                <ul className="space-y-1 text-xs text-muted-foreground">
                                                    <li>• {t('profile.deleteItemWorkspace')}</li>
                                                    <li>• {t('profile.deleteItemCollections')}</li>
                                                    <li>• {t('profile.deleteItemEnvironments')}</li>
                                                </ul>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="border border-destructive/40"
                                                    onClick={() => {
                                                        setDeletePhrase('')
                                                        setDeleteError('')
                                                        setDeleteOpen(true)
                                                    }}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                    {t('profile.deleteAccount')}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
            </SidebarDialog>

            <Dialog
                open={deleteOpen}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setDeleteOpen(false)
                        setDeletePhrase('')
                        setDeleteError('')
                    }
                }}
            >
                <DialogContent className="sm:max-w-sm" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('profile.deleteConfirmTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('profile.deleteConfirmBefore')}{' '}
                            <span className="font-mono font-semibold text-foreground">DELETE</span>{' '}
                            {t('profile.deleteConfirmAfter')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                        <Input
                            placeholder={t('profile.typeDeletePlaceholder')}
                            value={deletePhrase}
                            onChange={(e) => setDeletePhrase(e.target.value)}
                            autoComplete="off"
                            aria-invalid={!!deleteError}
                        />
                        {deleteError && (
                            <p className="text-xs text-destructive">{deleteError}</p>
                        )}
                    </div>
                    <DialogFooter className="sm:justify-between">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setDeleteOpen(false)
                                setDeletePhrase('')
                                setDeleteError('')
                            }}
                        >
                            {t('profile.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={deleteLoading}
                            onClick={handleDeleteAccount}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteLoading ? t('profile.deleting') : t('profile.confirmDelete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
