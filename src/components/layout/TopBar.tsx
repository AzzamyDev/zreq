import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { CloudUpload, LogOut, Settings } from 'lucide-react'
import EnvironmentSelector from '@/components/environment/EnvironmentSelector'
import InstanceSwitcher from '@/components/instance/InstanceSwitcher'
import WorkspaceSwitcher from '@/components/layout/WorkspaceSwitcher'
import ProfileDialog from '@/components/auth/ProfileDialog'
import SettingsDialog from '../settings/SettingsDialog'
import AppLogo from '@/components/AppLogo'
import { useSyncStore } from '@/store/syncStore'
import { isRemoteSyncBlocked, syncNow } from '@/lib/local-replica/sync-engine'

export default function TopBar() {
    const { t } = useTranslation()
    const { user, logout } = useAuthStore()
    const pendingOutbox = useSyncStore((s) => s.pendingOutbox)
    const pushing = useSyncStore((s) => s.pushing)
    const online = useSyncStore((s) => s.online)
    const [profileOpen, setProfileOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [signOutOpen, setSignOutOpen] = useState(false)

    return (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
            <div className="flex min-w-0 items-center gap-2">
                <AppLogo className="h-7 w-7" />
                <span className="shrink-0 text-sm font-semibold tracking-wide">{t('auth.appTitle')}</span>
                <InstanceSwitcher />
                <WorkspaceSwitcher />
            </div>

            <div className="flex items-center gap-3">
                <EnvironmentSelector />

                <button
                    type="button"
                    onClick={() => void syncNow()}
                    disabled={!user || !online || isRemoteSyncBlocked() || pushing}
                    className="relative cursor-pointer inline-flex h-8 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    title={
                        pendingOutbox > 0
                            ? t('topBar.syncNowTitlePending', { count: pendingOutbox })
                            : t('topBar.syncNowTitle')
                    }
                >
                    <CloudUpload className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">{t('topBar.syncNow')}</span>
                    {pendingOutbox > 0 ? (
                        <span className="min-w-[1.1rem] rounded bg-amber-500/25 px-1 text-center text-[10px] font-semibold text-amber-900 dark:text-amber-100">
                            {pendingOutbox}
                        </span>
                    ) : null}
                </button>

                <button
                    onClick={() => setSettingsOpen(true)}
                    className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    title={t('topBar.settingsTitle')}
                >
                    <Settings className="h-4 w-4" />
                </button>

                <button
                    onClick={() => setProfileOpen(true)}
                    className="text-xs text-muted-foreground cursor-pointer hover:underline"
                >
                    {user?.name}
                </button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('topBar.signOut')}
                    onClick={() => setSignOutOpen(true)}
                >
                    <LogOut className="h-3.5 w-3.5" />
                </Button>
            </div>

            <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
                <DialogContent className="sm:max-w-sm" showCloseButton>
                    <DialogHeader>
                        <DialogTitle>{t('topBar.signOutTitle')}</DialogTitle>
                        <DialogDescription>{t('topBar.signOutDescription')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setSignOutOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                                setSignOutOpen(false)
                                logout()
                            }}
                        >
                            {t('topBar.signOutConfirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
            <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    )
}
