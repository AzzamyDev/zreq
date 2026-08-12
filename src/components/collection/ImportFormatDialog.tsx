import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select'
import type { ImportFormat } from '../../lib/importExport'

type ImportFormatDialogProps = {
    open: boolean
    onClose: () => void
    onConfirm: (format: ImportFormat) => void
    kind: 'collection' | 'environment'
}

export default function ImportFormatDialog({
    open,
    onClose,
    onConfirm,
    kind,
}: ImportFormatDialogProps) {
    const { t } = useTranslation()
    const [format, setFormat] = useState<ImportFormat>('postman')

    const handleConfirm = () => {
        onConfirm(format)
        onClose()
    }

    const titleKey =
        kind === 'collection' ? 'import.formatDialog.collectionTitle' : 'import.formatDialog.environmentTitle'
    const descriptionKey =
        kind === 'collection'
            ? 'import.formatDialog.collectionDescription'
            : 'import.formatDialog.environmentDescription'

    const formatLabels: Record<ImportFormat, string> = {
        postman: t('import.formatDialog.postman'),
        hoppscotch: t('import.formatDialog.hoppscotch'),
        zreq: t('import.formatDialog.zreq'),
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>{t(titleKey)}</DialogTitle>
                    <DialogDescription>{t(descriptionKey)}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-2 py-1">
                    <Label htmlFor="import-format">{t('import.formatDialog.formatLabel')}</Label>
                    <Select
                        value={format}
                        onValueChange={(value) => setFormat(value as ImportFormat)}
                    >
                        <SelectTrigger id="import-format" className="w-full">
                            <SelectValue>{formatLabels[format]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="postman">{t('import.formatDialog.postman')}</SelectItem>
                            <SelectItem value="hoppscotch">{t('import.formatDialog.hoppscotch')}</SelectItem>
                            <SelectItem value="zreq">{t('import.formatDialog.zreq')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleConfirm}>{t('import.formatDialog.continue')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
