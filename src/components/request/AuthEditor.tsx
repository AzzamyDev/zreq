import { useMemo, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { AuthConfig } from '../../types'
import type { VariableSuggestionScope } from '../../lib/env-resolver'
import VarTemplateField from './VarTemplateField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

interface AuthEditorProps {
    auth: AuthConfig
    onChange: (auth: AuthConfig) => void
    hideInherit?: boolean
    /** Portal select list into this node (e.g. drawer panel) so Radix/Vaul dialog does not treat it as an outside interaction. */
    selectPortalContainer?: RefObject<HTMLElement | null>
    variableSuggestionScope?: VariableSuggestionScope
}

export default function AuthEditor({
    auth,
    onChange,
    hideInherit,
    selectPortalContainer,
    variableSuggestionScope,
}: AuthEditorProps) {
    const { t } = useTranslation()
    const authTypes = useMemo(() => {
        const all = [
            { value: 'none' as const, label: t('authEditor.typeNone') },
            { value: 'inherit' as const, label: t('authEditor.typeInherit') },
            { value: 'bearer' as const, label: t('authEditor.typeBearer') },
            { value: 'basic' as const, label: t('authEditor.typeBasic') },
            { value: 'jwt' as const, label: t('authEditor.typeJwt') },
        ]
        return hideInherit ? all.filter((x) => x.value !== 'inherit') : all
    }, [hideInherit, t])
    const labelClass = 'mb-1 block text-xs font-medium text-muted-foreground'

    return (
        <div className="space-y-4 p-3">
            <div>
                <label className={labelClass}>{t('authEditor.authType')}</label>
                <Select
                    value={auth.type}
                    onValueChange={(value) => {
                        const next = value as AuthConfig['type']
                        if (next === 'none') onChange({ type: 'none', overrideParent: true })
                        else if (next === 'inherit') onChange({ type: 'inherit' })
                        else if (next === 'bearer') onChange({ type: 'bearer', token: '' })
                        else if (next === 'basic') onChange({ type: 'basic', username: '', password: '' })
                        else if (next === 'jwt') onChange({ type: 'jwt', token: '', prefix: 'Bearer' })
                    }}
                >
                    <SelectTrigger className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <SelectValue>
                            {authTypes.find((x) => x.value === auth.type)?.label ?? auth.type}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                        container={selectPortalContainer}
                        align="start"
                        side="bottom"
                        sideOffset={4}
                    >
                        {authTypes.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {auth.type === 'none' && (
                <p className="text-sm text-muted-foreground">{t('authEditor.noAuth')}</p>
            )}

            {auth.type === 'inherit' && (
                <p className="text-sm text-muted-foreground">{t('authEditor.inheritAuth')}</p>
            )}

            {(auth.type === 'bearer' || auth.type === 'jwt' || auth.type === 'basic') && (
                <p className="mb-2 text-xs text-muted-foreground">{t('authEditor.credentialsVarHint')}</p>
            )}

            {auth.type === 'bearer' && (
                <div>
                    <label className={labelClass}>{t('authEditor.token')}</label>
                    <VarTemplateField
                        wrap
                        value={auth.token}
                        onChange={(v) => onChange({ type: 'bearer', token: v })}
                        placeholder={t('authEditor.bearerPlaceholder')}
                        className="min-h-8 w-full rounded-md border border-input bg-background px-2 py-1"
                        inputClassName="text-sm"
                        variableSuggestionScope={variableSuggestionScope}
                    />
                </div>
            )}

            {auth.type === 'jwt' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelClass}>{t('authEditor.token')}</label>
                        <VarTemplateField
                            wrap
                            value={auth.token}
                            onChange={(v) => onChange({ type: 'jwt', token: v, prefix: auth.prefix })}
                            placeholder={t('authEditor.jwtPlaceholder')}
                            className="min-h-8 w-full rounded-md border border-input bg-background px-2 py-1"
                            inputClassName="text-sm"
                            variableSuggestionScope={variableSuggestionScope}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>{t('authEditor.prefix')}</label>
                        <VarTemplateField
                            wrap
                            value={auth.prefix}
                            onChange={(v) => onChange({ type: 'jwt', token: auth.token, prefix: v })}
                            placeholder={t('authEditor.bearerPrefixPlaceholder')}
                            className="min-h-8 w-full rounded-md border border-input bg-background px-2 py-1"
                            inputClassName="text-sm"
                            variableSuggestionScope={variableSuggestionScope}
                        />
                    </div>
                </div>
            )}

            {auth.type === 'basic' && (
                <div className="space-y-3">
                    <div>
                        <label className={labelClass}>{t('authEditor.username')}</label>
                        <VarTemplateField
                            wrap
                            value={auth.username}
                            onChange={(v) => onChange({ type: 'basic', username: v, password: auth.password })}
                            placeholder={t('authEditor.usernamePlaceholder')}
                            className="min-h-8 w-full rounded-md border border-input bg-background px-2 py-1"
                            inputClassName="text-sm"
                            variableSuggestionScope={variableSuggestionScope}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>{t('common.password')}</label>
                        <VarTemplateField
                            wrap
                            value={auth.password}
                            onChange={(v) => onChange({ type: 'basic', username: auth.username, password: v })}
                            placeholder={t('authEditor.passwordPlaceholder')}
                            className="min-h-8 w-full rounded-md border border-input bg-background px-2 py-1"
                            inputClassName="text-sm"
                            variableSuggestionScope={variableSuggestionScope}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
