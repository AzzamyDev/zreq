import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/store/syncStore'
import { useAuthStore } from '@/store/authStore'

/** Sync status only; background sync runs automatically. */
export default function SyncStatusStrip() {
    const { t } = useTranslation()
    const online = useSyncStore((s) => s.online)
    const reachable = useSyncStore((s) => s.instanceReachable)
    const pending = useSyncStore((s) => s.pendingOutbox)
    const pulling = useSyncStore((s) => s.pulling)
    const pushing = useSyncStore((s) => s.pushing)
    const lastErr = useSyncStore((s) => s.lastError)
    const authed = useAuthStore((s) => s.isAuthenticated)

    if (!authed) return null

    const syncBlocked = !online
    const showBrowserOffline = !online
    const showUnreachable = online && reachable === false
    const showPending = pending > 0 || pulling || pushing
    const showErr = !!lastErr && !syncBlocked

    return (
        <div className="flex w-full min-w-0 items-center gap-2 text-[9px] leading-tight">
            <div className="flex min-h-6 min-w-0 flex-1 items-center gap-2 overflow-hidden">
                {showBrowserOffline ? <span className="shrink-0">{t('sync.offline')}</span> : null}
                {showUnreachable && !showBrowserOffline ? (
                    <span className="shrink-0">{t('sync.serverUnreachable')}</span>
                ) : null}
                {showPending ? (
                    <span className="shrink-0 tabular-nums">
                        {pulling || pushing ? t('sync.syncing') : t('sync.pending', { count: pending })}
                    </span>
                ) : null}
                {showErr ? (
                    <span className="min-w-0 flex-1 truncate text-destructive">{lastErr}</span>
                ) : null}
            </div>
        </div>
    )
}
