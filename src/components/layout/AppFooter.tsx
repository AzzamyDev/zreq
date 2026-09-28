import { useTranslation } from 'react-i18next'
import { APP_VERSION } from '@/lib/app-version'
import SyncStatusStrip from '@/components/sync/SyncStatusStrip'

export default function AppFooter() {
    const { t } = useTranslation()

    return (
        <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-muted/40 px-4 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
                <SyncStatusStrip />
            </div>
            <span className="shrink-0 tabular-nums text-muted-foreground" title={t('footer.versionTitle')}>
                v{APP_VERSION}
            </span>
        </footer>
    )
}
