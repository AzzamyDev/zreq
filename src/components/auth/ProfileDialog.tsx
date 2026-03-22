import { useEffect, useState } from 'react'
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
import { AlertTriangle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProfileDialogProps {
    open: boolean
    onClose: () => void
}

const sectionClass =
    'rounded-xl border border-border/80 bg-muted/25 p-4 shadow-sm dark:bg-muted/15'

export default function ProfileDialog({ open, onClose }: ProfileDialogProps) {
    const { t } = useTranslation()
    const { user, setAuth, token, logout } = useAuthStore()
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

    useEffect(() => {
        if (open && user) {
            setName(user.name)
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

    const labelClass = 'text-xs font-medium uppercase tracking-wide text-muted-foreground'

    return (
        <>
            <Dialog
                open={open}
                onOpenChange={(isOpen) => {
                    if (!isOpen) handleClose()
                }}
            >
                <DialogContent
                    showCloseButton={false}
                    className="gap-0 sm:max-w-3xl"
                >
                    <DialogHeader className="pb-2">
                        <DialogTitle className="text-lg">{t('profile.title')}</DialogTitle>
                        <p className="text-sm text-muted-foreground">
                            {t('profile.subtitle')}
                        </p>
                    </DialogHeader>

                    <div className="grid grid-cols-1 gap-3 pb-1 md:grid-cols-2 md:items-start">
                        <section className={sectionClass} aria-labelledby="profile-account-heading">
                            <h3 id="profile-account-heading" className={cn(labelClass, 'mb-3')}>
                                {t('profile.accountInfo')}
                            </h3>
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="profile-name" className="text-sm font-medium">
                                        {t('profile.displayName')}
                                    </label>
                                    <Input
                                        id="profile-name"
                                        placeholder={t('profile.displayNamePlaceholder')}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveName()
                                        }}
                                    />
                                    {nameError && (
                                        <p className="text-xs text-destructive">{nameError}</p>
                                    )}
                                    {nameSuccess && (
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                            {t('profile.nameSaved')}
                                        </p>
                                    )}
                                    <Button
                                        size="sm"
                                        className="mt-1 w-full sm:w-auto"
                                        onClick={handleSaveName}
                                        disabled={!name.trim()}
                                    >
                                        {t('profile.saveName')}
                                    </Button>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="profile-email" className="text-sm font-medium">
                                        {t('common.email')}
                                    </label>
                                    <Input
                                        id="profile-email"
                                        type="email"
                                        value={user?.email ?? ''}
                                        disabled
                                        readOnly
                                        className="opacity-80"
                                        aria-describedby="profile-email-hint"
                                    />
                                    <p
                                        id="profile-email-hint"
                                        className="text-xs text-muted-foreground"
                                    >
                                        {t('profile.emailHint')}
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className={sectionClass} aria-labelledby="profile-password-heading">
                            <h3 id="profile-password-heading" className={cn(labelClass, 'mb-3')}>
                                {t('profile.security')}
                            </h3>
                            <div className="flex flex-col gap-2">
                                <p className="text-sm font-medium">
                                    {needsCurrentPassword
                                        ? t('profile.changePasswordTitle')
                                        : t('profile.setPasswordTitle')}
                                </p>
                                {!needsCurrentPassword && user?.hasPassword === false && (
                                    <p className="text-xs text-muted-foreground">
                                        {t('profile.setPasswordHint')}
                                    </p>
                                )}
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
                                {pwError && (
                                    <p className="text-xs text-destructive">{pwError}</p>
                                )}
                                {pwSuccess && (
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                        {t('profile.passwordChanged')}
                                    </p>
                                )}
                                <Button
                                    size="sm"
                                    className="mt-1 w-full sm:w-auto"
                                    onClick={handleChangePassword}
                                >
                                    {needsCurrentPassword
                                        ? t('profile.changePassword')
                                        : t('profile.setPassword')}
                                </Button>
                            </div>
                        </section>

                        <section
                            className={cn(
                                sectionClass,
                                'border-destructive/25 bg-destructive/6 dark:bg-destructive/10 md:col-span-2'
                            )}
                            aria-labelledby="profile-danger-heading"
                        >
                            <h3
                                id="profile-danger-heading"
                                className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive"
                            >
                                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                                {t('profile.dangerZone')}
                            </h3>
                            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                                {t('profile.deleteAccountWarning')}
                            </p>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="w-full border border-destructive/40 bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto"
                                onClick={() => {
                                    setDeletePhrase('')
                                    setDeleteError('')
                                    setDeleteOpen(true)
                                }}
                            >
                                <Trash2 className="size-3.5" />
                                {t('profile.deleteAccount')}
                            </Button>
                        </section>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={handleClose}>
                            {t('profile.close')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
