import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CloudUpload, LogOut, Settings, UserRound } from 'lucide-react'
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
                className="flex min-w-0 items-center gap-2 px-2"
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
                className="flex items-center px-3"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger
                        data-tauri-no-drag={isTauri ? true : undefined}
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-full"
                                aria-label={t('topBar.accountMenu')}
                            >
                                <Avatar size="sm" className="size-6">
                                    <AvatarFallback className="bg-muted font-semibold uppercase text-muted-foreground">
                                        {user?.name?.charAt(0) || '?'}
                                    </AvatarFallback>
                                </Avatar>
                            </Button>
                        }
                    />
                    <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
                        <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                                <UserRound />
                                <span className="truncate">{user?.name || t('topBar.account')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                                <Settings />
                                {t('topBar.settingsTitle')}
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setSignOutOpen(true)}
                            >
                                <LogOut />
                                {t('topBar.signOut')}
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
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
