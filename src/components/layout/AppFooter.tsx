import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/store/syncStore'
import { APP_VERSION } from '@/lib/app-version'
import SyncStatusStrip from '@/components/sync/SyncStatusStrip'
import { cn } from '@/lib/utils'

export default function AppFooter() {
    const { t } = useTranslation()
    const online = useSyncStore((s) => s.online)
    const reachable = useSyncStore((s) => s.instanceReachable)

    const warnTone = !online || reachable === false

    return (
        <footer
            className={cn(
                'flex shrink-0 items-center gap-3 border-t px-4 py-1.5 text-xs',
                warnTone
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-border bg-muted/40'
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <SyncStatusStrip />
            </div>
            <span className="shrink-0 tabular-nums text-muted-foreground" title={t('footer.versionTitle')}>
                v{APP_VERSION}
            </span>
        </footer>
    )
}
