import { useTranslation } from 'react-i18next'
import { Github } from 'lucide-react'
import { isTauri } from '@tauri-apps/api/core'
import { useInstanceStore } from '@/store/instanceStore'

function oauthStartBase(): string {
    return useInstanceStore.getState().getActiveBaseUrl().replace(/\/$/, '')
}

export default function GitHubOAuthButton() {
    const { t } = useTranslation()

    const startGithub = async () => {
        const base = oauthStartBase()
        const url = `${base}/auth/github`
        if (isTauri()) {
            const { openUrl } = await import('@tauri-apps/plugin-opener')
            await openUrl(url)
        } else {
            window.location.assign(url)
        }
    }

    return (
        <div className="space-y-5">
            <div className="auth-nebula-divider my-1.5">
                <span className="auth-nebula-divider-line" aria-hidden />
                <span className="auth-nebula-divider-text">{t('auth.orDivider')}</span>
                <span className="auth-nebula-divider-line" aria-hidden />
            </div>
            <button
                type="button"
                className="auth-nebula-btn-secondary"
                onClick={() => void startGithub()}
            >
                <Github className="size-[18px]" aria-hidden />
                {t('auth.continueWithGithub')}
            </button>
        </div>
    )
}
