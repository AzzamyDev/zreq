import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { useAppStore } from '../../store'
import { parseCurl } from '../../lib/curl-import'

interface CurlImportDialogProps {
    open: boolean
    onClose: () => void
}

export default function CurlImportDialog({ open, onClose }: CurlImportDialogProps) {
    const { t } = useTranslation()
    const addTab = useAppStore((s) => s.addTab)
    const [text, setText] = useState('')
    const [error, setError] = useState<'empty' | 'no-url' | null>(null)

    useEffect(() => {
        if (open) {
            setText('')
            setError(null)
        }
    }, [open])

    const handleImport = () => {
        const parsed = parseCurl(text)
        if (!parsed.ok) {
            setError(parsed.error)
            return
        }
        addTab({
            name: parsed.draft.name,
            method: parsed.draft.method,
            url: parsed.draft.url,
            headers: parsed.draft.headers,
            params: [],
            body: parsed.draft.body,
            auth: parsed.draft.auth,
            protocol: 'http',
        })
        toast.success(t('request.importedCurl'))
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t('request.importCurlTitle')}</DialogTitle>
                    <DialogDescription>{t('request.importCurlDescription')}</DialogDescription>
                </DialogHeader>
                <Textarea
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value)
                        setError(null)
                    }}
                    placeholder={t('request.importCurlPlaceholder')}
                    className="min-h-40 font-mono text-xs"
                    spellCheck={false}
                    autoFocus
                />
                {error ? (
                    <p className="text-sm text-destructive">
                        {error === 'empty' ? t('request.importCurlEmpty') : t('request.importCurlNoUrl')}
                    </p>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleImport}>{t('request.importCurlAction')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
