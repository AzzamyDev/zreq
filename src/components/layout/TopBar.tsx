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
import { LogOut, Settings } from 'lucide-react'
import EnvironmentSelector from '@/components/environment/EnvironmentSelector'
import InstanceSwitcher from '@/components/instance/InstanceSwitcher'
import WorkspaceSwitcher from '@/components/layout/WorkspaceSwitcher'
import ProfileDialog from '@/components/auth/ProfileDialog'
import SettingsDialog from '../settings/SettingsDialog'

export default function TopBar() {
    const { t } = useTranslation()
    const { user, logout } = useAuthStore()
    const [profileOpen, setProfileOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [signOutOpen, setSignOutOpen] = useState(false)

    return (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
            <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 text-sm font-semibold tracking-wide">{t('auth.appTitle')}</span>
                <InstanceSwitcher />
                <WorkspaceSwitcher />
            </div>

            <div className="flex items-center gap-3">
                <EnvironmentSelector />

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
