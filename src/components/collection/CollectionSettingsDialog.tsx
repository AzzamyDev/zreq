import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerFooter,
    DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '../ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { preventDrawerDismissForPortaledLayer, preventDrawerFocusDismiss } from '@/lib/drawer-outside-guard'
import AuthEditor from '../request/AuthEditor'
import KVEditor from '../request/KVEditor'
import type { Collection, AuthConfig, EnvVariable, KV } from '../../types'
import { nanoid } from 'nanoid'

interface CollectionSettingsDialogProps {
    open: boolean
    onClose: () => void
    collection: Collection
    onSave: (updates: { name?: string; description?: string; auth?: AuthConfig; variables?: EnvVariable[] }) => Promise<void>
}

type SettingsSection = 'general' | 'auth' | 'variables'

function envToKV(vars: EnvVariable[]): KV[] {
    return vars.map((v) => ({ id: v.id?.toString() ?? nanoid(), key: v.key, value: v.value, enabled: v.enabled }))
}

function kvToEnv(pairs: KV[]): EnvVariable[] {
    return pairs.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled }))
}

export default function CollectionSettingsDialog({ open, onClose, collection, onSave }: CollectionSettingsDialogProps) {
    const { t } = useTranslation()
    const selectPortalRef = useRef<HTMLDivElement>(null)
    const [section, setSection] = useState<SettingsSection>('general')
    const [name, setName] = useState(collection.name)
    const [description, setDescription] = useState(collection.description ?? '')
    const [auth, setAuth] = useState<AuthConfig>(collection.auth ?? { type: 'none' })
    const [variables, setVariables] = useState<KV[]>(envToKV(collection.variables ?? []))
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (open) {
            setSection('general')
            setName(collection.name)
            setDescription(collection.description ?? '')
            setAuth(collection.auth ?? { type: 'none' })
            setVariables(envToKV(collection.variables ?? []))
        }
    }, [open, collection])

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSave({
                name: name.trim() || collection.name,
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
        <Drawer
            direction="left"
            open={open}
            onOpenChange={(v) => {
                if (!v) onClose()
            }}
        >
            <DrawerContent
                className="top-0 right-auto bottom-0 left-0 mt-0 flex h-full max-h-dvh w-[min(100vw,44rem)] flex-col gap-0 rounded-none rounded-r-xl border-r p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => preventDrawerDismissForPortaledLayer(e, e.target)}
                onFocusOutside={(e) => preventDrawerFocusDismiss(e)}
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <DrawerTitle className="font-heading text-base font-medium">{t('collectionSettings.title')}</DrawerTitle>
                    <DrawerClose asChild>
                        <Button variant="ghost" size="icon-sm" type="button" className="shrink-0">
                            <XIcon />
                            <span className="sr-only">{t('common.close')}</span>
                        </Button>
                    </DrawerClose>
                </div>

                <div ref={selectPortalRef} className="relative flex min-h-0 flex-1">
                    <nav
                        className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-border p-2"
                        aria-label={t('collectionSettings.title')}
                    >
                        {navBtn('general', t('collectionSettings.general'))}
                        {navBtn('auth', t('collectionSettings.auth'))}
                        {navBtn('variables', t('collectionSettings.variables'))}
                    </nav>

                    <ScrollArea className="min-h-0 flex-1" data-vaul-no-drag>
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
                                            placeholder={t('collectionSettings.descriptionPlaceholder')}
                                            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                        />
                                    </div>
                                </div>
                            )}

                            {section === 'auth' && (
                                <>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                        {t('collectionSettings.authHintBefore')}{' '}
                                        <strong>{t('collectionSettings.authHintStrong')}</strong>{' '}
                                        {t('collectionSettings.authHintAfter')}
                                    </p>
                                    <AuthEditor
                                        auth={auth}
                                        onChange={setAuth}
                                        hideInherit
                                        selectPortalContainer={selectPortalRef}
                                        variableSuggestionScope={{
                                            collectionId: collection.id,
                                            folderId: null,
                                        }}
                                    />
                                </>
                            )}

                            {section === 'variables' && (
                                <>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                        {t('collectionSettings.variablesHintBefore')}{' '}
                                        <code className="rounded bg-muted px-1 text-xs">{'{{variableName}}'}</code>{' '}
                                        {t('collectionSettings.variablesHintAfter')}
                                    </p>
                                    <KVEditor
                                        pairs={variables}
                                        onChange={setVariables}
                                        keyPlaceholder={t('collectionSettings.variable')}
                                        valuePlaceholder={t('common.value')}
                                        variableSuggestionScope={{
                                            collectionId: collection.id,
                                            folderId: null,
                                        }}
                                    />
                                </>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <DrawerFooter className="flex flex-row justify-end gap-2 border-t bg-muted/30">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? t('common.saving') : t('common.save')}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}
