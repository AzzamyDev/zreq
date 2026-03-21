import { useState } from 'react'
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

interface NewCollectionDialogProps {
    open: boolean
    onClose: () => void
    onCreate: (name: string) => void
}

export default function NewCollectionDialog({
    open,
    onClose,
    onCreate,
}: NewCollectionDialogProps) {
    const { t } = useTranslation()
    const [name, setName] = useState('')

    const handleCreate = () => {
        const trimmed = name.trim()
        if (!trimmed) return
        onCreate(trimmed)
        setName('')
        onClose()
    }

    const handleClose = () => {
        setName('')
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>{t('collection.newCollectionTitle')}</DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    <Input
                        placeholder={t('collection.collectionNamePlaceholder')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreate()
                            if (e.key === 'Escape') handleClose()
                        }}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleCreate} disabled={!name.trim()}>
                        {t('common.create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
