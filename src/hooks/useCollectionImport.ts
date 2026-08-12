import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { importCollections, type ImportFormat } from '../lib/importExport'
import { createLocalCollection } from '@/lib/local-replica/local-write'
import { useAppStore } from '../store'

export function useCollectionImport() {
    const { t } = useTranslation()
    const { activeWorkspaceId } = useAppStore()
    const [formatDialogOpen, setFormatDialogOpen] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const importFormatRef = useRef<ImportFormat>('postman')

    const requestImport = () => setFormatDialogOpen(true)

    const handleFormatConfirm = (format: ImportFormat) => {
        importFormatRef.current = format
        requestAnimationFrame(() => fileInputRef.current?.click())
    }

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        if (files.length === 0) return
        try {
            if (activeWorkspaceId == null) {
                toast.warning(t('sidebar.selectWorkspaceFirst'))
                return
            }
            let imported = 0
            for (const file of files) {
                const text = await file.text()
                const rows = importCollections(text, importFormatRef.current)
                for (const data of rows) {
                    const { name, items, ...extra } = data
                    await createLocalCollection(name, items as unknown[], extra)
                    imported += 1
                }
            }
            if (imported > 0) {
                toast.success(t('sidebar.importedCollections', { count: imported }))
            }
        } catch (err) {
            console.error(err)
            const detail = isAxiosError(err)
                ? (typeof err.response?.data?.message === 'string'
                      ? err.response.data.message
                      : Array.isArray(err.response?.data?.message)
                        ? err.response.data.message.join(', ')
                        : err.response?.data?.error)
                : err instanceof Error
                  ? err.message
                  : String(err)
            toast.error(t('sidebar.importFailed'), detail ? { description: String(detail) } : undefined)
        }
        e.target.value = ''
    }

    return {
        formatDialogOpen,
        setFormatDialogOpen,
        requestImport,
        handleFormatConfirm,
        fileInputRef,
        handleImportFile,
    }
}
