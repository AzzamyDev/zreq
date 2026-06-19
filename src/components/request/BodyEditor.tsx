import { useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CodeMirror from '@uiw/react-codemirror'
import { json, jsonLanguage } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { keymap, type EditorView } from '@codemirror/view'
import { Braces, CircleHelp } from 'lucide-react'
import {
    jsonEditorIndentExtensions,
    jsonEditorViewChrome,
} from '../../lib/json-codemirror-setup'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui/tooltip'
import {
    appCodeMirrorBodyTooltips,
    appCodeMirrorChromeTheme,
    appJsonSyntaxHighlight,
    jsoncCommentDecorations,
} from '../../lib/app-codemirror-theme'
import type { RequestBody, BodyType, KV } from '../../types'
import { jsonBodyTemplateAutocompletion, jsonTemplateVarDecorations } from '../../lib/codemirror-json-template'
import { tryFormatJsoncBody } from '../../lib/format-jsonc-body'
import { stripJsonComments } from '../../lib/strip-json-comments'
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
    /** Last body.content while in none/json/raw — restored after form-data/urlencoded. */
    const textBodySnapshotRef = useRef('')
    /** Last body.content while in form-data/urlencoded — restored after switching back from text. */
    const formBodySnapshotRef = useRef(JSON.stringify(defaultPairs()))

    useEffect(() => {
        bodyRef.current = body
    }, [body])

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

    const textareaClass =
        'w-full flex-1 resize-none rounded-md border border-input bg-background p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring'

    const formatJsonBodyRef = useRef<(pretty: string) => void>(() => { })
    formatJsonBodyRef.current = (pretty: string) => onChange({ ...bodyRef.current, content: pretty })

    const handleFormatJson = useCallback(() => {
        const result = tryFormatJsoncBody(bodyRef.current.content || '')
        if (result.ok) {
            onChange({ ...bodyRef.current, content: result.formatted })
        }
    }, [onChange])

    const jsonBodyExtensions = useMemo(() => {
        const runFormatJson = (view: EditorView) => {
            const result = tryFormatJsoncBody(view.state.doc.toString())
            if (!result.ok) return false
            formatJsonBodyRef.current(result.formatted)
            return true
        }
        return [
            appCodeMirrorChromeTheme,
            jsonEditorViewChrome,
            ...jsonEditorIndentExtensions,
            appCodeMirrorBodyTooltips,
            json(),
            jsonLanguage.data.of({
                commentTokens: {
                    line: '//',
                    block: { open: '/*', close: '*/' },
                },
            }),
            appJsonSyntaxHighlight,
            ...jsoncCommentDecorations,
            ...jsonTemplateVarDecorations(),
            jsonBodyTemplateAutocompletion(),
            // Mod = ⌘ on Mac, Ctrl on Windows. Avoid ⌥⇧F (Alt+Shift+F): on macOS Option inserts characters (e.g. Ï) before the app sees the shortcut.
            keymap.of([{ key: 'Mod-Shift-l', run: runFormatJson }]),
            linter((view: EditorView) => {
                const text = view.state.doc.toString()
                if (!text.trim()) return []
                try {
                    JSON.parse(stripJsonComments(text))
                    return []
                } catch (e) {
                    const msg = (e as Error).message
                    return [
                        {
                            from: 0,
                            to: text.length,
                            severity: 'error' as const,
                            message: msg,
                        },
                    ]
                }
            }),
            lintGutter(),
        ]
    }, [])

    const jsonBodyStatus = useMemo(
        () => (body.type === 'json' ? parseJsonBodyStatus(body.content || '') : null),
        [body.type, body.content]
    )

    const handleTypeChange = (type: BodyType) => {
        if (type === 'urlencoded' || type === 'form-data') {
            if (body.type === 'urlencoded' || body.type === 'form-data') {
                onChange({ type, content: body.content })
            } else {
                // none/json/raw -> form: bring back last form pairs (or empty [])
                onChange({ type, content: formBodySnapshotRef.current })
            }
        } else {
            const from = body.type
            if (TEXT_BODY_TYPES.has(from) && TEXT_BODY_TYPES.has(type)) {
                onChange({ type, content: body.content })
            } else if (from === 'urlencoded' || from === 'form-data') {
                // form -> none/json/raw: bring back last text body
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
        // If content is already JSON array of pairs
        const pairs = parsePairs(body.content)
        if (pairs.length > 0) return pairs
        // Return empty with a default entry
        return []
    }

    const getFormDataPairs = (): FormDataPair[] => {
        if (!body.content) return []
        return parseFormDataPairs(body.content)
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Type selector */}
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

            {/* Body content */}
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

                {/* Keep CodeMirror mounted for none|json|raw so None↔JSON↔Raw does not wipe the editor doc */}
                {TEXT_BODY_TYPES.has(body.type) && (
                    <div
                        className={
                            body.type === 'json'
                                ? 'flex min-h-0 flex-1 flex-col'
                                : 'hidden'
                        }
                    >
                        <div className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:flex [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-editor]:flex-col [&_.cm-scroller]:min-h-0 [&_.cm-scroller]:flex-1">
                            <CodeMirror
                                value={body.content || ''}
                                onChange={(v) => onChange({ ...bodyRef.current, content: v })}
                                theme="none"
                                height="100%"
                                extensions={jsonBodyExtensions}
                                placeholder={t('request.jsonBodyPlaceholder')}
                                className="json-body-cm h-full min-h-0 text-xs [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-editor]:rounded-none [&_.cm-editor]:text-xs [&_.cm-scroller]:font-mono"
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: false,
                                    dropCursor: false,
                                    allowMultipleSelections: false,
                                    indentOnInput: true,
                                    bracketMatching: true,
                                    closeBrackets: true,
                                    autocompletion: true,
                                    highlightActiveLine: false,
                                }}
                            />
                        </div>
                        {(body.type === 'json' && jsonBodyStatus?.kind === 'error') ||
                        (body.type === 'json' && jsonBodyStatus?.kind === 'ok') ? (
                            <div className="shrink-0 border-t border-border px-3 py-1.5">
                                {jsonBodyStatus?.kind === 'error' && (
                                    <p className="text-xs text-destructive" role="status">
                                        {t('request.invalidJson', { message: jsonBodyStatus.message })}
                                    </p>
                                )}
                                {jsonBodyStatus?.kind === 'ok' && (
                                    <p className="text-xs text-(--dracula-green)" role="status">
                                        {t('request.validJson')}
                                    </p>
                                )}
                            </div>
                        ) : null}
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
