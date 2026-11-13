import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useIsTauri } from '@/hooks/useIsTauri'
import { checkDesktopUpdate, installDesktopUpdate, type DesktopUpdateStatus } from '@/lib/desktop-update'
import { useInstanceStore } from '@/store/instanceStore'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function DesktopUpdatePrompt() {
    const isTauri = useIsTauri()
    const { t } = useTranslation()
    const getActiveBaseUrl = useInstanceStore((state) => state.getActiveBaseUrl)
    const [update, setUpdate] = useState<DesktopUpdateStatus | null>(null)
    const [open, setOpen] = useState(false)
    const [installing, setInstalling] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!isTauri) return
        let cancelled = false
        void checkDesktopUpdate(getActiveBaseUrl())
            .then((status) => {
                if (cancelled || !status.available) return
                setUpdate(status)
                setOpen(true)
            })
            .catch(() => {
                /* The server may not publish updates yet. The About page still checks on request. */
            })
        return () => {
            cancelled = true
        }
    }, [getActiveBaseUrl, isTauri])

    if (!isTauri) return null

    const install = async () => {
        setInstalling(true)
        setError('')
        try {
            await installDesktopUpdate(getActiveBaseUrl())
        } catch {
            setInstalling(false)
            setError(t('settings.updateFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !installing && setOpen(next)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('settings.updateAvailableTitle')}</DialogTitle>
                    <DialogDescription>{t('settings.updateAvailable', { version: update?.version ?? '' })}</DialogDescription>
                </DialogHeader>
                {update?.notes ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{update.notes}</p> : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <DialogFooter>
                    <Button variant="outline" disabled={installing} onClick={() => setOpen(false)}>
                        {t('settings.updateLater')}
                    </Button>
                    <Button disabled={installing} onClick={() => void install()}>
                        {installing ? t('settings.updateInstalling') : t('settings.updateInstall')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
