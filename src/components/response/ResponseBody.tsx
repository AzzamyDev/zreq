import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { indentUnit } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { Braces, ChevronDown, Code2, FileCode2, FileText, Hash, SquareCode } from 'lucide-react'
import { appCodeMirrorChromeTheme, appJsonSyntaxHighlight, jsoncCommentDecorations } from '../../lib/app-codemirror-theme'
import { Button } from '../ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { cn } from '@/lib/utils'

type ResponseBodyFormat = 'json' | 'xml' | 'html' | 'javascript' | 'raw' | 'hex' | 'base64'

interface ResponseBodyProps {
    body: string
    contentType?: string
}

function tryPrettyJson(body: string): string | null {
    const t = body.trim()
    if (!t) return null
    if (!(t.startsWith('{') || t.startsWith('['))) return null
    try {
        return JSON.stringify(JSON.parse(body), null, '\t')
    } catch {
        return null
    }
}

function inferResponseFormat(contentType: string | undefined, body: string): ResponseBodyFormat {
    const ct = (contentType ?? '').toLowerCase()
    if (ct.includes('json') || ct.includes('+json')) return 'json'
    if (ct.includes('html')) return 'html'
    if (ct.includes('xml') || ct.includes('svg')) return 'xml'
    if (ct.includes('javascript') || ct.includes('ecmascript') || ct.includes('typescript')) return 'javascript'

    const pretty = tryPrettyJson(body)
    if (pretty !== null) return 'json'

    const trimmed = body.trim()
    if (trimmed.startsWith('<')) {
        if (/^<\?xml/i.test(trimmed)) return 'xml'
        if (/<\s*html[\s>]/i.test(trimmed)) return 'html'
        return 'xml'
    }
    return 'raw'
}

function utf8ToHex(body: string): string {
    const u = new TextEncoder().encode(body)
    const lines: string[] = []
    for (let i = 0; i < u.length; i += 16) {
        const chunk = u.slice(i, i + 16)
        lines.push([...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' '))
    }
    return lines.join('\n')
}

function utf8ToBase64(body: string): string {
    try {
        return btoa(unescape(encodeURIComponent(body)))
    } catch {
        return ''
    }
}

function buildSourceText(format: ResponseBodyFormat, body: string, contentType?: string): string {
    if (!body) return ''
    if (format === 'json') {
        if (contentType?.toLowerCase().includes('json')) {
            try {
                return JSON.stringify(JSON.parse(body), null, '\t')
            } catch {
                /* fall through */
            }
        }
        return tryPrettyJson(body) ?? body
    }
    if (format === 'hex') return utf8ToHex(body)
    if (format === 'base64') return utf8ToBase64(body)
    return body
}

export default function ResponseBody({ body, contentType }: ResponseBodyProps) {
    const { t } = useTranslation()
    const [format, setFormat] = useState<ResponseBodyFormat>(() => inferResponseFormat(contentType, body))
    const [htmlView, setHtmlView] = useState<'source' | 'preview'>('source')
    const [copied, setCopied] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)

    useEffect(() => {
        setFormat(inferResponseFormat(contentType, body))
        setHtmlView('source')
    }, [body, contentType])

    const sourceText = useMemo(() => buildSourceText(format, body, contentType), [format, body, contentType])

    const responseJsonChrome = useMemo(
        () =>
            EditorView.theme({
                '.cm-content': { paddingTop: '0', paddingBottom: '0' },
                '.cm-lineNumbers .cm-gutterElement': {
                    minWidth: '2.25rem',
                    padding: '0 6px 0 4px',
                },
            }),
        [],
    )

    const jsonExtensions = useMemo(
        () => [
            appCodeMirrorChromeTheme,
            responseJsonChrome,
            EditorState.tabSize.of(2),
            indentUnit.of('\t'),
            json(),
            appJsonSyntaxHighlight,
            ...jsoncCommentDecorations,
            EditorView.lineWrapping,
            indentationMarkers({
                highlightActiveBlock: false,
                colors: {
                    dark: 'color-mix(in srgb, var(--border) 75%, transparent)',
                    light: 'color-mix(in srgb, var(--border) 75%, transparent)',
                },
            }),
        ],
        [responseJsonChrome],
    )

    const plainExtensions = useMemo(
        () => [
            appCodeMirrorChromeTheme,
            responseJsonChrome,
            EditorState.tabSize.of(2),
            indentUnit.of(' '),
            EditorView.lineWrapping,
        ],
        [responseJsonChrome],
    )

    const copyTarget = useMemo(() => {
        if (format === 'html' && htmlView === 'preview') return body
        return sourceText
    }, [format, htmlView, body, sourceText])

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(copyTarget)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            /* ignore */
        }
    }

    const empty = !body

    const formatMeta: Record<ResponseBodyFormat, { labelKey: string; icon: typeof Braces }> = {
        json: { labelKey: 'response.formatJson', icon: Braces },
        xml: { labelKey: 'response.formatXml', icon: Code2 },
        html: { labelKey: 'response.formatHtml', icon: FileCode2 },
        javascript: { labelKey: 'response.formatJavascript', icon: SquareCode },
        raw: { labelKey: 'response.formatRaw', icon: FileText },
        hex: { labelKey: 'response.formatHex', icon: Hash },
        base64: { labelKey: 'response.formatBase64', icon: SquareCode },
    }

    const FmtIcon = formatMeta[format].icon

    const showCodeMirror = !empty && !(format === 'html' && htmlView === 'preview')

    const useJsonHighlight = format === 'json' && tryPrettyJson(body) !== null

    return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[11px]">
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 border-border bg-card px-2 text-xs font-medium text-foreground"
                            >
                                <FmtIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
                                <span>{t(formatMeta[format].labelKey)}</span>
                                <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
                            </Button>
                        }
                    />
                    <DropdownMenuContent align="start" className="min-w-44">
                        <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide">
                                {t('response.formatSectionFormatted')}
                            </DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                value={format}
                                onValueChange={(v) => {
                                    setFormat(v as ResponseBodyFormat)
                                    setMenuOpen(false)
                                }}
                            >
                                {(['json', 'xml', 'html', 'javascript'] as const).map((f) => {
                                    const { labelKey, icon: Ic } = formatMeta[f]
                                    return (
                                        <DropdownMenuRadioItem key={f} value={f} className="gap-2 pl-2">
                                            <Ic className="size-3.5 opacity-70" aria-hidden />
                                            <span className="flex-1">{t(labelKey)}</span>
                                        </DropdownMenuRadioItem>
                                    )
                                })}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide">
                                {t('response.formatSectionEncoded')}
                            </DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                value={format}
                                onValueChange={(v) => {
                                    setFormat(v as ResponseBodyFormat)
                                    setMenuOpen(false)
                                }}
                            >
                                {(['raw', 'hex', 'base64'] as const).map((f) => {
                                    const { labelKey, icon: Ic } = formatMeta[f]
                                    return (
                                        <DropdownMenuRadioItem key={f} value={f} className="gap-2 pl-2">
                                            <Ic className="size-3.5 opacity-70" aria-hidden />
                                            <span className="flex-1">{t(labelKey)}</span>
                                        </DropdownMenuRadioItem>
                                    )
                                })}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                {format === 'html' && !empty && (
                    <div className="flex items-center rounded-md border border-border bg-card p-0.5">
                        <button
                            type="button"
                            onClick={() => setHtmlView('source')}
                            className={cn(
                                'rounded px-2 py-1 text-xs font-medium transition-colors',
                                htmlView === 'source'
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t('response.bodyPrettyTab')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setHtmlView('preview')}
                            className={cn(
                                'rounded px-2 py-1 text-xs font-medium transition-colors',
                                htmlView === 'preview'
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t('response.bodyPreviewTab')}
                        </button>
                    </div>
                )}

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 shrink-0 border-border bg-card px-2 text-xs"
                    onClick={() => void handleCopy()}
                    disabled={empty}
                >
                    {copied ? t('response.copied') : t('response.copy')}
                </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
                {empty ? (
                    <pre className="min-h-full overflow-auto whitespace-pre-wrap wrap-break-word p-4 font-mono text-xs leading-relaxed text-foreground">
                        <span className="text-muted-foreground italic">{t('response.emptyBody')}</span>
                    </pre>
                ) : format === 'html' && htmlView === 'preview' ? (
                    <iframe
                        title={t('response.bodyPreviewTab')}
                        srcDoc={body}
                        sandbox="allow-same-origin allow-scripts allow-forms"
                        className="h-full min-h-[240px] w-full border-0 bg-background"
                    />
                ) : showCodeMirror ? (
                    <div className="h-full min-h-0 overflow-hidden [&_.cm-editor]:flex [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-editor]:flex-col [&_.cm-scroller]:min-h-0 [&_.cm-scroller]:flex-1">
                        <CodeMirror
                            value={sourceText}
                            theme="none"
                            height="100%"
                            editable={false}
                            extensions={useJsonHighlight ? jsonExtensions : plainExtensions}
                            basicSetup={{
                                lineNumbers: true,
                                foldGutter: useJsonHighlight,
                                highlightActiveLine: false,
                                dropCursor: false,
                                allowMultipleSelections: false,
                            }}
                            className="h-full min-h-0 text-xs [&_.cm-editor]:text-xs [&_.cm-editor]:rounded-none [&_.cm-scroller]:font-mono"
                        />
                    </div>
                ) : null}
            </div>
        </div>
    )
}
