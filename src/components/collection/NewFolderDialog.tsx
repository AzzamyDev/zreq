import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'

interface NewFolderDialogProps {
    open: boolean
    onClose: () => void
    onConfirm: (name: string) => void | Promise<void>
    title?: string
}

export default function NewFolderDialog({
    open,
    onClose,
    onConfirm,
    title,
}: NewFolderDialogProps) {
    const { t } = useTranslation()
    const [name, setName] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (open) {
            setName('')
            setSaving(false)
        }
    }, [open])

    const handleClose = () => {
        if (saving) return
        onClose()
    }

    const handleCreate = async () => {
        const trimmed = name.trim()
        if (!trimmed) return
        setSaving(true)
        try {
            await onConfirm(trimmed)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>{title ?? t('collection.newFolderTitle')}</DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCreate()
                            if (e.key === 'Escape') handleClose()
                        }}
                        placeholder={t('collection.folderNamePlaceholder')}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose} disabled={saving}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={() => void handleCreate()} disabled={!name.trim() || saving}>
                        {saving ? t('common.creating') : t('common.create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
