import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { BookOpen, XIcon } from 'lucide-react'
import AppMonacoEditor from '@/components/editor/AppMonacoEditor'
import { attachScriptPmCompletion } from '@/lib/monaco-script-pm'
import { Button } from '@/components/ui/button'
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'

type ScriptDocVariant = 'pre' | 'post'

type ScriptDocApiRow = { sig: string; desc: string }

interface ScriptEditorProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    label?: string
    docVariant?: ScriptDocVariant
    variant?: 'default' | 'embedded'
}

function readApiRows(t: TFunction, key: string): ScriptDocApiRow[] {
    const raw = t(key, { returnObjects: true })
    return Array.isArray(raw) ? (raw as ScriptDocApiRow[]) : []
}

export default function ScriptEditor({
    value,
    onChange,
    label,
    placeholder,
    docVariant,
    variant = 'default',
}: ScriptEditorProps) {
    const { t } = useTranslation()
    const [docsOpen, setDocsOpen] = useState(false)
    const cleanupRef = useRef<(() => void) | undefined>(undefined)

    useEffect(() => () => cleanupRef.current?.(), [])

    const apiRows = useMemo(
        () =>
            docVariant
                ? readApiRows(
                      t,
                      docVariant === 'post' ? 'request.scriptDocs.postApi' : 'request.scriptDocs.preApi',
                  )
                : [],
        [t, docVariant],
    )

    const describePm = useCallback(
        (label: string) => {
            for (const row of apiRows) {
                if (row.sig.startsWith(label)) return row.desc
                const bare = row.sig.replace(/\(.*/, '')
                if (label === bare) return row.desc
            }
            if (label.startsWith('pm.console')) return t('request.scriptDocs.consoleCompletionHint')
            return undefined
        },
        [apiRows, t],
    )

    const handleMount = useCallback(
        (editor: import('monaco-editor').editor.IStandaloneCodeEditor, monaco: import('@monaco-editor/react').Monaco) => {
            cleanupRef.current?.()
            if (docVariant) {
                const disposable = attachScriptPmCompletion(monaco, docVariant, describePm)
                cleanupRef.current = () => disposable.dispose()
            }
        },
        [docVariant, describePm],
    )

    const titleKey = docVariant === 'post' ? 'request.scriptDocs.postTitle' : 'request.scriptDocs.preTitle'
    const introKey = docVariant === 'post' ? 'request.scriptDocs.postIntro' : 'request.scriptDocs.preIntro'
    const noteKey = docVariant === 'post' ? 'request.scriptDocs.postNote' : 'request.scriptDocs.preNote'

    const embedded = variant === 'embedded'

    const editor = (
        <div
            className={
                embedded
                    ? 'min-h-0 flex-1 overflow-hidden'
                    : 'min-h-[180px] flex-1 overflow-hidden rounded-md border border-border'
            }
        >
            <AppMonacoEditor
                value={value}
                onChange={onChange}
                language="javascript"
                placeholder={placeholder}
                wrapperClassName="h-full"
                onMount={handleMount}
                options={{
                    wordWrap: 'off',
                }}
            />
        </div>
    )

    if (!docVariant) {
        return (
            <div className={embedded ? 'flex h-full flex-col' : 'flex h-full flex-col gap-2 p-3'}>
                {label && !embedded && <p className="text-xs text-muted-foreground">{label}</p>}
                {editor}
            </div>
        )
    }

    return (
        <Drawer direction="right" open={docsOpen} onOpenChange={setDocsOpen}>
            <div className={embedded ? 'flex h-full min-h-0 flex-col' : 'flex h-full flex-col gap-2 p-3'}>
                <div
                    className={
                        embedded
                            ? 'border-border flex shrink-0 items-center justify-end border-b px-3 py-1.5'
                            : 'flex items-start justify-between gap-2'
                    }
                >
                    {label && !embedded && (
                        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{label}</p>
                    )}
                    <Button
                        type="button"
                        variant={embedded ? 'ghost' : 'outline'}
                        size="sm"
                        className="shrink-0 gap-1.5"
                        onClick={() => setDocsOpen(true)}
                    >
                        <BookOpen className="size-3.5" />
                        {t('request.scriptDocs.open')}
                    </Button>
                </div>
                {editor}
            </div>

            <DrawerContent
                className="left-auto top-0 right-0 bottom-0 mt-0 flex h-full max-h-dvh w-[min(100vw,22rem)] flex-col gap-0 rounded-none rounded-l-xl border-l p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DrawerHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div className="min-w-0 flex-1 space-y-2">
                        <DrawerTitle>{t(titleKey)}</DrawerTitle>
                        <DrawerDescription className="text-left">{t(introKey)}</DrawerDescription>
                    </div>
                    <DrawerClose asChild>
                        <Button variant="ghost" size="icon-sm" className="shrink-0" type="button">
                            <XIcon />
                            <span className="sr-only">{t('common.close')}</span>
                        </Button>
                    </DrawerClose>
                </DrawerHeader>

                <ScrollArea className="min-h-0 flex-1 px-4 pb-6" data-vaul-no-drag>
                    <div className="flex flex-col gap-5 pr-3 text-xs">
                        <section className="space-y-2">
                            <h3 className="text-foreground font-medium">{t('request.scriptDocs.sectionApi')}</h3>
                            <ul className="text-muted-foreground space-y-3">
                                {apiRows.map((row) => (
                                    <li key={row.sig} className="space-y-1">
                                        <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
                                            {row.sig}
                                        </code>
                                        <p className="leading-relaxed">{row.desc}</p>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h3 className="text-foreground font-medium">{t('request.scriptDocs.sectionConsole')}</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                {t('request.scriptDocs.consoleIntro')}
                            </p>
                        </section>

                        <p className="text-muted-foreground border-border border-l-2 pl-3 leading-relaxed">
                            {t(noteKey)}
                        </p>
                    </div>
                </ScrollArea>
            </DrawerContent>
        </Drawer>
    )
}
