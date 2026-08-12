import { useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Braces, CircleHelp } from 'lucide-react'
import AppMonacoEditor from '../editor/AppMonacoEditor'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui/tooltip'
import type { RequestBody, BodyType, KV } from '../../types'
import { tryFormatJsoncBody } from '../../lib/format-jsonc-body'
import { stripJsonComments } from '../../lib/strip-json-comments'
import { attachJsonBodyFeatures } from '../../lib/monaco-json-body'
import KVEditor from './KVEditor'
import FormDataEditor, { type FormDataPair, parseFormDataPairs } from './FormDataEditor'

interface BodyEditorProps {
    body: RequestBody
    onChange: (body: RequestBody) => void
}

/** Body modes that share the same string `content` slot (switching among them should not wipe text). */
const TEXT_BODY_TYPES = new Set<BodyType>(['none', 'json', 'raw'])

function parsePairs(content: string): KV[] {
    try {
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed)) return parsed as KV[]
    } catch {
        // ignore
    }
    return []
}

function defaultPairs(): KV[] {
    return []
}

function parseJsonBodyStatus(content: string): { kind: 'empty' } | { kind: 'ok' } | { kind: 'error'; message: string } {
    const t = content.trim()
    if (!t) return { kind: 'empty' }
    try {
        JSON.parse(stripJsonComments(t))
        return { kind: 'ok' }
    } catch (e) {
        return { kind: 'error', message: (e as Error).message }
    }
}

export default function BodyEditor({ body, onChange }: BodyEditorProps) {
    const { t } = useTranslation()
    const bodyTypes = useMemo(
        () =>
            [
                { value: 'none' as const, label: t('request.bodyTypeNone') },
                { value: 'json' as const, label: t('request.bodyTypeJson') },
                { value: 'form-data' as const, label: t('request.bodyTypeFormData') },
                { value: 'urlencoded' as const, label: t('request.bodyTypeUrlEncoded') },
                { value: 'raw' as const, label: t('request.bodyTypeRaw') },
            ] satisfies { value: BodyType; label: string }[],
        [t],
    )
    const bodyRef = useRef(body)
    const textBodySnapshotRef = useRef('')
    const formBodySnapshotRef = useRef(JSON.stringify(defaultPairs()))
    const cleanupRef = useRef<(() => void) | undefined>(undefined)

    useEffect(() => {
        bodyRef.current = body
    }, [body])

    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    useEffect(() => {
        if (TEXT_BODY_TYPES.has(body.type)) {
            textBodySnapshotRef.current = body.content ?? ''
        }
    }, [body.type, body.content])

    useEffect(() => {
        if (body.type === 'urlencoded' || body.type === 'form-data') {
            formBodySnapshotRef.current = body.content ?? JSON.stringify(defaultPairs())
        }
    }, [body.type, body.content])

    useEffect(() => () => cleanupRef.current?.(), [])

    const textareaClass =
        'w-full flex-1 resize-none rounded-md border border-input bg-background p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring'

    const handleBodyContentChange = useCallback((v: string) => {
        onChangeRef.current({ ...bodyRef.current, content: v })
    }, [])

    const handleFormatJson = useCallback(() => {
        const result = tryFormatJsoncBody(bodyRef.current.content || '')
        if (result.ok) {
            onChange({ ...bodyRef.current, content: result.formatted })
        }
    }, [onChange])

    const handleEditorMount = useCallback(
        (editor: import('monaco-editor').editor.IStandaloneCodeEditor, monaco: import('@monaco-editor/react').Monaco) => {
            cleanupRef.current?.()
            cleanupRef.current = attachJsonBodyFeatures(
                editor,
                monaco,
                (formatted) => onChangeRef.current({ ...bodyRef.current, content: formatted }),
            )
        },
        [],
    )

    const jsonBodyStatus = useMemo(
        () => (body.type === 'json' ? parseJsonBodyStatus(body.content || '') : null),
        [body.type, body.content],
    )

    const handleTypeChange = (type: BodyType) => {
        if (type === 'urlencoded' || type === 'form-data') {
            if (body.type === 'urlencoded' || body.type === 'form-data') {
                onChange({ type, content: body.content })
            } else {
                onChange({ type, content: formBodySnapshotRef.current })
            }
        } else {
            const from = body.type
            if (TEXT_BODY_TYPES.has(from) && TEXT_BODY_TYPES.has(type)) {
                onChange({ type, content: body.content })
            } else if (from === 'urlencoded' || from === 'form-data') {
                onChange({ type, content: textBodySnapshotRef.current })
            } else {
                onChange({ type, content: from === type ? body.content : '' })
            }
        }
    }

    const handlePairsChange = (pairs: KV[]) => {
        onChange({ ...bodyRef.current, content: JSON.stringify(pairs) })
    }

    const handleFormDataPairsChange = (pairs: FormDataPair[]) => {
        onChange({ ...bodyRef.current, content: JSON.stringify(pairs) })
    }

    const getPairs = (): KV[] => {
        if (!body.content) return []
        const pairs = parsePairs(body.content)
        if (pairs.length > 0) return pairs
        return []
    }

    const getFormDataPairs = (): FormDataPair[] => {
        if (!body.content) return []
        return parseFormDataPairs(body.content)
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <div className="flex min-w-0 flex-1 gap-1">
                    {bodyTypes.map((bt) => (
                        <button
                            key={bt.value}
                            onClick={() => handleTypeChange(bt.value)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${body.type === bt.value
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                        >
                            {bt.label}
                        </button>
                    ))}
                </div>
                {body.type === 'json' && (
                    <div className="inline-flex shrink-0 items-center gap-1">
                        <TooltipProvider delay={200}>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <button
                                            type="button"
                                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                            aria-label={t('request.jsonBodyHintTitle')}
                                        >
                                            <CircleHelp className="size-3.5" aria-hidden />
                                        </button>
                                    }
                                />
                                <TooltipContent
                                    side="bottom"
                                    align="end"
                                    className="max-w-xs whitespace-normal text-left leading-relaxed"
                                >
                                    {t('request.jsonBodyHint')}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <button
                            type="button"
                            onClick={handleFormatJson}
                            disabled={jsonBodyStatus?.kind !== 'ok'}
                            title={t('request.formatJsonShortcut')}
                            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Braces className="size-3.5" aria-hidden />
                            {t('request.formatJson')}
                        </button>
                    </div>
                )}
            </div>

            <div
                className={
                    body.type === 'json'
                        ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                        : 'min-h-0 flex-1 overflow-auto p-3'
                }
            >
                {body.type === 'none' && (
                    <p className="text-sm text-muted-foreground">{t('request.noBody')}</p>
                )}

                {TEXT_BODY_TYPES.has(body.type) && (
                    <div
                        className={
                            body.type === 'json'
                                ? 'relative flex min-h-0 flex-1 flex-col'
                                : 'hidden'
                        }
                    >
                        <AppMonacoEditor
                            value={body.content || ''}
                            onChange={handleBodyContentChange}
                            language="json"
                            placeholder={t('request.jsonBodyPlaceholder')}
                            wrapperClassName="min-h-0 flex-1"
                            className="json-body-monaco"
                            onMount={handleEditorMount}
                        />
                    </div>
                )}

                {body.type === 'raw' && (
                    <textarea
                        value={body.content || ''}
                        onChange={(e) => onChange({ ...bodyRef.current, content: e.target.value })}
                        placeholder={t('request.rawBodyPlaceholder')}
                        className={`${textareaClass} min-h-[200px]`}
                        spellCheck={false}
                    />
                )}

                {body.type === 'urlencoded' && (
                    <KVEditor
                        pairs={getPairs()}
                        onChange={handlePairsChange}
                        keyPlaceholder={t('common.key')}
                        valuePlaceholder={t('common.value')}
                    />
                )}

                {body.type === 'form-data' && (
                    <FormDataEditor
                        pairs={getFormDataPairs()}
                        onChange={handleFormDataPairsChange}
                        sectionTitle={t('request.formData')}
                    />
                )}
            </div>
        </div>
    )
}
