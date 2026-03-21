import { useTranslation } from 'react-i18next'
import { Github } from 'lucide-react'
import { isTauri } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { normalizeBaseUrl, useInstanceStore } from '@/store/instanceStore'

/** Public API URL for OAuth only (e.g. ngrok). If unset, uses active instance / VITE_API_URL. */
function oauthStartBase(): string {
    const raw = (import.meta.env.VITE_OAUTH_API_BASE as string | undefined)?.trim()
    if (raw) {
        const n = normalizeBaseUrl(raw)
        if (n) return n.replace(/\/$/, '')
    }
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
        <div className="space-y-4">
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="border-border w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card text-muted-foreground px-2">{t('auth.orDivider')}</span>
                </div>
            </div>
            <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-2"
                onClick={() => void startGithub()}
            >
                <Github className="size-4" aria-hidden />
                {t('auth.continueWithGithub')}
            </Button>
        </div>
    )
}
