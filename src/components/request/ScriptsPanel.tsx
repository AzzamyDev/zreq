import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import ScriptEditor from './ScriptEditor'

type ScriptSection = 'pre' | 'post'

interface ScriptsPanelProps {
    preRequest: string
    postResponse: string
    onPreChange: (value: string) => void
    onPostChange: (value: string) => void
}

export default function ScriptsPanel({
    preRequest,
    postResponse,
    onPreChange,
    onPostChange,
}: ScriptsPanelProps) {
    const { t } = useTranslation()
    const [section, setSection] = useState<ScriptSection>('pre')

    const NAV: { id: ScriptSection; label: string; hasScript: boolean }[] = [
        { id: 'pre', label: t('request.preRequest'), hasScript: !!preRequest.trim() },
        { id: 'post', label: t('request.postResponse'), hasScript: !!postResponse.trim() },
    ]

    return (
        <div className="flex h-full min-h-0">
            <nav
                className="flex w-[9.5rem] shrink-0 flex-col gap-0.5 border-r border-border bg-muted/10 p-2 pt-3"
                aria-label={t('request.scripts')}
            >
                {NAV.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => setSection(item.id)}
                        className={cn(
                            'relative rounded-md px-3 py-2 text-left text-sm transition-colors',
                            section === item.id
                                ? 'bg-muted text-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                    >
                        {item.label}
                        {item.hasScript ? (
                            <span
                                className="bg-primary absolute top-1/2 right-2 size-1.5 -translate-y-1/2 rounded-full"
                                aria-hidden
                            />
                        ) : null}
                    </button>
                ))}
            </nav>

            <div className="relative flex min-w-0 flex-1 flex-col">
                <div className={cn('absolute inset-0 flex flex-col', section !== 'pre' && 'hidden')}>
                    <ScriptEditor
                        variant="embedded"
                        docVariant="pre"
                        value={preRequest}
                        onChange={onPreChange}
                        placeholder={t('request.scriptPlaceholderPre')}
                    />
                </div>
                <div className={cn('absolute inset-0 flex flex-col', section !== 'post' && 'hidden')}>
                    <ScriptEditor
                        variant="embedded"
                        docVariant="post"
                        value={postResponse}
                        onChange={onPostChange}
                        placeholder={t('request.scriptPlaceholderPost')}
                    />
                </div>
            </div>
        </div>
    )
}
