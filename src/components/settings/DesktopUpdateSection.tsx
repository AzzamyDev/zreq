import { Button } from '@/components/ui/button'
import { useIsTauri } from '@/hooks/useIsTauri'
import { checkDesktopUpdate, installDesktopUpdate } from '@/lib/desktop-update'
import { useInstanceStore } from '@/store/instanceStore'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export default function DesktopUpdateSection() {
    const isTauri = useIsTauri()
    const { t } = useTranslation()
    const getActiveBaseUrl = useInstanceStore((state) => state.getActiveBaseUrl)
    const [busy, setBusy] = useState<'check' | 'install' | null>(null)
    const [availableVersion, setAvailableVersion] = useState('')

    if (!isTauri) return null

    const check = async () => {
        setBusy('check')
        setAvailableVersion('')
        try {
            const status = await checkDesktopUpdate(getActiveBaseUrl())
            if (status.available) {
                setAvailableVersion(status.version)
                return
            }
            toast.success(t('settings.upToDate'))
        } catch {
            toast.error(t('settings.updateCheckFailed'))
        } finally {
            setBusy(null)
        }
    }

    const install = async () => {
        setBusy('install')
        try {
            await installDesktopUpdate(getActiveBaseUrl())
        } catch {
            setBusy(null)
            toast.error(t('settings.updateFailed'))
        }
    }

    return (
        <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">{t('settings.updateHint')}</p>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void check()}>
                    {busy === 'check' ? t('settings.checkingUpdates') : t('settings.checkUpdates')}
                </Button>
                {availableVersion ? (
                    <Button type="button" disabled={busy !== null} onClick={() => void install()}>
                        {busy === 'install' ? t('settings.updateInstalling') : t('settings.updateInstall')}
                    </Button>
                ) : null}
            </div>
            {availableVersion ? (
                <p className="text-sm">{t('settings.updateAvailable', { version: availableVersion })}</p>
            ) : null}
        </div>
    )
}
