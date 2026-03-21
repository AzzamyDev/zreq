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

interface RenameDialogProps {
    open: boolean
    onClose: () => void
    onRename: (name: string) => void
    initialName: string
    title?: string
}

export default function RenameDialog({
    open,
    onClose,
    onRename,
    initialName,
    title,
}: RenameDialogProps) {
    const { t } = useTranslation()
    const [name, setName] = useState(initialName)

    useEffect(() => {
        if (open) setName(initialName)
    }, [open, initialName])

    const handleRename = () => {
        const trimmed = name.trim()
        if (!trimmed) return
        onRename(trimmed)
        onClose()
    }

    const handleClose = () => {
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>{title ?? t('common.rename')}</DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename()
                            if (e.key === 'Escape') handleClose()
                        }}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleRename} disabled={!name.trim()}>
                        {t('common.rename')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
