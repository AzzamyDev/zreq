import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Extension, Text } from '@codemirror/state'
import {
    closeHoverTooltips,
    Decoration,
    hoverTooltip,
    MatchDecorator,
    ViewPlugin,
    type DecorationSet,
    type EditorView,
    type ViewUpdate,
} from '@codemirror/view'

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

/** Cursor after opening double-brace with optional partial name before end of line (no closing yet). */
const INCOMPLETE_TEMPLATE_RE = /\{\{([\w.-]*)$/

function templateCompletionSource(scope?: VariableSuggestionScope) {
    return (context: CompletionContext): CompletionResult | null => {
        const line = context.state.doc.lineAt(context.pos)
        const before = line.text.slice(0, context.pos - line.from)
        const m = before.match(INCOMPLETE_TEMPLATE_RE)
        if (!m) return null

        const matched = m[0] ?? ''
        const from = context.pos - matched.length
        const filter = (m[1] ?? '').toLowerCase()
        const all = listTemplateVariableSuggestions(scope)
        const filtered =
            filter === '' ? all : all.filter((s) => s.key.toLowerCase().startsWith(filter))

        if (filtered.length === 0) return null

        return {
            from,
            to: context.pos,
            filter: false,
            options: filtered.map((s) => ({
                label: s.key,
                type: 'variable' as const,
                detail: s.source,
                apply: `{{${s.key}}}`,
            })),
        }
    }
}

/** Autocomplete environment/collection variables after `{{` in JSON body (Ctrl+Space or keep typing). */
export function jsonBodyTemplateAutocompletion(scope?: VariableSuggestionScope) {
    return autocompletion({
        override: [templateCompletionSource(scope)],
        activateOnTyping: true,
        maxRenderedOptions: 64,
    })
}

function findCompleteTemplateVarAt(doc: Text, pos: number): { from: number; to: number; key: string } | null {
    const line = doc.lineAt(pos)
    const text = line.text
    const re = /\{\{([\w.-]+)\}\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
        const from = line.from + m.index
        const to = from + m[0].length
        if (pos >= from && pos < to) {
            return { from, to, key: (m[1] ?? '').trim() }
        }
    }
    return null
}

function variableSourceI18n(src: 'environment' | 'folder' | 'collection' | 'none'): string {
    if (src === 'environment') return i18n.t('vars.sourceEnvironment')
    if (src === 'folder') return i18n.t('vars.sourceFolder')
    if (src === 'collection') return i18n.t('vars.sourceCollection')
    return i18n.t('vars.sourceUnresolved')
}

function templateVarHover(scope?: VariableSuggestionScope) {
    return hoverTooltip(
        (view, pos) => {
            const hit = findCompleteTemplateVarAt(view.state.doc, pos)
            if (!hit) return null
            const key = hit.key
            return {
                pos: hit.from,
                end: hit.to,
                above: false,
                create(view: EditorView) {
                    const src = getVariableSource(key, scope)
                    if (src !== 'none') {
                        const wrap = document.createElement('div')
                        wrap.className = 'cm-json-template-var-tooltip-inner flex flex-col gap-2.5'
                        const head = document.createElement('div')
                        head.className =
                            'flex min-w-0 items-center gap-2 text-[11px] font-medium text-muted-foreground'
                        const badge = document.createElement('span')
                        const srcLabel = document.createElement('span')
                        srcLabel.className = 'min-w-0 flex-1 truncate'
                        const syncSource = () => {
                            const s = getVariableSource(key, scope)
                            const env = s === 'environment'
                            badge.textContent = env ? 'E' : 'C'
                            badge.className = env
                                ? 'inline-flex size-4 shrink-0 items-center justify-center rounded bg-[color-mix(in_srgb,var(--dracula-green)_25%,transparent)] text-[10px] font-bold text-[var(--dracula-green)]'
                                : 'inline-flex size-4 shrink-0 items-center justify-center rounded bg-[color-mix(in_srgb,var(--dracula-cyan)_25%,transparent)] text-[10px] font-bold text-[var(--dracula-cyan)]'
                            srcLabel.textContent = variableSourceI18n(s)
                        }
                        syncSource()
                        head.append(badge, srcLabel)

                        const hint = document.createElement('p')
                        hint.className = 'text-[11px] leading-relaxed text-muted-foreground'
                        hint.textContent = i18n.t('vars.editChipHint')

                        const valueLabel = document.createElement('p')
                        valueLabel.className = 'mb-0 text-[11px] text-muted-foreground'
                        valueLabel.textContent = i18n.t('vars.value')

                        const input = document.createElement('input')
                        input.type = 'text'
                        input.className = 'cm-json-missing-var-value-input'
                        input.placeholder = i18n.t('vars.enterValue')
                        input.autocomplete = 'off'
                        input.spellcheck = false
                        const syncValueFromStore = () => {
                            if (document.activeElement === input) return
                            input.value = getActiveEnvVars()[key] ?? ''
                        }
                        syncValueFromStore()

                        const addRow = document.createElement('div')
                        addRow.className =
                            'flex min-w-0 w-full items-center justify-between gap-3 text-[11px] text-muted-foreground'
                        const addLabel = document.createElement('span')
                        addLabel.className = 'shrink-0'
                        addLabel.textContent = i18n.t('vars.addTo')
                        const addTarget = document.createElement('span')
                        addTarget.className =
                            'min-w-0 max-w-[60%] flex-1 truncate text-end font-medium text-foreground/90'
                        const syncAddTarget = () => {
                            const s = useAppStore.getState()
                            const env = s.environments.find((e) => e.id === s.activeEnvironmentId)
                            addTarget.textContent =
                                env?.name ?? i18n.t('envSelector.noEnvironment')
                        }
                        syncAddTarget()
                        addRow.append(addLabel, addTarget)

                        const noEnvHint = document.createElement('p')
                        noEnvHint.className = 'hidden text-[10px] leading-snug text-muted-foreground'

                        const btnRow = document.createElement('div')
                        btnRow.className = 'flex justify-end'
                        const saveBtn = document.createElement('button')
                        saveBtn.type = 'button'
                        saveBtn.className =
                            'cm-json-missing-var-save-btn rounded-md border border-transparent bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-40'
                        saveBtn.textContent = i18n.t('vars.saveToEnvironment')

                        const closeTip = () => {
                            view.dispatch({ effects: closeHoverTooltips })
                        }

                        const applyNoEnvUi = () => {
                            const no = useAppStore.getState().activeEnvironmentId == null
                            saveBtn.disabled = no
                            input.disabled = no
                            if (no) {
                                noEnvHint.classList.remove('hidden')
                                noEnvHint.textContent = i18n.t('vars.selectEnvHint')
                            } else {
                                noEnvHint.classList.add('hidden')
                                noEnvHint.textContent = ''
                            }
                        }
                        applyNoEnvUi()

                        const save = async () => {
                            if (useAppStore.getState().activeEnvironmentId == null) return
                            const ok = await upsertActiveEnvironmentVariable(key, input.value)
                            if (ok) closeTip()
                        }
                        saveBtn.onclick = () => void save()
                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                void save()
                            }
                        })

                        const foot = document.createElement('div')
                        foot.className =
                            'flex flex-col gap-1 border-t border-border pt-2'
                        const switchLink = document.createElement('button')
                        switchLink.type = 'button'
                        switchLink.className =
                            'text-left text-[11px] text-primary underline-offset-2 hover:underline'
                        switchLink.textContent = i18n.t('vars.jsonBodySwitchEnvironment')
                        switchLink.onclick = () => {
                            closeTip()
                            document
                                .querySelector<HTMLElement>('[data-postwoman-focus="environment-selector"]')
                                ?.click()
                        }
                        const varsLink = document.createElement('button')
                        varsLink.type = 'button'
                        varsLink.className =
                            'text-left text-[11px] text-primary underline-offset-2 hover:underline'
                        varsLink.textContent = i18n.t('vars.jsonBodyVariablesLink')
                        varsLink.onclick = () => {
                            closeTip()
                            document
                                .querySelector<HTMLElement>('[data-postwoman-focus="environment-selector"]')
                                ?.click()
                        }
                        foot.append(switchLink, varsLink)

                        btnRow.append(saveBtn)
                        wrap.append(
                            head,
                            hint,
                            valueLabel,
                            input,
                            addRow,
                            noEnvHint,
                            btnRow,
                            foot,
                        )

                        let unsub: (() => void) | undefined
                        return {
                            dom: wrap,
                            mount() {
                                applyNoEnvUi()
                                syncAddTarget()
                                syncSource()
                                syncValueFromStore()
                                unsub = useAppStore.subscribe(() => {
                                    syncValueFromStore()
                                    syncSource()
                                    syncAddTarget()
                                    applyNoEnvUi()
                                })
                                if (!input.disabled) input.focus({ preventScroll: true })
                            },
                            destroy() {
                                unsub?.()
                            },
                        }
                    }

                    const wrap = document.createElement('div')
                    wrap.className = 'cm-json-template-var-tooltip-inner flex flex-col gap-2.5'
                    const head = document.createElement('div')
                    head.className = 'flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground'
                    const badge = document.createElement('span')
                    badge.className =
                        'inline-flex size-4 shrink-0 items-center justify-center rounded bg-[color-mix(in_srgb,var(--destructive)_22%,transparent)] text-[10px] font-bold text-[var(--destructive)]'
                    badge.textContent = '!'
                    const title = document.createElement('span')
                    title.className = 'min-w-0 flex-1'
                    title.textContent = i18n.t('vars.sourceUnresolved')
                    head.append(badge, title)
                    const body = document.createElement('p')
                    body.className = 'text-[11px] leading-relaxed text-muted-foreground'
                    body.textContent = i18n.t('vars.jsonBodyMissingVarBody', { name: key })

                    const valueLabel = document.createElement('p')
                    valueLabel.className = 'mb-0 text-[11px] text-muted-foreground'
                    valueLabel.textContent = i18n.t('vars.value')

                    const input = document.createElement('input')
                    input.type = 'text'
                    input.className = 'cm-json-missing-var-value-input'
                    input.placeholder = i18n.t('vars.enterValue')
                    input.autocomplete = 'off'
                    input.spellcheck = false
                    input.value = getActiveEnvVars()[key] ?? ''

                    const addRow = document.createElement('div')
                    addRow.className =
                        'flex min-w-0 w-full items-center justify-between gap-3 text-[11px] text-muted-foreground'
                    const addLabel = document.createElement('span')
                    addLabel.className = 'shrink-0'
                    addLabel.textContent = i18n.t('vars.addTo')
                    const addTarget = document.createElement('span')
                    addTarget.className =
                        'min-w-0 max-w-[60%] flex-1 truncate text-end font-medium text-foreground/90'
                    const syncAddTarget = () => {
                        const s = useAppStore.getState()
                        const env = s.environments.find((e) => e.id === s.activeEnvironmentId)
                        addTarget.textContent =
                            env?.name ?? i18n.t('envSelector.noEnvironment')
                    }
                    syncAddTarget()
                    addRow.append(addLabel, addTarget)

                    const noEnvHint = document.createElement('p')
                    noEnvHint.className = 'hidden text-[10px] leading-snug text-muted-foreground'

                    const btnRow = document.createElement('div')
                    btnRow.className = 'flex justify-end'
                    const saveBtn = document.createElement('button')
                    saveBtn.type = 'button'
                    saveBtn.className =
                        'cm-json-missing-var-save-btn rounded-md border border-transparent bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-40'

                    saveBtn.textContent = i18n.t('vars.saveToEnvironment')

                    const closeTip = () => {
                        view.dispatch({ effects: closeHoverTooltips })
                    }

                    const applyNoEnvUi = () => {
                        const no = useAppStore.getState().activeEnvironmentId == null
                        saveBtn.disabled = no
                        input.disabled = no
                        if (no) {
                            noEnvHint.classList.remove('hidden')
                            noEnvHint.textContent = i18n.t('vars.selectEnvHint')
                        } else {
                            noEnvHint.classList.add('hidden')
                            noEnvHint.textContent = ''
                        }
                    }
                    applyNoEnvUi()

                    const save = async () => {
                        if (useAppStore.getState().activeEnvironmentId == null) return
                        const ok = await upsertActiveEnvironmentVariable(key, input.value)
                        if (ok) closeTip()
                    }
                    saveBtn.onclick = () => void save()
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            void save()
                        }
                    })

                    const foot = document.createElement('div')
                    foot.className = 'border-t border-border pt-2'
                    const switchLink = document.createElement('button')
                    switchLink.type = 'button'
                    switchLink.className =
                        'text-left text-[11px] text-primary underline-offset-2 hover:underline'
                    switchLink.textContent = i18n.t('vars.jsonBodySwitchEnvironment')
                    switchLink.onclick = () => {
                        closeTip()
                        document.querySelector<HTMLElement>('[data-postwoman-focus="environment-selector"]')?.click()
                    }
                    foot.append(switchLink)

                    btnRow.append(saveBtn)
                    wrap.append(head, body, valueLabel, input, addRow, noEnvHint, btnRow, foot)

                    return {
                        dom: wrap,
                        mount() {
                            applyNoEnvUi()
                            syncAddTarget()
                            if (!input.disabled) input.focus({ preventScroll: true })
                        },
                    }
                },
            }
        },
        { hoverTime: 280 },
    )
}

function makeTemplateBadgeMatcher(scope?: VariableSuggestionScope) {
    return new MatchDecorator({
        regexp: /\{\{([\w.-]+)\}\}/g,
        decoration: (match) => {
            const key = (match[1] ?? '').trim()
            const missing = getVariableSource(key, scope) === 'none'
            return Decoration.mark({
                class: missing
                    ? 'cm-json-template-badge cm-json-template-badge--missing'
                    : 'cm-json-template-badge',
            })
        },
    })
}

/** Pill highlight: primary when key exists in env/collection, destructive when unknown. */
export function jsonTemplateVarDecorations(scope?: VariableSuggestionScope): Extension[] {
    const matcher = makeTemplateBadgeMatcher(scope)
    const plugin = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet
            private lastFp: string
            private stale = false
            private unsub: () => void

            constructor(readonly view: EditorView) {
                this.lastFp = templateVariablesFingerprint(scope)
                this.decorations = matcher.createDeco(view)
                this.unsub = useAppStore.subscribe(() => {
                    const fp = templateVariablesFingerprint(scope)
                    if (fp === this.lastFp) return
                    this.lastFp = fp
                    this.stale = true
                    this.view.dispatch({})
                })
            }

            update(u: ViewUpdate) {
                if (this.stale) {
                    this.stale = false
                    this.decorations = matcher.createDeco(this.view)
                    return
                }
                this.decorations = matcher.updateDeco(u, this.decorations)
            }

            destroy() {
                this.unsub()
            }
        },
        { decorations: (v) => v.decorations },
    )
    return [plugin, templateVarHover(scope)]
}
