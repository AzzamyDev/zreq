import { useMemo, useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import CodeMirror from '@uiw/react-codemirror'
import { json, jsonLanguage } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { keymap, type EditorView } from '@codemirror/view'
import { Trash2 } from 'lucide-react'
import {
    appCodeMirrorBodyTooltips,
    appCodeMirrorChromeTheme,
    appJsonSyntaxHighlight,
    jsoncCommentDecorations,
} from '../../lib/app-codemirror-theme'
import type { RequestBody, BodyType, KV } from '../../types'
import { jsonBodyTemplateAutocompletion, jsonTemplateVarDecorations } from '../../lib/codemirror-json-template'
import { formatJsoncPreserveComments } from '../../lib/format-jsonc-body'
import { stripJsonComments } from '../../lib/strip-json-comments'
import KVEditor from './KVEditor'

interface BodyEditorProps {
    body: RequestBody
    onChange: (body: RequestBody) => void
}


/** Body modes that share the same string `content` slot (switching among them should not wipe text). */
const TEXT_BODY_TYPES = new Set<BodyType>(['none', 'json', 'raw'])
type FormDataValueType = 'text' | 'file'
type FormDataPair = KV & {
    valueType?: FormDataValueType
    fileName?: string
    fileMimeType?: string
    fileBase64?: string
    fileParts?: {
        name: string
        mimeType: string
        base64: string
    }[]
}

function parsePairs(content: string): KV[] {
    try {
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed)) return parsed as KV[]
    } catch {
        // ignore
    }
    return []
}

function parseFormDataPairs(content: string): FormDataPair[] {
    try {
        const parsed = JSON.parse(content)
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
            .map((row) => {
                const valueType = row.valueType === 'file' ? 'file' : 'text'
                return {
                    id: typeof row.id === 'string' ? row.id : nanoid(),
                    key: typeof row.key === 'string' ? row.key : '',
                    value: typeof row.value === 'string' ? row.value : '',
                    enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
                    valueType,
                    fileName: typeof row.fileName === 'string' ? row.fileName : undefined,
                    fileMimeType: typeof row.fileMimeType === 'string' ? row.fileMimeType : undefined,
                    fileBase64: typeof row.fileBase64 === 'string' ? row.fileBase64 : undefined,
                    fileParts: Array.isArray(row.fileParts)
                        ? row.fileParts
                            .filter((part): part is Record<string, unknown> => typeof part === 'object' && part !== null)
                            .map((part) => ({
                                name: typeof part.name === 'string' ? part.name : 'upload.bin',
                                mimeType:
                                    typeof part.mimeType === 'string' && part.mimeType.trim()
                                        ? part.mimeType
                                        : 'application/octet-stream',
                                base64: typeof part.base64 === 'string' ? part.base64 : '',
                            }))
                            .filter((part) => part.base64.length > 0)
                        : undefined,
                } satisfies FormDataPair
            })
    } catch {
        return []
    }
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
    const [uploadingRowId, setUploadingRowId] = useState<string | null>(null)
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

    const jsonBodyExtensions = useMemo(() => {
        const runFormatJson = (view: EditorView) => {
            const raw = view.state.doc.toString()
            if (!raw.trim()) return true
            try {
                JSON.parse(stripJsonComments(raw))
            } catch {
                return false
            }
            try {
                formatJsonBodyRef.current(formatJsoncPreserveComments(raw))
                return true
            } catch {
                return false
            }
        }
        return [
            appCodeMirrorChromeTheme,
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

    const fileToBase64 = async (file: File): Promise<string> => {
        const buf = await file.arrayBuffer()
        let binary = ''
        const bytes = new Uint8Array(buf)
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
    }

    const updateFormPair = (id: string, patch: Partial<FormDataPair>) => {
        const pairs = getFormDataPairs().map((p) => (p.id === id ? { ...p, ...patch } : p))
        handleFormDataPairsChange(pairs)
    }

    const addFormPair = () => {
        handleFormDataPairsChange([
            ...getFormDataPairs(),
            { id: nanoid(), key: '', value: '', enabled: true, valueType: 'text' },
        ])
    }

    const removeFormPair = (id: string) => {
        handleFormDataPairsChange(getFormDataPairs().filter((p) => p.id !== id))
    }

    const pickFileForPair = async (pairId: string, files: FileList | null) => {
        if (!files || files.length === 0) return
        setUploadingRowId(pairId)
        try {
            const fileParts = await Promise.all(
                [...files].map(async (file) => ({
                    name: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    base64: await fileToBase64(file),
                })),
            )
            const first = fileParts[0]
            updateFormPair(pairId, {
                valueType: 'file',
                value: '',
                fileName: first?.name,
                fileMimeType: first?.mimeType,
                fileBase64: first?.base64,
                fileParts,
            })
        } finally {
            setUploadingRowId(null)
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Type selector */}
            <div className="flex gap-1 border-b border-border px-3 py-2">
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

            {/* Body content */}
            <div className="min-h-0 flex-1 overflow-auto p-3">
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
                                placeholder={t('request.jsonBodyPlaceholder')}
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
                            <p className="text-xs text-(--dracula-green)" role="status">
                                {t('request.validJson')}
                            </p>
                        )}
                        {body.type === 'json' && (
                            <p className="text-xs text-muted-foreground">{t('request.jsonBodyHint')}</p>
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

                {body.type === 'urlencoded' && (
                    <KVEditor
                        pairs={getPairs()}
                        onChange={handlePairsChange}
                        keyPlaceholder={t('common.key')}
                        valuePlaceholder={t('common.value')}
                    />
                )}

                {body.type === 'form-data' && (
                    <div className="space-y-2">
                        <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_9rem_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-md border border-border px-2 py-1">
                            <span className="truncate text-xs text-muted-foreground">{t('common.enabled', 'Enabled')}</span>
                            <span className="text-xs text-muted-foreground">{t('common.key')}</span>
                            <span className="text-xs text-muted-foreground">Type</span>
                            <span className="text-xs text-muted-foreground">{t('common.value')}</span>
                            <span />
                        </div>
                        {getFormDataPairs().map((pair) => (
                            <div
                                key={pair.id}
                                className="grid grid-cols-[4.25rem_minmax(0,1fr)_9rem_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-md border border-border px-2 py-1"
                            >
                                <label className="flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={pair.enabled}
                                        onChange={(e) => updateFormPair(pair.id, { enabled: e.target.checked })}
                                        className="h-4 w-4 cursor-pointer accent-primary"
                                    />
                                    <span>On</span>
                                </label>
                                <input
                                    type="text"
                                    value={pair.key}
                                    onChange={(e) => updateFormPair(pair.id, { key: e.target.value })}
                                    placeholder={t('common.key')}
                                    className="h-8 rounded border border-border bg-background px-2 text-xs"
                                />
                                <select
                                    value={pair.valueType ?? 'text'}
                                    onChange={(e) => {
                                        const valueType = e.target.value === 'file' ? 'file' : 'text'
                                        if (valueType === 'file') {
                                            updateFormPair(pair.id, {
                                                valueType: 'file',
                                                value: '',
                                            })
                                            return
                                        }
                                        updateFormPair(pair.id, {
                                            valueType: 'text',
                                            fileName: undefined,
                                            fileMimeType: undefined,
                                            fileBase64: undefined,
                                            fileParts: undefined,
                                        })
                                    }}
                                    className="h-8 rounded border border-border bg-background px-2 text-xs"
                                >
                                    <option value="text">Text</option>
                                    <option value="file">File</option>
                                </select>
                                {(pair.valueType ?? 'text') === 'file' ? (
                                    <div className="flex min-w-0 items-center gap-2">
                                        <label className="inline-flex h-8 cursor-pointer items-center rounded border border-border px-2 text-xs text-muted-foreground hover:bg-muted">
                                            Choose files
                                            <input
                                                type="file"
                                                multiple
                                                className="hidden"
                                                onChange={(e) => {
                                                    void pickFileForPair(pair.id, e.target.files)
                                                    e.currentTarget.value = ''
                                                }}
                                            />
                                        </label>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {uploadingRowId === pair.id
                                                ? 'Uploading...'
                                                : pair.fileParts && pair.fileParts.length > 1
                                                    ? `${pair.fileParts.length} files selected`
                                                    : pair.fileParts?.[0]?.name || pair.fileName || 'No file selected'}
                                        </span>
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        value={pair.value}
                                        onChange={(e) => updateFormPair(pair.id, { value: e.target.value })}
                                        placeholder={t('common.value')}
                                        className="h-8 rounded border border-border bg-background px-2 text-xs"
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeFormPair(pair.id)}
                                    className="inline-flex h-8 items-center justify-center rounded border border-border px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    title={t('common.remove')}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={addFormPair}
                            className="h-8 rounded border border-border px-3 text-xs text-muted-foreground hover:bg-muted"
                        >
                            + Add row
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
