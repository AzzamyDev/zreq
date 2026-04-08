import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '../ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import AuthEditor from '../request/AuthEditor'
import KVEditor from '../request/KVEditor'
import type { Folder, AuthConfig, EnvVariable, KV } from '../../types'
import { nanoid } from 'nanoid'

interface FolderSettingsDialogProps {
    open: boolean
    onClose: () => void
    collectionId: number
    folder: Folder
    onSave: (updates: {
        name?: string
        description?: string
        auth?: AuthConfig
        variables?: EnvVariable[]
    }) => Promise<void>
}

type SettingsSection = 'general' | 'auth' | 'variables'

function envToKV(vars: EnvVariable[]): KV[] {
    return vars.map((v) => ({ id: v.id?.toString() ?? nanoid(), key: v.key, value: v.value, enabled: v.enabled }))
}

function kvToEnv(pairs: KV[]): EnvVariable[] {
    return pairs.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled }))
}

export default function FolderSettingsDialog({
    open,
    onClose,
    collectionId,
    folder,
    onSave,
}: FolderSettingsDialogProps) {
    const { t } = useTranslation()
    const selectPortalRef = useRef<HTMLDivElement>(null)
    const [section, setSection] = useState<SettingsSection>('general')
    const [name, setName] = useState(folder.name)
    const [description, setDescription] = useState(folder.description ?? '')
    const [auth, setAuth] = useState<AuthConfig>(folder.auth ?? { type: 'inherit' })
    const [variables, setVariables] = useState<KV[]>(envToKV(folder.variables ?? []))
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (open) {
            setSection('general')
            setName(folder.name)
            setDescription(folder.description ?? '')
            setAuth(folder.auth ?? { type: 'inherit' })
            setVariables(envToKV(folder.variables ?? []))
        }
    }, [open, folder])

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSave({
                name: name.trim() || folder.name,
                description,
                auth,
                variables: kvToEnv(variables.filter((v) => v.key.trim())),
            })
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const inputClass =
        'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring'
    const labelClass = 'mb-1 block text-xs font-medium text-muted-foreground'

    const navBtn = (id: SettingsSection, label: string) => (
        <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                section === id
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
        >
            {label}
        </button>
    )

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) onClose()
            }}
        >
            <DialogContent
                showCloseButton={false}
                className="flex h-[86vh] max-h-[760px] w-[96vw] !max-w-[96vw] flex-col overflow-hidden rounded-xl p-0 sm:w-[980px] sm:!max-w-[980px]"
                initialFocus={false}
            >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                    <DialogTitle className="font-heading text-base font-medium">{t('folderSettings.title')}</DialogTitle>
                    <Button variant="ghost" size="icon-sm" type="button" className="shrink-0" onClick={onClose}>
                        <XIcon />
                        <span className="sr-only">{t('common.close')}</span>
                    </Button>
                </div>

                <div ref={selectPortalRef} className="relative flex min-h-0 flex-1">
                    <nav
                        className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-border p-2"
                        aria-label={t('folderSettings.title')}
                    >
                        {navBtn('general', t('collectionSettings.general'))}
                        {navBtn('auth', t('collectionSettings.auth'))}
                        {navBtn('variables', t('collectionSettings.variables'))}
                    </nav>

                    <ScrollArea className="min-h-0 flex-1">
                        <div className="p-4 pr-5">
                            {section === 'general' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className={labelClass}>{t('common.name')}</label>
                                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>{t('collectionSettings.descriptionLabel')}</label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            rows={4}
                                            placeholder={t('folderSettings.descriptionPlaceholder')}
                                            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                        />
                                    </div>
                                </div>
                            )}

                            {section === 'auth' && (
                                <>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                        {t('folderSettings.authHintBefore')}{' '}
                                        <strong>{t('folderSettings.authHintStrong')}</strong>{' '}
                                        {t('folderSettings.authHintAfter')}
                                    </p>
                                    <AuthEditor
                                        auth={auth}
                                        onChange={setAuth}
                                        selectPortalContainer={selectPortalRef}
                                        variableSuggestionScope={{
                                            collectionId,
                                            folderId: folder.id,
                                        }}
                                    />
                                </>
                            )}

                            {section === 'variables' && (
                                <>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                        {t('folderSettings.variablesHintBefore')}{' '}
                                        <code className="rounded bg-muted px-1 text-xs">{'{{variableName}}'}</code>{' '}
                                        {t('folderSettings.variablesHintAfter')}
                                    </p>
                                    <KVEditor
                                        pairs={variables}
                                        onChange={setVariables}
                                        keyPlaceholder={t('folderSettings.variable')}
                                        valuePlaceholder={t('common.value')}
                                        variableSuggestionScope={{
                                            collectionId,
                                            folderId: folder.id,
                                        }}
                                    />
                                </>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t bg-muted/30 px-3">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? t('common.saving') : t('common.save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
