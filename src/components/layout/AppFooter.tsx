import { useTranslation } from 'react-i18next'
import { APP_VERSION } from '@/lib/app-version'

export default function AppFooter() {
    const { t } = useTranslation()

    return (
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-muted/40 px-4 py-1.5 text-xs">
            <span className="shrink-0 tabular-nums text-muted-foreground" title={t('footer.versionTitle')}>
                v{APP_VERSION}
            </span>
        </footer>
    )
}
