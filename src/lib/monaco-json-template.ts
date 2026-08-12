import type * as Monaco from 'monaco-editor'
import i18n from '@/i18n/config'
import { writeEnvironmentPatch } from '@/lib/local-replica/local-write'
import { useAppStore } from '../store'
import {
    getActiveEnvVars,
    getVariableSource,
    listTemplateVariableSuggestions,
    templateVariablesFingerprint,
    type VariableSuggestionScope,
} from './env-resolver'

const HOVER_DEBOUNCE_MS = 280
const HOVER_CLOSE_MARGIN = 24
const VAR_PANEL_HOST_ID = 'zreq-var-panel-host'

export function ensureVarPanelHost(): HTMLElement {
    let el = document.getElementById(VAR_PANEL_HOST_ID)
    if (!el) {
        el = document.createElement('div')
        el.id = VAR_PANEL_HOST_ID
        el.setAttribute('aria-hidden', 'true')
        Object.assign(el.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '0',
            height: '0',
            margin: '0',
            padding: '0',
            border: 'none',
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: '99999',
        })
        document.body.appendChild(el)
    }
    return el
}

async function upsertActiveEnvironmentVariable(varKey: string, value: string): Promise<boolean> {
    const s = useAppStore.getState()
    const id = s.activeEnvironmentId
    if (id == null) return false
    const env = s.environments.find((e) => e.id === id)
    if (!env) return false
    const vars = [...(env.variables ?? [])]
    const i = vars.findIndex((v) => v.key === varKey)
    if (i >= 0) vars[i] = { ...vars[i]!, value }
    else vars.push({ key: varKey, value, enabled: true })
    s.updateEnvironment(id, { variables: vars })
    try {
        await writeEnvironmentPatch(id, { variables: vars })
        return true
    } catch {
        return false
    }
}

function openEnvironmentSelector(): void {
    document.querySelector<HTMLElement>('[data-zreq-focus="environment-selector"]')?.click()
}

function createScopeBadge(src: 'environment' | 'folder' | 'collection'): HTMLSpanElement {
    const badge = document.createElement('span')
    const env = src === 'environment'
    badge.textContent = env ? 'E' : 'C'
    badge.className = env
        ? 'monaco-json-var-scope-badge monaco-json-var-scope-badge--env'
        : 'monaco-json-var-scope-badge monaco-json-var-scope-badge--coll'
    return badge
}

function createVarsLink(closeTip: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'monaco-json-var-link'
    btn.textContent = i18n.t('vars.jsonBodyVariablesLink')
    btn.onclick = () => {
        closeTip()
        openEnvironmentSelector()
    }
    return btn
}

function createScopeFooter(
    src: 'environment' | 'folder' | 'collection',
    closeTip: () => void,
): HTMLDivElement {
    const foot = document.createElement('div')
    foot.className = 'monaco-json-var-panel-foot'
    const scope = document.createElement('div')
    scope.className = 'monaco-json-var-panel-scope'
    const label = document.createElement('span')
    label.textContent = variableSourceI18n(src)
    scope.append(createScopeBadge(src), label)
    foot.append(scope, createVarsLink(closeTip))
    return foot
}

function createAddToRow(closeTip: () => void): {
    row: HTMLDivElement
    syncTarget: () => void
} {
    const row = document.createElement('div')
    row.className = 'monaco-json-var-add-row'
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'monaco-json-var-add-btn'
    const varsLink = createVarsLink(closeTip)
    const syncTarget = () => {
        const s = useAppStore.getState()
        const env = s.environments.find((e) => e.id === s.activeEnvironmentId)
        addBtn.replaceChildren()
        addBtn.append(
            document.createTextNode(`${i18n.t('vars.addTo')} `),
            Object.assign(document.createElement('span'), {
                className: 'monaco-json-var-add-btn-target',
                textContent: env?.name ?? i18n.t('envSelector.noEnvironment'),
            }),
            Object.assign(document.createElement('span'), {
                className: 'monaco-json-var-add-btn-chevron',
                textContent: '▾',
                ariaHidden: 'true',
            }),
        )
    }
    addBtn.onclick = () => {
        closeTip()
        openEnvironmentSelector()
    }
    syncTarget()
    row.append(addBtn, varsLink)
    return { row, syncTarget }
}

function createSwitchFooter(closeTip: () => void): HTMLDivElement {
    const foot = document.createElement('div')
    foot.className = 'monaco-json-var-switch-foot'
    foot.append(document.createTextNode(`${i18n.t('vars.switchEnvPrompt')} `))
    const link = document.createElement('button')
    link.type = 'button'
    link.textContent = i18n.t('vars.jsonBodySwitchEnvironment')
    link.onclick = () => {
        closeTip()
        openEnvironmentSelector()
    }
    foot.append(link)
    return foot
}

function wireValueInput(
    input: HTMLInputElement,
    panel: HTMLElement,
    key: string,
    closeTip: () => void,
    opts?: { closeOnSave?: boolean },
): void {
    const initial = input.value
    const isMissing = opts?.closeOnSave === true

    const save = async (closeAfter = false) => {
        if (useAppStore.getState().activeEnvironmentId == null) return
        const value = input.value
        if (isMissing && !value.trim()) return
        if (!isMissing && value === initial) {
            if (closeAfter) closeTip()
            return
        }
        const ok = await upsertActiveEnvironmentVariable(key, value)
        if (ok && (isMissing || closeAfter)) closeTip()
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            void save(true)
        }
    })

    if (!isMissing) {
        input.addEventListener('blur', (e) => {
            const related = e.relatedTarget as Node | null
            if (related && panel.contains(related)) return
            void save(false)
        })
    }

    panel.addEventListener('mousedown', (e) => {
        const t = e.target as HTMLElement
        if (t.closest('button') && !t.closest('input')) e.preventDefault()
    })
}

function variableSourceI18n(src: 'environment' | 'folder' | 'collection' | 'none'): string {
    if (src === 'environment') return i18n.t('vars.sourceEnvironment')
    if (src === 'folder') return i18n.t('vars.sourceFolder')
    if (src === 'collection') return i18n.t('vars.sourceCollection')
    return i18n.t('vars.sourceUnresolved')
}

export type TemplateVarHit = { from: number; to: number; key: string }

export function findCompleteTemplateVarAt(text: string, offset: number): TemplateVarHit | null {
    const lines = text.split('\n')
    let lineStart = 0
    for (const line of lines) {
        const lineEnd = lineStart + line.length
        const re = /\{\{([\w.-]+)\}\}/g
        let m: RegExpExecArray | null
        while ((m = re.exec(line)) !== null) {
            const from = lineStart + m.index
            const to = from + m[0].length
            if (offset >= from && offset < to) {
                return { from, to, key: (m[1] ?? '').trim() }
            }
        }
        lineStart = lineEnd + 1
    }
    return null
}

function isClientPointOverHit(
    editor: Monaco.editor.IStandaloneCodeEditor,
    x: number,
    y: number,
    hit: TemplateVarHit,
): boolean {
    const model = editor.getModel()
    if (!model) return false
    const start = model.getPositionAt(hit.from)
    const end = model.getPositionAt(hit.to)
    const startPx = editor.getScrolledVisiblePosition(start)
    const endPx = editor.getScrolledVisiblePosition(end)
    if (!startPx || !endPx) return false
    const editorDom = editor.getDomNode()
    if (!editorDom) return false
    const editorRect = editorDom.getBoundingClientRect()
    const left = editorRect.left + startPx.left
    const right = editorRect.left + endPx.left
    const top = editorRect.top + startPx.top
    const bottom = top + Math.max(startPx.height, endPx.height)
    const pad = 2
    return x >= left - pad && x <= right + pad && y >= top - pad && y <= bottom + pad
}

function buildTemplateVarDecorations(
    model: Monaco.editor.ITextModel,
    monaco: typeof import('monaco-editor'),
    scope?: VariableSuggestionScope,
) {
    const text = model.getValue()
    const decorations: Monaco.editor.IModelDeltaDecoration[] = []
    const re = /\{\{([\w.-]+)\}\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
        const from = m.index
        const to = from + m[0].length
        const key = (m[1] ?? '').trim()
        const missing = getVariableSource(key, scope) === 'none'
        const start = model.getPositionAt(from)
        const end = model.getPositionAt(to)
        decorations.push({
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            options: {
                inlineClassName: missing
                    ? 'monaco-json-template-badge monaco-json-template-badge--missing'
                    : 'monaco-json-template-badge',
            },
        })
    }
    return decorations
}

class TemplateVarHoverPanel {
    private panel: HTMLDivElement | null = null
    private unsub: (() => void) | undefined
    private currentKey: string | null = null

    constructor(
        private readonly editor: Monaco.editor.IStandaloneCodeEditor,
        private readonly scope?: VariableSuggestionScope,
    ) {}

    show(hit: TemplateVarHit): void {
        if (this.currentKey === hit.key && this.panel) {
            this.position(hit)
            return
        }
        this.hide()
        this.currentKey = hit.key
        const key = hit.key
        const src = getVariableSource(key, this.scope)
        const wrap = document.createElement('div')
        wrap.className = 'monaco-json-template-var-panel'
        wrap.setAttribute('data-var-value-panel', 'true')

        if (src !== 'none') {
            this.buildResolvedPanel(wrap, key, hit)
        } else {
            this.buildMissingPanel(wrap, key, hit)
        }

        const host = ensureVarPanelHost()
        host.appendChild(wrap)
        this.panel = wrap
        this.position(hit)
    }

    private position(hit: TemplateVarHit): void {
        if (!this.panel) return
        const model = this.editor.getModel()
        if (!model) return
        const start = model.getPositionAt(hit.from)
        const end = model.getPositionAt(hit.to)
        const startCoords = this.editor.getScrolledVisiblePosition(start)
        const endCoords = this.editor.getScrolledVisiblePosition(end)
        if (!startCoords) return
        const editorDom = this.editor.getDomNode()
        if (!editorDom) return
        const editorRect = editorDom.getBoundingClientRect()
        const anchorTop = endCoords?.top ?? startCoords.top
        const anchorHeight = endCoords?.height ?? startCoords.height
        const left = editorRect.left + Math.min(startCoords.left, endCoords?.left ?? startCoords.left)
        let top = editorRect.top + anchorTop + anchorHeight + 4

        this.panel.style.position = 'fixed'
        this.panel.style.left = `${left}px`
        this.panel.style.top = `${top}px`

        const panelH = this.panel.offsetHeight
        const viewportH = window.innerHeight
        if (top + panelH > viewportH - 8) {
            top = editorRect.top + startCoords.top - panelH - 4
            this.panel.style.top = `${Math.max(8, top)}px`
        }
        const panelW = this.panel.offsetWidth
        const maxLeft = window.innerWidth - panelW - 8
        if (left > maxLeft) this.panel.style.left = `${Math.max(8, maxLeft)}px`
    }

    private buildResolvedPanel(wrap: HTMLDivElement, key: string, hit: TemplateVarHit): void {
        const closeTip = () => this.hide()
        const src = getVariableSource(key, this.scope)
        const body = document.createElement('div')
        body.className = 'monaco-json-var-panel-body'

        const valueBox = document.createElement('div')
        valueBox.className = 'monaco-json-var-value-box'
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'monaco-json-var-value-input'
        input.autocomplete = 'off'
        input.spellcheck = false
        const syncValueFromStore = () => {
            if (document.activeElement === input) return
            input.value = getActiveEnvVars()[key] ?? ''
        }
        syncValueFromStore()
        valueBox.append(input)

        const applyNoEnvUi = () => {
            input.disabled = useAppStore.getState().activeEnvironmentId == null
        }
        applyNoEnvUi()
        wireValueInput(input, wrap, key, closeTip)

        body.append(valueBox)
        wrap.append(body)

        if (src !== 'none') {
            wrap.append(createScopeFooter(src, closeTip))
        }

        this.unsub = useAppStore.subscribe(() => {
            syncValueFromStore()
            applyNoEnvUi()
        })

        wrap.addEventListener('mouseenter', () => {
            this.panelHovered = true
        })
        wrap.addEventListener('mouseleave', () => {
            this.panelHovered = false
        })

        this.lastHit = hit
    }

    private buildMissingPanel(wrap: HTMLDivElement, key: string, hit: TemplateVarHit): void {
        const closeTip = () => this.hide()
        const body = document.createElement('div')
        body.className = 'monaco-json-var-panel-body'

        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'monaco-json-var-value-input'
        input.placeholder = i18n.t('vars.enterValue')
        input.autocomplete = 'off'
        input.spellcheck = false
        input.value = getActiveEnvVars()[key] ?? ''

        const { row: addRow, syncTarget } = createAddToRow(closeTip)

        const applyNoEnvUi = () => {
            input.disabled = useAppStore.getState().activeEnvironmentId == null
        }
        applyNoEnvUi()
        wireValueInput(input, wrap, key, closeTip, { closeOnSave: true })

        body.append(input, addRow)
        wrap.append(body, createSwitchFooter(closeTip))

        this.unsub = useAppStore.subscribe(() => {
            syncTarget()
            applyNoEnvUi()
        })

        requestAnimationFrame(() => {
            if (document.contains(input) && !input.disabled) input.focus({ preventScroll: true })
        })

        wrap.addEventListener('mouseenter', () => {
            this.panelHovered = true
        })
        wrap.addEventListener('mouseleave', () => {
            this.panelHovered = false
        })

        this.lastHit = hit
    }

    panelHovered = false
    lastHit: TemplateVarHit | null = null

    hide(): void {
        this.unsub?.()
        this.unsub = undefined
        this.panel?.remove()
        this.panel = null
        this.currentKey = null
        this.lastHit = null
        this.panelHovered = false
    }

    getDom(): HTMLDivElement | null {
        return this.panel
    }

    isHovered(): boolean {
        return this.panelHovered
    }
}

/** Attach {{var}} chips, autocomplete, and hover edit panel to a JSON body Monaco editor. */
export function attachJsonTemplateFeatures(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
    scope?: VariableSuggestionScope,
): () => void {
    let decorationIds: string[] = []
    let commentDecorationIds: string[] = []
    let timer = -1
    let lastMove = { x: -1, y: -1, time: 0 }
    let openedAt = 0
    const hoverPanel = new TemplateVarHoverPanel(editor, scope)

    const refreshDecorations = () => {
        const model = editor.getModel()
        if (!model) return
        decorationIds = editor.deltaDecorations(
            decorationIds,
            buildTemplateVarDecorations(model, monaco, scope),
        )
    }

    const resolveHit = (x: number, y: number): TemplateVarHit | null => {
        const topEl = document.elementFromPoint(x, y)
        const badge = topEl?.closest?.('.monaco-json-template-badge') as HTMLElement | null
        if (badge && editor.getDomNode()?.contains(badge)) {
            const rect = badge.getBoundingClientRect()
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                const model = editor.getModel()
                if (model) {
                    const text = model.getValue()
                    const re = /\{\{([\w.-]+)\}\}/g
                    let m: RegExpExecArray | null
                    while ((m = re.exec(text)) !== null) {
                        const key = (m[1] ?? '').trim()
                        if (badge.textContent?.includes(key)) {
                            const hit = { from: m.index, to: m.index + m[0].length, key }
                            if (isClientPointOverHit(editor, x, y, hit)) return hit
                        }
                    }
                }
            }
        }
        const target = editor.getTargetAtClientPoint(x, y)
        if (!target?.position) return null
        const model = editor.getModel()
        if (!model) return null
        const offset = model.getOffsetAt(target.position)
        const hit = findCompleteTemplateVarAt(model.getValue(), offset)
        if (!hit) return null
        if (!isClientPointOverHit(editor, x, y, hit)) return null
        return hit
    }

    const isNearActive = (x: number, y: number): boolean => {
        if (hoverPanel.isHovered()) return true
        const panel = hoverPanel.getDom()
        if (panel) {
            const r = panel.getBoundingClientRect()
            if (
                x >= r.left - HOVER_CLOSE_MARGIN &&
                x <= r.right + HOVER_CLOSE_MARGIN &&
                y >= r.top - HOVER_CLOSE_MARGIN &&
                y <= r.bottom + HOVER_CLOSE_MARGIN
            ) {
                return true
            }
        }
        const hit = resolveHit(x, y)
        if (hit) return true
        return false
    }

    const tryOpen = () => {
        timer = -1
        if (hoverPanel.getDom()) return
        const elapsed = Date.now() - lastMove.time
        if (elapsed < HOVER_DEBOUNCE_MS) {
            timer = window.setTimeout(tryOpen, HOVER_DEBOUNCE_MS - elapsed)
            return
        }
        const hit = resolveHit(lastMove.x, lastMove.y)
        if (!hit) return
        openedAt = Date.now()
        hoverPanel.show(hit)
    }

    const onMouseMove = (e: MouseEvent) => {
        lastMove = { x: e.clientX, y: e.clientY, time: Date.now() }
        if (!hoverPanel.getDom() && timer < 0) timer = window.setTimeout(tryOpen, HOVER_DEBOUNCE_MS)
        if (hoverPanel.getDom()) {
            if (Date.now() - openedAt < 120) return
            if (!isNearActive(e.clientX, e.clientY)) hoverPanel.hide()
            else if (hoverPanel.lastHit) hoverPanel.show(hoverPanel.lastHit)
        }
    }

    const onMouseLeave = (e: MouseEvent) => {
        if (!hoverPanel.getDom()) return
        if (Date.now() - openedAt < 120) return
        const related = e.relatedTarget as Node | null
        if (related && hoverPanel.getDom()?.contains(related)) return
        if (!isNearActive(e.clientX, e.clientY)) hoverPanel.hide()
    }

    const domNode = editor.getDomNode()
    domNode?.addEventListener('mousemove', onMouseMove)
    domNode?.addEventListener('mouseleave', onMouseLeave)

    const completionDisposable = monaco.languages.registerCompletionItemProvider('json', {
        triggerCharacters: ['{'],
        provideCompletionItems(
            model: Monaco.editor.ITextModel,
            position: Monaco.Position,
        ) {
            const line = model.getLineContent(position.lineNumber)
            const before = line.slice(0, position.column - 1)
            const m = before.match(/\{\{([\w.-]*)$/)
            if (!m) return { suggestions: [] }
            const filter = (m[1] ?? '').toLowerCase()
            const all = listTemplateVariableSuggestions(scope)
            const filtered = filter === '' ? all : all.filter((s) => s.key.toLowerCase().startsWith(filter))
            const replaceStart = position.column - (m[0]?.length ?? 0)
            return {
                suggestions: filtered.map((s) => ({
                    label: s.key,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    detail: s.source,
                    insertText: `{{${s.key}}}`,
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: replaceStart,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                    },
                })),
            }
        },
    })

    const onContentChange = editor.onDidChangeModelContent(() => {
        refreshDecorations()
    })

    const onScroll = editor.onDidScrollChange(() => {
        if (hoverPanel.lastHit) hoverPanel.show(hoverPanel.lastHit)
    })

    let lastFp = templateVariablesFingerprint(scope)
    const unsubStore = useAppStore.subscribe(() => {
        const fp = templateVariablesFingerprint(scope)
        if (fp === lastFp) return
        lastFp = fp
        refreshDecorations()
    })

    refreshDecorations()

    return () => {
        clearTimeout(timer)
        domNode?.removeEventListener('mousemove', onMouseMove)
        domNode?.removeEventListener('mouseleave', onMouseLeave)
        completionDisposable.dispose()
        onContentChange.dispose()
        onScroll.dispose()
        unsubStore()
        hoverPanel.hide()
        editor.deltaDecorations(decorationIds, [])
        editor.deltaDecorations(commentDecorationIds, [])
    }
}
