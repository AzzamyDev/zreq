import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FolderUp, Plus, Search, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import CollectionTree from '../collection/CollectionTree'
import ImportFormatDialog from '../collection/ImportFormatDialog'
import { useCollectionImport } from '@/hooks/useCollectionImport'

const SEARCH_DEBOUNCE_MS = 250

export default function Sidebar() {
    const { t } = useTranslation()
    const [openNew, setOpenNew] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const {
        formatDialogOpen,
        setFormatDialogOpen,
        requestImport,
        handleFormatConfirm,
        fileInputRef,
        handleImportFile,
    } = useCollectionImport()

    useEffect(() => {
        const id = window.setTimeout(() => setDebouncedQuery(searchQuery), SEARCH_DEBOUNCE_MS)
        return () => window.clearTimeout(id)
    }, [searchQuery])

    const clearSearch = () => {
        setSearchQuery('')
        setDebouncedQuery('')
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
            <div className="sticky top-0 z-20 shrink-0 bg-sidebar">
                <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
                    <span className="truncate text-xs font-medium tracking-wider text-muted-foreground">
                        {t('sidebar.collections')}
                    </span>
                    <div className="flex items-center gap-0.5">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={requestImport}
                            title={t('sidebar.importTitle')}
                        >
                            <FolderUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setOpenNew(true)}
                            title={t('sidebar.newCollectionTitle')}
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
                <div className="border-b border-sidebar-border px-2 py-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('sidebar.searchPlaceholder')}
                            className="h-8 border-sidebar-border/60 bg-transparent pr-8 pl-8 text-xs"
                            aria-label={t('sidebar.searchPlaceholder')}
                        />
                        {searchQuery ? (
                            <button
                                type="button"
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                                onClick={clearSearch}
                                title={t('common.clear')}
                                aria-label={t('common.clear')}
                            >
                                <X className="size-3.5" />
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                multiple
                className="hidden"
                onChange={handleImportFile}
            />
            <ScrollArea className="min-h-0 flex-1 overflow-hidden" viewportClassName="bg-sidebar">
                <CollectionTree
                    openNew={openNew}
                    onNewDialogClose={() => setOpenNew(false)}
                    onImportClick={requestImport}
                    searchQuery={debouncedQuery}
                />
            </ScrollArea>
            <ImportFormatDialog
                open={formatDialogOpen}
                onClose={() => setFormatDialogOpen(false)}
                onConfirm={handleFormatConfirm}
                kind="collection"
            />
        </div>
    )
}
