import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/store/syncStore'
import { Button } from '@/components/ui/button'
import { pullThenPush } from '@/lib/local-replica/sync-engine'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

/** Sync messages only; chrome and version live in `AppFooter`. */
export default function SyncStatusStrip() {
    const { t } = useTranslation()
    const online = useSyncStore((s) => s.online)
    const forceOfflineSync = useSyncStore((s) => s.forceOfflineSync)
    const reachable = useSyncStore((s) => s.instanceReachable)
    const pending = useSyncStore((s) => s.pendingOutbox)
    const pulling = useSyncStore((s) => s.pulling)
    const pushing = useSyncStore((s) => s.pushing)
    const lastErr = useSyncStore((s) => s.lastError)
    const authed = useAuthStore((s) => s.isAuthenticated)

    if (!authed) return null

    const syncBlocked = !online || forceOfflineSync
    const showBrowserOffline = !online
    const showManualPause = online && forceOfflineSync
    const showUnreachable = online && !forceOfflineSync && reachable === false
    const showPending = pending > 0 || pulling || pushing
    const showErr = !!lastErr && !syncBlocked

    const canRetrySync = online && !forceOfflineSync && reachable !== false

    return (
        <div className="flex w-full min-w-0 items-center gap-2 text-[9px] leading-tight">
            <div className="flex min-h-6 min-w-0 flex-1 items-center gap-2 overflow-hidden">
                {showBrowserOffline ? <span className="shrink-0">{t('sync.offline')}</span> : null}
                {showManualPause ? <span className="shrink-0">{t('sync.forceOfflineActive')}</span> : null}
                {showUnreachable && !showBrowserOffline && !showManualPause ? (
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
            <Button
                type="button"
                variant="ghost"
                size="sm"
                tabIndex={canRetrySync ? 0 : -1}
                aria-hidden={!canRetrySync}
                className={cn(
                    'ml-auto h-6 shrink-0 text-xs',
                    !canRetrySync && 'pointer-events-none invisible'
                )}
                disabled={!canRetrySync || pulling || pushing}
                onClick={() => {
                    void pullThenPush()
                }}
            >
                {t('sync.retrySync')}
            </Button>
        </div>
    )
}
