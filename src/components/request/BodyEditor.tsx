import { useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import CodeMirror from '@uiw/react-codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import { appCodeMirrorChromeTheme, appJsonSyntaxHighlight } from '../../lib/app-codemirror-theme'
import type { RequestBody, BodyType, KV } from '../../types'
import KVEditor from './KVEditor'

interface BodyEditorProps {
    body: RequestBody
    onChange: (body: RequestBody) => void
}

const JSON_EDITOR_PLACEHOLDER = `{
  "key": "value"
}`

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
        JSON.parse(t)
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

    const jsonBodyExtensions = useMemo(
        () => [
            appCodeMirrorChromeTheme,
            json(),
            appJsonSyntaxHighlight,
            linter((view: EditorView) => {
                if (!view.state.doc.toString().trim()) return []
                return jsonParseLinter()(view)
            }),
            lintGutter(),
        ],
        [],
    )

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

    const getPairs = (): KV[] => {
        if (!body.content) return []
        // If content is already JSON array of pairs
        const pairs = parsePairs(body.content)
        if (pairs.length > 0) return pairs
        // Return empty with a default entry
        return []
    }

    return (
        <div className="flex h-full flex-col">
            {/* Type selector */}
            <div className="flex gap-1 border-b border-border px-3 py-2">
                {bodyTypes.map((bt) => (
                    <button
                        key={bt.value}
                        onClick={() => handleTypeChange(bt.value)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                            body.type === bt.value
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                    >
                        {bt.label}
                    </button>
                ))}
            </div>

            {/* Body content */}
            <div className="flex-1 overflow-auto p-3">
                {body.type === 'none' && (
                    <p className="text-sm text-muted-foreground">{t('request.noBody')}</p>
                )}

                {/* Keep CodeMirror mounted for none|json|raw so None↔JSON↔Raw does not wipe the editor doc */}
                {TEXT_BODY_TYPES.has(body.type) && (
                    <div
                        className={
                            body.type === 'json'
                                ? 'flex min-h-[200px] flex-1 flex-col gap-2'
                                : 'hidden'
                        }
                    >
                        <div className="min-h-[200px] w-full overflow-hidden rounded-md border border-input">
                            <CodeMirror
                                value={body.content || ''}
                                onChange={(v) => onChange({ ...bodyRef.current, content: v })}
                                theme="none"
                                height="220px"
                                extensions={jsonBodyExtensions}
                                placeholder={JSON_EDITOR_PLACEHOLDER}
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: true,
                                    dropCursor: false,
                                    allowMultipleSelections: false,
                                    indentOnInput: true,
                                    bracketMatching: true,
                                    closeBrackets: true,
                                    autocompletion: true,
                                    highlightActiveLine: true,
                                }}
                            />
                        </div>
                        {body.type === 'json' && jsonBodyStatus?.kind === 'error' && (
                            <p className="text-xs text-destructive" role="status">
                                {t('request.invalidJson', { message: jsonBodyStatus.message })}
                            </p>
                        )}
                        {body.type === 'json' && jsonBodyStatus?.kind === 'ok' && (
                            <p className="text-xs text-[color:var(--dracula-green)]" role="status">
                                {t('request.validJson')}
                            </p>
                        )}
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

                {(body.type === 'urlencoded' || body.type === 'form-data') && (
                    <KVEditor
                        pairs={getPairs()}
                        onChange={handlePairsChange}
                        keyPlaceholder={t('common.key')}
                        valuePlaceholder={t('common.value')}
                    />
                )}
            </div>
        </div>
    )
}
