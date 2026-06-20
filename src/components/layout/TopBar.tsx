import { useCallback, useState } from 'react'
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
import WindowControls from '@/components/layout/WindowControls'
import { useMacWindowFullscreen } from '@/hooks/useMacWindowFullscreen'
import { useIsTauri } from '@/hooks/useIsTauri'
import {
    macTitlebarActive,
    macTrafficSpacerClass,
    MACOS_TITLEBAR_H,
} from '@/lib/platform'
import { cn } from '@/lib/utils'
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
    const isTauri = useIsTauri()
    const macTitlebar = macTitlebarActive(isTauri)
    const fullscreen = useMacWindowFullscreen()
    const trafficSpacer = macTrafficSpacerClass(fullscreen)

    const toggleMacMaximize = useCallback(() => {
        if (!macTitlebar) return
        void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
            getCurrentWindow().toggleMaximize()
        )
    }, [macTitlebar])

    const logoBlock = (
        <>
            <AppLogo className="h-7 w-7 shrink-0" />
            <span className="shrink-0 text-sm font-semibold tracking-wide">{t('auth.appTitle')}</span>
        </>
    )

    return (
        <div
            className={cn(
                'flex shrink-0 items-stretch border-b border-border/80 bg-card/95 backdrop-blur-sm',
                macTitlebar ? cn(MACOS_TITLEBAR_H, 'macos-window-chrome') : 'h-12'
            )}
        >
            {macTitlebar ? (
                <>
                    <div className={trafficSpacer} aria-hidden />
                    <div
                        onDoubleClick={toggleMacMaximize}
                        className="flex shrink-0 cursor-default items-center gap-2 select-none"
                    >
                        {logoBlock}
                    </div>
                    <div
                        className="min-w-0 flex-1 cursor-default select-none"
                        onDoubleClick={toggleMacMaximize}
                    />
                </>
            ) : (
                <div
                    data-tauri-drag-region={isTauri ? true : undefined}
                    className="flex min-w-0 flex-1 cursor-default items-center gap-2 px-4 select-none"
                >
                    {logoBlock}
                </div>
            )}

            <div
                data-tauri-no-drag={isTauri ? true : undefined}
                className="flex min-w-0 items-center gap-2 px-2 border-r border-border"
            >
                <InstanceSwitcher />
                <WorkspaceSwitcher />
                <EnvironmentSelector />

                <button
                    type="button"
                    data-tauri-no-drag={isTauri ? true : undefined}
                    onClick={() => void syncNow()}
                    disabled={!user || !online || isRemoteSyncBlocked() || pushing}
                    className="relative min-w-[100px] cursor-pointer inline-flex h-6 items-center justify-center gap-1 rounded-md border border-border bg-muted/30 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    title={
                        pendingOutbox > 0
                            ? t('topBar.syncNowTitlePending', { count: pendingOutbox })
                            : t('topBar.syncNowTitle')
                    }
                >
                    <CloudUpload className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">{t('topBar.syncNow')}</span>
                    {pendingOutbox > 0 ? (
                        <span className="min-w-[1.1rem] rounded-full bg-amber-500/15 px-1 text-center text-[8px] font-semibold text-amber-900 dark:text-amber-100">
                            {pendingOutbox}
                        </span>
                    ) : null}
                </button>
            </div>

            <div
                data-tauri-no-drag={isTauri ? true : undefined}
                className="flex items-center gap-3 px-4"
            >
                <button
                    data-tauri-no-drag={isTauri ? true : undefined}
                    onClick={() => setProfileOpen(true)}
                    className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
                >
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold uppercase">
                        {user?.name ? user.name.charAt(0) : ''}
                    </span>
                    {user?.name}
                </button>

                <button
                    data-tauri-no-drag={isTauri ? true : undefined}
                    onClick={() => setSettingsOpen(true)}
                    className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    title={t('topBar.settingsTitle')}
                >
                    <Settings className="h-4 w-4" />
                </button>

                <Button
                    variant="ghost"
                    size="icon"
                    data-tauri-no-drag={isTauri ? true : undefined}
                    className="h-7 w-7"
                    title={t('topBar.signOut')}
                    onClick={() => setSignOutOpen(true)}
                >
                    <LogOut className="h-3.5 w-3.5" />
                </Button>
            </div>

            <WindowControls />

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
