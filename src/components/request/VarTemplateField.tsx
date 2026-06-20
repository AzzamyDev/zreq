import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal, flushSync } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store'
import { useEnvironment } from '../../hooks/useEnvironment'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import {
    findVarSegmentIndexAtUrlOffset,
    flatOffsetToTextCaret,
    parseUrlSegments,
    removeVarSegment,
    segmentsToUrl,
    updateTextSegment,
    updateVarSegmentName,
    type UrlSegment,
} from '../../lib/urlSegments'
import {
    getActiveEnvVars,
    getVariableSource,
    listTemplateVariableSuggestions,
    type VariableSuggestionScope,
} from '../../lib/env-resolver'
import { cn } from '../../lib/utils'

/** Cursor in a text segment right after `{{`, optional partial name (no closing `}}` yet). */
const INCOMPLETE_TEMPLATE_RE = /\{\{([a-zA-Z0-9_.-]*)$/

const CLOSED_VAR_TOKEN_RE = /\{\{([^}]+)\}\}/g

function countClosedVarTokens(url: string): number {
    let n = 0
    CLOSED_VAR_TOKEN_RE.lastIndex = 0
    while (CLOSED_VAR_TOKEN_RE.exec(url) !== null) n += 1
    return n
}

/** Flat index in `segmentsToUrl(segments)` at start of segment `segIndex` (array index). */
function flatOffsetAtSegmentStart(segments: UrlSegment[], segIndex: number): number {
    let o = 0
    for (let j = 0; j < segIndex; j++) {
        const s = segments[j]
        if (s.type === 'text') o += s.value.length
        else o += 2 + s.name.length + 2
    }
    return o
}

/** Parent `value` can differ by trailing/leading whitespace from `newStr` we built. */
function urlMatchesExtractPending(pending: string, current: string) {
    const a = pending.trimEnd()
    const b = (current ?? '').trimEnd()
    if (a === b) return true
    return segmentsToUrl(parseUrlSegments(pending)) === segmentsToUrl(parseUrlSegments(current ?? ''))
}

export type VarTemplateFieldProps = {
    value: string
    onChange: (next: string) => void
    className?: string
    inputClassName?: string
    placeholder?: string
    onMetaEnter?: () => void
    metaEnterDisabled?: boolean
    onBlur?: () => void
    inputOnKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
    /** Allow line wrap (KV cells); URL bar should omit or false */
    wrap?: boolean
    /** Collection/folder context for suggestions and chip source labels (settings dialogs). */
    variableSuggestionScope?: VariableSuggestionScope
}

function VarTemplateField({
    value,
    onChange,
    className,
    inputClassName,
    placeholder: _placeholder,
    onMetaEnter,
    metaEnterDisabled,
    onBlur,
    inputOnKeyDown,
    wrap = false,
    variableSuggestionScope,
}: VarTemplateFieldProps) {
    const { t } = useTranslation()
    const scopeId = useId().replace(/:/g, '')
    const rootRef = useRef<HTMLDivElement>(null)
    const segElRef = useRef<Map<number, HTMLElement>>(new Map())
    const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const setSegEl = useCallback((segIndex: number, el: HTMLElement | null) => {
        if (el) segElRef.current.set(segIndex, el)
        else segElRef.current.delete(segIndex)
    }, [])

    const { environments, activeEnvironmentId, collections, collectionId, folderId } = useAppStore(
        useShallow((s) => ({
            environments: s.environments,
            activeEnvironmentId: s.activeEnvironmentId,
            collections: s.collections,
            collectionId: s.activeRequest.collectionId,
            folderId: s.activeRequest.folderId,
        })),
    )
    const { updateVariables } = useEnvironment()

    const [varPopover, setVarPopover] = useState<{
        x: number
        y: number
        selection: string
        start: number
        end: number
        inputIndex: number
    } | null>(null)
    const [varName, setVarName] = useState('')
    const varInputRef = useRef<HTMLInputElement>(null)

    const [templateSuggest, setTemplateSuggest] = useState<{
        segIndex: number
        openBraceStart: number
        caretPos: number
        filter: string
        x: number
        y: number
    } | null>(null)
    const [suggestHighlight, setSuggestHighlight] = useState(0)
    const suggestRowRef = useRef<Map<number, HTMLButtonElement>>(new Map())
    const afterTemplateSuggestCaretRef = useRef<{ flatOffset: number } | null>(null)
    const templateSuggestLiveRef = useRef(templateSuggest)
    templateSuggestLiveRef.current = templateSuggest
    /** Setelah pilih saran, chip baru sering tepat di bawah pointer → `mouseEnter` buka Popover dan rebut fokus dari caret kanan chip. */
    const blockVarChipHoverOpenUntilRef = useRef(0)

    const segments = useMemo(() => parseUrlSegments(value || ''), [value])

    const allVarSuggestions = useMemo(
        () => listTemplateVariableSuggestions(variableSuggestionScope),
        [environments, activeEnvironmentId, collections, collectionId, folderId, variableSuggestionScope],
    )

    const filteredVarSuggestions = useMemo(() => {
        if (!templateSuggest) return []
        const q = templateSuggest.filter.toLowerCase()
        return allVarSuggestions.filter((s) => s.key.toLowerCase().startsWith(q))
    }, [templateSuggest, allVarSuggestions])

    const syncTemplateSuggestFromInput = useCallback((el: HTMLInputElement, segIndex: number) => {
        const v = el.value
        const caret = el.selectionStart ?? v.length
        const m = v.slice(0, caret).match(INCOMPLETE_TEMPLATE_RE)
        if (m) {
            const rect = el.getBoundingClientRect()
            setTemplateSuggest({
                segIndex,
                openBraceStart: caret - m[0].length,
                caretPos: caret,
                filter: m[1],
                x: rect.left,
                y: rect.bottom + 4,
            })
            setSuggestHighlight(0)
        } else {
            setTemplateSuggest(null)
        }
    }, [])

    const focusAdjacentSegment = useCallback(
        (from: number, dir: -1 | 1) => {
            for (let j = from + dir; j >= 0 && j < segments.length; j += dir) {
                const el = segElRef.current.get(j)
                if (el) {
                    el.focus()
                    if (el instanceof HTMLInputElement) {
                        if (dir === 1) el.setSelectionRange(0, 0)
                        else el.setSelectionRange(el.value.length, el.value.length)
                    }
                    return
                }
            }
        },
        [segments],
    )

    const setFromSegments = (next: UrlSegment[]) => {
        onChange(segmentsToUrl(next))
    }

    const applyTemplateSuggestion = (pickKey: string) => {
        if (!templateSuggest) return
        setOpenVarSegIndex(null)
        const { segIndex, openBraceStart, caretPos } = templateSuggest
        const seg = segments[segIndex]
        if (seg?.type !== 'text') return
        const token = `{{${pickKey}}}`
        const newVal = seg.value.slice(0, openBraceStart) + token + seg.value.slice(caretPos)
        const caretInSegment = openBraceStart + token.length
        let prefixBeforeTextSeg = 0
        for (let i = 0; i < segIndex; i++) {
            const s = segments[i]
            if (s.type === 'text') prefixBeforeTextSeg += s.value.length
            else prefixBeforeTextSeg += 2 + s.name.length + 2
        }
        const nextSegs = updateTextSegment(segments, segIndex, newVal)
        const nextUrl = segmentsToUrl(nextSegs)
        let tokenStart = nextUrl.indexOf(token, prefixBeforeTextSeg)
        if (tokenStart < 0) tokenStart = nextUrl.indexOf(token)
        const flatOffset =
            tokenStart >= 0
                ? tokenStart + token.length
                : prefixBeforeTextSeg + caretInSegment
        afterTemplateSuggestCaretRef.current = { flatOffset }
        blockVarChipHoverOpenUntilRef.current = performance.now() + 600
        flushSync(() => setFromSegments(nextSegs))
        setTemplateSuggest(null)
    }

    const lastTextIndex = useMemo(() => {
        for (let j = segments.length - 1; j >= 0; j--) {
            if (segments[j].type === 'text') return j
        }
        return -1
    }, [segments])

    /** After extract: focus text segment to the right of the new `{{…}}` (offset = index of `{{` in new URL). */
    const extractFocusRef = useRef<{ url: string; varStartFlat: number; varEndFlat: number } | null>(null)

    /** Postman-style: caret in the text segment immediately after the new `{{…}}` chip. */
    const runPostExtractFocus = useCallback(
        (urlForParse: string, varStartFlat: number, varEndFlat: number): boolean => {
            const root = rootRef.current
            if (!root) return false
            const segs = parseUrlSegments(urlForParse)
            const focusTextSeg = (segIdx: number, caret: number) => {
                const el = root.querySelector<HTMLInputElement>(
                    `input[data-template-seg-type="text"][data-template-seg-idx="${segIdx}"]`,
                )
                if (!el) return false
                el.focus({ preventScroll: true })
                el.setSelectionRange(caret, caret)
                return true
            }
            const varIdx = findVarSegmentIndexAtUrlOffset(segs, varStartFlat)
            if (varIdx >= 0) {
                for (let j = varIdx + 1; j < segs.length; j++) {
                    if (segs[j].type === 'text' && focusTextSeg(j, 0)) return true
                }
            }
            const pos = flatOffsetToTextCaret(segs, varEndFlat)
            if (pos && segs[pos.segIndex]?.type === 'text')
                return focusTextSeg(pos.segIndex, pos.caret)
            return false
        },
        [],
    )

    const [openVarSegIndex, setOpenVarSegIndex] = useState<number | null>(null)
    const [editVarValue, setEditVarValue] = useState('')
    const [varPanelPos, setVarPanelPos] = useState<{ x: number; y: number } | null>(null)
    const varChipAnchorRefs = useRef<Map<number, HTMLDivElement>>(new Map())
    const varValuePanelRef = useRef<HTMLDivElement>(null)

    const repositionVarValuePanel = useCallback(() => {
        if (openVarSegIndex == null) return
        const el = varChipAnchorRefs.current.get(openVarSegIndex)
        if (!el) return
        const r = el.getBoundingClientRect()
        const panelW = 288
        const pad = 8
        const x = Math.max(pad, Math.min(r.left, window.innerWidth - panelW - pad))
        const y = Math.min(r.bottom + 6, window.innerHeight - pad)
        setVarPanelPos({ x, y })
    }, [openVarSegIndex])

    useLayoutEffect(() => {
        if (openVarSegIndex == null) {
            setVarPanelPos(null)
            return
        }
        repositionVarValuePanel()
        window.addEventListener('scroll', repositionVarValuePanel, true)
        window.addEventListener('resize', repositionVarValuePanel)
        return () => {
            window.removeEventListener('scroll', repositionVarValuePanel, true)
            window.removeEventListener('resize', repositionVarValuePanel)
        }
    }, [openVarSegIndex, repositionVarValuePanel, value])

    useEffect(() => {
        if (openVarSegIndex == null) return
        const onDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement
            if (t.closest('[data-var-value-panel]')) return
            const anchor = varChipAnchorRefs.current.get(openVarSegIndex)
            if (anchor?.contains(t)) return
            setOpenVarSegIndex(null)
        }
        document.addEventListener('mousedown', onDown, true)
        return () => document.removeEventListener('mousedown', onDown, true)
    }, [openVarSegIndex])

    useEffect(() => {
        if (openVarSegIndex == null) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                setOpenVarSegIndex(null)
            }
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
    }, [openVarSegIndex])

    useEffect(() => {
        if (openVarSegIndex == null) return
        const id = window.setTimeout(() => {
            const inp = varValuePanelRef.current?.querySelector('input')
            if (inp instanceof HTMLInputElement) inp.focus()
        }, 0)
        return () => clearTimeout(id)
    }, [openVarSegIndex])

    const openVarName =
        openVarSegIndex != null && segments[openVarSegIndex]?.type === 'var'
            ? segments[openVarSegIndex].name
            : null

    const cancelHoverClose = () => {
        if (hoverCloseTimerRef.current) {
            clearTimeout(hoverCloseTimerRef.current)
            hoverCloseTimerRef.current = null
        }
    }

    const scheduleHoverClose = () => {
        cancelHoverClose()
        hoverCloseTimerRef.current = setTimeout(() => {
            setOpenVarSegIndex(null)
            hoverCloseTimerRef.current = null
        }, 450)
    }

    useEffect(() => () => cancelHoverClose(), [])

    /** Must track store deps: opening the chip before /environments finishes left the value stuck empty. */
    const storeResolvedVarValue = useMemo((): string | undefined => {
        if (!openVarName) return undefined
        return getActiveEnvVars()[openVarName] ?? ''
    }, [openVarName, environments, activeEnvironmentId, collections, collectionId])

    useEffect(() => {
        if (!openVarName || storeResolvedVarValue === undefined) return
        setEditVarValue(storeResolvedVarValue)
    }, [openVarName, storeResolvedVarValue])

    useEffect(() => {
        if (!varPopover) return
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (!target.closest('[data-var-extract-popover]')) {
                setVarPopover(null)
                setVarName('')
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [varPopover])

    useEffect(() => {
        if (!templateSuggest) return
        const handler = (e: MouseEvent) => {
            const t = e.target as HTMLElement
            if (t.closest('[data-var-template-suggest]')) return
            setTemplateSuggest(null)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [templateSuggest])

    /** Keep popover under the input while scrolling (portal uses viewport coords). */
    useLayoutEffect(() => {
        if (!templateSuggest) return
        const reposition = () => {
            const s = templateSuggestLiveRef.current
            if (!s) return
            const el = rootRef.current?.querySelector<HTMLInputElement>(
                `input[data-template-seg-type="text"][data-template-seg-idx="${s.segIndex}"]`,
            )
            if (!el) return
            const v = el.value
            const caret = el.selectionStart ?? v.length
            if (!v.slice(0, caret).match(INCOMPLETE_TEMPLATE_RE)) {
                setTemplateSuggest(null)
                return
            }
            const rect = el.getBoundingClientRect()
            setTemplateSuggest((prev) =>
                prev ? { ...prev, x: rect.left, y: rect.bottom + 4 } : null,
            )
        }
        window.addEventListener('scroll', reposition, true)
        window.addEventListener('resize', reposition)
        return () => {
            window.removeEventListener('scroll', reposition, true)
            window.removeEventListener('resize', reposition)
        }
    }, [templateSuggest != null])

    useEffect(() => {
        if (!templateSuggest) return
        if (filteredVarSuggestions.length === 0) {
            setSuggestHighlight(0)
            return
        }
        setSuggestHighlight((h) => Math.min(h, filteredVarSuggestions.length - 1))
    }, [templateSuggest, filteredVarSuggestions.length])

    useEffect(() => {
        if (!templateSuggest) return
        const el = suggestRowRef.current.get(suggestHighlight)
        el?.scrollIntoView({ block: 'nearest' })
    }, [suggestHighlight, templateSuggest])

    /** Same frame as commit: beat browser focus restore when extract popover unmounts. */
    useLayoutEffect(() => {
        const p = extractFocusRef.current
        if (!p || !urlMatchesExtractPending(p.url, value)) return
        let cancelled = false
        let tries = 0
        const maxTries = 32

        const tryFocus = () => {
            if (cancelled) return
            if (extractFocusRef.current !== p) return
            if (runPostExtractFocus(value || '', p.varStartFlat, p.varEndFlat)) {
                extractFocusRef.current = null
                return
            }
            tries += 1
            if (tries < maxTries) requestAnimationFrame(tryFocus)
            else extractFocusRef.current = null
        }

        tryFocus()
        return () => {
            cancelled = true
        }
    }, [value, runPostExtractFocus])

    /**
     * Caret ke kanan chip harus jalan **setelah paint** + sisa event pointer dari klik saran.
     * `useLayoutEffect` terlalu awal — ghost click / Popover sempat rebut fokus di frame berikutnya.
     */
    useEffect(() => {
        const p = afterTemplateSuggestCaretRef.current
        if (!p) return
        let cancelled = false
        let rafId = 0
        let tries = 0
        let stableFrames = 0
        const maxTries = 24

        const finish = () => {
            if (afterTemplateSuggestCaretRef.current === p) afterTemplateSuggestCaretRef.current = null
        }

        const hammerFocus = () => {
            if (cancelled || afterTemplateSuggestCaretRef.current !== p) return
            const mapped = flatOffsetToTextCaret(parseUrlSegments(value || ''), p.flatOffset)
            if (!mapped) {
                finish()
                return
            }
            const el = rootRef.current?.querySelector<HTMLInputElement>(
                `input[data-template-seg-type="text"][data-template-seg-idx="${mapped.segIndex}"]`,
            )
            if (el) {
                el.focus({ preventScroll: true })
                el.setSelectionRange(mapped.caret, mapped.caret)
                const pos = el.selectionStart ?? 0
                const end = el.selectionEnd ?? 0
                const caretOk = pos === mapped.caret && end === mapped.caret
                stableFrames =
                    document.activeElement === el && caretOk ? stableFrames + 1 : 0
            } else stableFrames = 0
            tries += 1
            if (stableFrames >= 2 || tries >= maxTries) finish()
            else rafId = requestAnimationFrame(hammerFocus)
        }

        rafId = requestAnimationFrame(() => requestAnimationFrame(hammerFocus))

        return () => {
            cancelled = true
            cancelAnimationFrame(rafId)
        }
    }, [value])

    const textInputIndexToFlatOffset = (inputIndex: number, caret: number): number => {
        let textIdx = 0
        let off = 0
        for (const s of segments) {
            if (s.type === 'text') {
                if (textIdx === inputIndex) return off + Math.min(caret, s.value.length)
                off += s.value.length
                textIdx++
            } else {
                off += `{{${s.name}}}`.length
            }
        }
        return off
    }

    const handleTextMouseUp = (inputIndex: number) => {
        const input = rootRef.current?.querySelector<HTMLInputElement>(
            `[data-seg-text="${scopeId}-${inputIndex}"]`,
        )
        if (!input) return
        const start = input.selectionStart ?? 0
        const end = input.selectionEnd ?? 0
        if (start === end) {
            setVarPopover(null)
            return
        }
        setTemplateSuggest(null)
        const selection = input.value.slice(start, end)
        if (!selection.trim()) return
        const rect = input.getBoundingClientRect()
        setVarPopover({
            x: rect.left + 8,
            y: rect.bottom + 4,
            selection,
            start: textInputIndexToFlatOffset(inputIndex, start),
            end: textInputIndexToFlatOffset(inputIndex, end),
            inputIndex,
        })
        setVarName(selection.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, ''))
        setTimeout(() => varInputRef.current?.focus(), 50)
    }

    const handleExtractVar = async () => {
        if (!varPopover || !varName.trim()) return
        const name = varName.trim()
        const token = `{{${name}}}`
        const newStr = value.slice(0, varPopover.start) + token + value.slice(varPopover.end)
        const selectionSnapshot = varPopover.selection
        const vs = varPopover.start
        const ve = varPopover.start + token.length

        // `varPopover.start` = index of `{{` in the new URL (same as start of replaced range).
        extractFocusRef.current = {
            url: newStr,
            varStartFlat: vs,
            varEndFlat: ve,
        }

        /** Unmounting the extract field otherwise restores focus to the first field (empty slot kiri). */
        varInputRef.current?.blur()
        rootRef.current?.focus({ preventScroll: true })

        flushSync(() => onChange(newStr))

        if (runPostExtractFocus(newStr, vs, ve)) extractFocusRef.current = null

        setVarPopover(null)
        setVarName('')

        if (activeEnvironmentId) {
            const env = environments.find((e) => e.id === activeEnvironmentId)
            if (env) {
                const existing = env.variables ?? []
                if (!existing.find((v) => v.key === name)) {
                    await updateVariables(activeEnvironmentId, [
                        ...existing,
                        { key: name, value: selectionSnapshot, enabled: true },
                    ])
                }
            }
        }
    }

    const handleSaveVarValue = async () => {
        if (!openVarName || !activeEnvironmentId) return
        const env = environments.find((e) => e.id === activeEnvironmentId)
        if (!env) return
        const vars = [...(env.variables ?? [])]
        const i = vars.findIndex((v) => v.key === openVarName)
        if (i >= 0) {
            vars[i] = { ...vars[i], value: editVarValue }
        } else {
            vars.push({ key: openVarName, value: editVarValue, enabled: true })
        }
        await updateVariables(activeEnvironmentId, vars)
        setOpenVarSegIndex(null)
    }

    let textInputCounter = 0

    const sourceLabel = (key: string) => {
        const src = getVariableSource(key, variableSuggestionScope)
        if (src === 'environment') return t('vars.sourceEnvironment')
        if (src === 'folder') return t('vars.sourceFolder')
        if (src === 'collection') return t('vars.sourceCollection')
        return t('vars.sourceUnresolved')
    }

    const openVarPanel = (i: number) => {
        cancelHoverClose()
        setOpenVarSegIndex(i)
    }

    const varPanelSeg =
        openVarSegIndex != null && segments[openVarSegIndex]?.type === 'var'
            ? (segments[openVarSegIndex] as Extract<UrlSegment, { type: 'var' }>)
            : null
    const varPanelSrc = varPanelSeg ? getVariableSource(varPanelSeg.name, variableSuggestionScope) : null
    const varPanelResolved = varPanelSrc != null && varPanelSrc !== 'none'

    return (
        <>
            <div
                ref={rootRef}
                tabIndex={-1}
                data-active-collection={collectionId ?? ''}
                className={cn(
                    'flex min-w-0 items-center gap-0 outline-none focus:outline-none',
                    wrap
                        ? 'flex-wrap'
                        : 'h-full max-h-9 flex-nowrap overflow-x-auto overflow-y-hidden',
                    className,
                )}
                onBlur={(e) => {
                    if (!onBlur) return
                    const next = e.relatedTarget as Node | null
                    if (rootRef.current?.contains(next)) return
                    onBlur()
                }}
            >
                {segments.map((seg, i) => {
                    if (seg.type === 'var') {
                        const varSrc = getVariableSource(seg.name, variableSuggestionScope)
                        const resolved = varSrc !== 'none'
                        return (
                            <div
                                key={`var-seg-${i}`}
                                ref={(el) => {
                                    if (el) varChipAnchorRefs.current.set(i, el)
                                    else varChipAnchorRefs.current.delete(i)
                                }}
                                className={cn(
                                    'inline-flex max-w-[min(100%,220px)] shrink-0 self-center items-center overflow-hidden rounded px-0.5 py-px font-mono text-xs leading-none outline-none focus-within:ring-1',
                                    resolved
                                        ? 'border border-dashed border-[color-mix(in_srgb,var(--dracula-orange)_55%,transparent)] bg-[color-mix(in_srgb,#ffb86c_14%,#282a36)] focus-within:ring-[var(--dracula-orange)]/25'
                                        : 'border border-dashed border-[color-mix(in_srgb,var(--dracula-red)_70%,transparent)] bg-[color-mix(in_srgb,#ff5555_16%,#282a36)] focus-within:ring-[var(--dracula-red)]/30',
                                )}
                                onPointerDownCapture={(e) => {
                                    if (performance.now() < blockVarChipHoverOpenUntilRef.current) {
                                        e.preventDefault()
                                        e.stopPropagation()
                                    }
                                }}
                                onMouseEnter={() => {
                                    if (performance.now() < blockVarChipHoverOpenUntilRef.current) return
                                    openVarPanel(i)
                                }}
                                onMouseLeave={(e) => {
                                    const rel = e.relatedTarget as HTMLElement | null
                                    if (rel?.closest('[data-var-value-panel]')) return
                                    scheduleHoverClose()
                                }}
                            >
                                <div className="inline-flex min-w-0 flex-1 items-center">
                                    <span
                                        className={cn(
                                            'pointer-events-none select-none',
                                            resolved
                                                ? 'text-[color-mix(in_srgb,var(--dracula-orange)_88%,white)]'
                                                : 'text-[color-mix(in_srgb,var(--dracula-pink)_92%,white)]',
                                        )}
                                    >
                                        {'{{'}
                                    </span>
                                    <input
                                        ref={(el) => setSegEl(i, el)}
                                        type="text"
                                        value={seg.name}
                                        aria-label="Variable name"
                                        aria-invalid={!resolved}
                                        onChange={(e) => {
                                            const v = e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '')
                                            setFromSegments(updateVarSegmentName(segments, i, v))
                                        }}
                                        onKeyDown={(e) => {
                                            const el = e.currentTarget
                                            const pos = el.selectionStart ?? 0
                                            const end = el.selectionEnd ?? 0
                                            if (e.key === 'ArrowLeft' && pos === end && pos === 0) {
                                                e.preventDefault()
                                                focusAdjacentSegment(i, -1)
                                            }
                                            if (e.key === 'ArrowRight' && pos === end && pos === seg.name.length) {
                                                e.preventDefault()
                                                focusAdjacentSegment(i, 1)
                                            }
                                        }}
                                        className={cn(
                                            'min-w-0 max-w-[140px] shrink-0 grow-0 bg-transparent px-0 py-0 text-xs leading-none outline-none focus:ring-0',
                                            resolved
                                                ? 'text-[color-mix(in_srgb,var(--dracula-orange)_88%,white)]'
                                                : 'text-[color-mix(in_srgb,var(--dracula-pink)_92%,white)]',
                                        )}
                                        size={1}
                                        style={{
                                            width: `${Math.max(1.5, seg.name.length + 0.35)}ch`,
                                            maxWidth: `${Math.max(1.5, seg.name.length + 0.35)}ch`,
                                            minWidth: 0,
                                        }}
                                        spellCheck={false}
                                    />
                                    <span
                                        className={cn(
                                            'pointer-events-none select-none',
                                            resolved
                                                ? 'text-[color-mix(in_srgb,var(--dracula-orange)_88%,white)]'
                                                : 'text-[color-mix(in_srgb,var(--dracula-pink)_92%,white)]',
                                        )}
                                    >
                                        {'}}'}
                                    </span>
                                </div>
                            </div>
                        )
                    }

                    const ti = textInputCounter++
                    const plainUrlOnly = segments.length === 1 && segments[0].type === 'text'
                    const tailEmptyAfterVar =
                        i === lastTextIndex &&
                        seg.value === '' &&
                        segments[i - 1]?.type === 'var' &&
                        segments.length > 1
                    /** Postman-like: jangan rebut fokus Tab untuk slot kosong sebelum chip pertama. */
                    const skipTabLeadingEmpty =
                        i === 0 &&
                        seg.value === '' &&
                        segments.length > 1 &&
                        segments[1]?.type === 'var'
                    /** URL bar (no wrap): last text segment fills remaining row width; KV cells keep ch width unless single text only. */
                    const growFill =
                        i === lastTextIndex &&
                        seg.type === 'text' &&
                        !skipTabLeadingEmpty &&
                        (plainUrlOnly || !wrap)
                    const emptySlot = seg.value.length === 0 && !growFill && !tailEmptyAfterVar
                    // Tight ch width + monospace: proportional fonts make `ch` wider than URL chars → fake “gap” before next chip.
                    const charCh = Math.max(1.25, seg.value.length + 0.25)
                    const textW =
                        growFill || tailEmptyAfterVar
                            ? undefined
                            : emptySlot
                              ? '6px'
                              : `${charCh}ch`

                    return (
                        <input
                            ref={(el) => setSegEl(i, el)}
                            key={`url-t-${i}`}
                            data-seg-text={`${scopeId}-${ti}`}
                            data-template-seg-type="text"
                            data-template-seg-idx={i}
                            tabIndex={skipTabLeadingEmpty ? -1 : undefined}
                            type="text"
                            value={seg.value}
                            onChange={(e) => {
                                const prevUrl = segmentsToUrl(segments)
                                const next = updateTextSegment(segments, i, e.target.value)
                                const nextUrl = segmentsToUrl(next)
                                if (countClosedVarTokens(nextUrl) > countClosedVarTokens(prevUrl)) {
                                    const caret = e.target.selectionStart ?? e.target.value.length
                                    afterTemplateSuggestCaretRef.current = {
                                        flatOffset: flatOffsetAtSegmentStart(segments, i) + caret,
                                    }
                                    blockVarChipHoverOpenUntilRef.current = performance.now() + 600
                                    setOpenVarSegIndex(null)
                                }
                                setFromSegments(next)
                                syncTemplateSuggestFromInput(e.currentTarget, i)
                            }}
                            onSelect={(e) =>
                                syncTemplateSuggestFromInput(e.currentTarget as HTMLInputElement, i)
                            }
                            onFocus={(e) => syncTemplateSuggestFromInput(e.currentTarget, i)}
                            onMouseUp={() => handleTextMouseUp(ti)}
                            onKeyDown={(e) => {
                                if (templateSuggest?.segIndex === i) {
                                    const n = filteredVarSuggestions.length
                                    if (e.key === 'Escape') {
                                        e.preventDefault()
                                        setTemplateSuggest(null)
                                        return
                                    }
                                    if (n > 0) {
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault()
                                            setSuggestHighlight((h) => (h + 1) % n)
                                            return
                                        }
                                        if (e.key === 'ArrowUp') {
                                            e.preventDefault()
                                            setSuggestHighlight((h) => (h - 1 + n) % n)
                                            return
                                        }
                                        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                                            e.preventDefault()
                                            const pick = filteredVarSuggestions[suggestHighlight]
                                            if (pick) applyTemplateSuggestion(pick.key)
                                            return
                                        }
                                    }
                                    if (e.key === 'Tab') setTemplateSuggest(null)
                                }
                                if (onMetaEnter && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                    if (!metaEnterDisabled) onMetaEnter()
                                }
                                const el = e.currentTarget
                                const pos = el.selectionStart ?? 0
                                const end = el.selectionEnd ?? 0
                                const collapsed = pos === end

                                if (
                                    collapsed &&
                                    e.key === 'Backspace' &&
                                    pos === 0 &&
                                    i > 0 &&
                                    segments[i - 1]?.type === 'var'
                                ) {
                                    e.preventDefault()
                                    const varIndex = i - 1
                                    const prevSeg = segments[varIndex - 1]
                                    const leftLen =
                                        prevSeg?.type === 'text' ? prevSeg.value.length : 0
                                    const startIdx =
                                        prevSeg?.type === 'text' ? varIndex - 1 : varIndex
                                    const nextSegs = removeVarSegment(segments, varIndex)
                                    flushSync(() => setFromSegments(nextSegs))
                                    const focusEl = segElRef.current.get(startIdx)
                                    if (focusEl instanceof HTMLInputElement) {
                                        focusEl.focus()
                                        focusEl.setSelectionRange(leftLen, leftLen)
                                    }
                                    return
                                }

                                if (
                                    collapsed &&
                                    e.key === 'Delete' &&
                                    pos === seg.value.length &&
                                    segments[i + 1]?.type === 'var'
                                ) {
                                    e.preventDefault()
                                    const varIndex = i + 1
                                    const caret = seg.value.length
                                    const startIdx = i
                                    const nextSegs = removeVarSegment(segments, varIndex)
                                    flushSync(() => setFromSegments(nextSegs))
                                    const focusEl = segElRef.current.get(startIdx)
                                    if (focusEl instanceof HTMLInputElement) {
                                        focusEl.focus()
                                        focusEl.setSelectionRange(caret, caret)
                                    }
                                    return
                                }

                                if (e.key === 'ArrowRight' && pos === end && pos === seg.value.length) {
                                    e.preventDefault()
                                    focusAdjacentSegment(i, 1)
                                }
                                if (e.key === 'ArrowLeft' && pos === end && pos === 0) {
                                    e.preventDefault()
                                    focusAdjacentSegment(i, -1)
                                }
                                inputOnKeyDown?.(e)
                            }}
                            className={cn(
                                'box-border self-center bg-transparent py-0 pl-0 pr-0 font-mono text-xs leading-none text-foreground caret-foreground outline-none focus:ring-0',
                                !wrap && 'min-h-0',
                                wrap && 'min-h-6 py-0.5',
                                growFill && 'min-w-[72px] flex-1 basis-0',
                                tailEmptyAfterVar &&
                                    'min-w-[2rem] flex-1 basis-0 !max-w-none shrink grow',
                                !growFill &&
                                    !tailEmptyAfterVar &&
                                    'min-w-0 max-w-none shrink-0 grow-0 basis-auto',
                                emptySlot && 'w-[6px] min-w-[6px] max-w-[6px]',
                                inputClassName,
                            )}
                            style={
                                growFill || tailEmptyAfterVar
                                    ? tailEmptyAfterVar
                                        ? { minWidth: '2rem', width: undefined, maxWidth: 'none' }
                                        : undefined
                                    : { width: textW, maxWidth: textW, minWidth: 0 }
                            }
                            title={emptySlot ? t('vars.emptySlotTitle') : undefined}
                        />
                    )
                })}
            </div>

            {varPanelSeg &&
                varPanelPos &&
                createPortal(
                    <div
                        ref={varValuePanelRef}
                        data-var-value-panel
                        role="dialog"
                        aria-label={t('vars.value')}
                        className="fixed z-[200] flex w-72 max-w-[calc(100vw-1rem)] flex-col gap-2 rounded-md border border-border bg-popover p-3 shadow-md"
                        style={{ left: varPanelPos.x, top: varPanelPos.y }}
                        onMouseEnter={cancelHoverClose}
                        onMouseLeave={scheduleHoverClose}
                    >
                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-medium text-muted-foreground">
                                <span
                                    className={cn(
                                        'mr-1 inline-flex size-4 items-center justify-center rounded text-[10px] font-bold',
                                        varPanelResolved
                                            ? varPanelSrc === 'environment'
                                                ? 'bg-[var(--dracula-green)]/25 text-[var(--dracula-green)]'
                                                : 'bg-[var(--dracula-cyan)]/25 text-[var(--dracula-cyan)]'
                                            : 'bg-[var(--dracula-red)]/25 text-[var(--dracula-red)]',
                                    )}
                                >
                                    {varPanelResolved ? (varPanelSrc === 'environment' ? 'E' : 'C') : '!'}
                                </span>
                                {sourceLabel(varPanelSeg.name)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{t('vars.editChipHint')}</p>
                            <p className="text-[11px] text-muted-foreground">{t('vars.value')}</p>
                            <Input
                                value={editVarValue}
                                onChange={(e) => setEditVarValue(e.target.value)}
                                className="font-mono text-xs placeholder:text-xs"
                                placeholder={t('vars.value')}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleSaveVarValue()
                                }}
                            />
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setOpenVarSegIndex(null)}
                                >
                                    {t('common.close')}
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={!activeEnvironmentId}
                                    onClick={() => void handleSaveVarValue()}
                                >
                                    {t('vars.saveToEnvironment')}
                                </Button>
                            </div>
                            {!activeEnvironmentId && (
                                <p className="text-[11px] text-muted-foreground">{t('vars.selectEnvHint')}</p>
                            )}
                        </div>
                    </div>,
                    document.body,
                )}

            {templateSuggest &&
                createPortal(
                    <div
                        data-var-template-suggest
                        role="listbox"
                        className="fixed z-[100] flex max-h-48 min-w-[220px] max-w-sm flex-col overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
                        style={{ left: templateSuggest.x, top: templateSuggest.y }}
                    >
                        <div className="border-b border-border px-2 py-1">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                {t('vars.suggestTitle')}
                            </p>
                        </div>
                        <div className="max-h-36 overflow-y-auto py-0.5">
                            {filteredVarSuggestions.length === 0 ? (
                                <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('vars.suggestEmpty')}</p>
                            ) : (
                                filteredVarSuggestions.map((s, idx) => (
                                    <button
                                        key={s.key}
                                        type="button"
                                        role="option"
                                        aria-selected={idx === suggestHighlight}
                                        ref={(el) => {
                                            if (el) suggestRowRef.current.set(idx, el)
                                            else suggestRowRef.current.delete(idx)
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent',
                                            idx === suggestHighlight && 'bg-accent',
                                        )}
                                        onMouseDown={(ev) => ev.preventDefault()}
                                        onMouseEnter={() => setSuggestHighlight(idx)}
                                        onClick={() => applyTemplateSuggestion(s.key)}
                                    >
                                        <span className="truncate font-mono text-foreground">{s.key}</span>
                                        <span className="shrink-0 text-[10px] text-muted-foreground">
                                            {sourceLabel(s.key)}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>,
                    document.body,
                )}

            {varPopover &&
                createPortal(
                    <div
                        data-var-extract-popover
                        className="fixed z-[100] flex min-w-[240px] flex-col gap-2 rounded-md border border-border bg-popover p-3 shadow-md"
                        style={{ left: varPopover.x, top: varPopover.y }}
                    >
                        <p className="text-xs font-medium text-muted-foreground">
                            {t('vars.extractLead')}{' '}
                            <code className="rounded bg-muted px-1 text-xs">{varPopover.selection}</code>{' '}
                            {t('vars.extractTrail')}
                        </p>
                        <div className="flex gap-2">
                            <span className="self-center text-sm text-muted-foreground">{'{{'}</span>
                            <input
                                ref={varInputRef}
                                type="text"
                                value={varName}
                                onChange={(e) => setVarName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleExtractVar()
                                    if (e.key === 'Escape') {
                                        setVarPopover(null)
                                        setVarName('')
                                    }
                                }}
                                placeholder={t('vars.variableNamePlaceholder')}
                                className="h-7 flex-1 rounded border border-input bg-background px-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <span className="self-center text-sm text-muted-foreground">{'}}'}</span>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setVarPopover(null)
                                    setVarName('')
                                }}
                                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleExtractVar()}
                                disabled={!varName.trim()}
                                className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                            >
                                {activeEnvironmentId ? t('vars.extractWithEnv') : t('vars.extract')}
                            </button>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    )
}

export default memo(VarTemplateField)
