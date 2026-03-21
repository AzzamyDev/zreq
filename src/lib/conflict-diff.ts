import type { ActorSummary, Collection, Environment, Workspace } from '@/types'
import type { ConflictEntry } from '@/lib/local-replica/types'

export type FieldDiffRow = { path: string; local: string; server: string }

export type VarDiffRow = {
    key: string
    kind: 'changed' | 'local_only' | 'server_only'
    local: string
    server: string
    /** Who last touched matching var row(s) on this side (from API), if known. */
    localEditor?: string
    serverEditor?: string
}

export type CollectionTreeStats = {
    requests: number
    folders: number
    maxDepth: number
}

function sortKeysDeep(x: unknown): unknown {
    if (x === null || typeof x !== 'object') return x
    if (x instanceof Date) return x.toISOString()
    if (Array.isArray(x)) return x.map(sortKeysDeep)
    const o = x as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) {
        out[k] = sortKeysDeep(o[k])
    }
    return out
}

export function stableStringify(value: unknown, space = 2): string {
    try {
        return JSON.stringify(sortKeysDeep(value), null, space)
    } catch {
        return String(value)
    }
}

function str(v: unknown): string {
    if (v === undefined || v === null) return '—'
    if (typeof v === 'string') return v || '—'
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'object') return stableStringify(v, 0)
    return String(v)
}

export function actorLabel(u: ActorSummary | undefined): string {
    if (!u) return '—'
    const name = u.name?.trim() || `#${u.id}`
    return u.email ? `${name} (${u.email})` : name
}

/** Resolve editor label from API/store objects (typed or loose JSON). */
export function lastEditorLabelFromEntity(entity: unknown): string {
    if (!entity || typeof entity !== 'object') return '—'
    const o = entity as Record<string, unknown>
    const direct = o.lastUpdatedBy ?? o.LastUpdatedBy
    if (!direct || typeof direct !== 'object') return '—'
    return actorFromUnknown(direct) ?? actorLabel(direct as ActorSummary)
}

function actorFromUnknown(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const o = raw as Record<string, unknown>
    const idRaw = o.id
    const id = typeof idRaw === 'number' && Number.isFinite(idRaw) ? idRaw : undefined
    const name = o.name != null ? String(o.name).trim() : ''
    const email = o.email != null ? String(o.email).trim() : ''
    if (id == null && !name && !email) return undefined
    const displayName = name || (id != null ? `#${id}` : email || '?')
    return actorLabel({ id: id ?? 0, name: displayName, email })
}

function collectTreeStats(nodes: unknown[], depth = 0): CollectionTreeStats {
    let requests = 0
    let folders = 0
    let maxDepth = depth
    for (const n of nodes) {
        if (!n || typeof n !== 'object') continue
        const o = n as { type?: string; items?: unknown[] }
        if (o.type === 'request') {
            requests += 1
            maxDepth = Math.max(maxDepth, depth)
        } else if (o.type === 'folder') {
            folders += 1
            maxDepth = Math.max(maxDepth, depth)
            const ch = Array.isArray(o.items) ? o.items : []
            const sub = collectTreeStats(ch, depth + 1)
            requests += sub.requests
            folders += sub.folders
            maxDepth = Math.max(maxDepth, sub.maxDepth)
        }
    }
    return { requests, folders, maxDepth }
}

export function getCollectionTreeStats(col: Partial<Collection> | null): CollectionTreeStats {
    const items = Array.isArray(col?.items) ? col!.items! : []
    return collectTreeStats(items as unknown[], 0)
}

export function scalarFieldDiffs(
    local: Record<string, unknown>,
    server: Record<string, unknown>,
    keys: string[]
): FieldDiffRow[] {
    const rows: FieldDiffRow[] = []
    for (const path of keys) {
        const lv = local[path]
        const sv = server[path]
        const a = str(lv)
        const b = str(sv)
        if (a !== b) rows.push({ path, local: a, server: b })
    }
    return rows
}

function itemsDiffer(local: unknown, server: unknown): boolean {
    return stableStringify(local, 0) !== stableStringify(server, 0)
}

export type NormEnvVar = { key: string; value: string; enabled: boolean; editedBy?: string }

/** Flatten API / store shapes so Prisma rows and client rows diff reliably. */
export function normalizeEnvVarsForDiff(raw: unknown): NormEnvVar[] {
    if (!Array.isArray(raw)) return []
    const out: NormEnvVar[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const o = item as Record<string, unknown>
        const rawKey = o.key ?? (o as { Key?: unknown }).Key
        const key = rawKey != null ? String(rawKey) : ''
        const rawVal = o.value ?? (o as { Value?: unknown }).Value
        const value = rawVal != null ? String(rawVal) : ''
        const enabled = o.enabled === false ? false : true
        const edited =
            actorFromUnknown(o.lastUpdatedBy) ??
            actorFromUnknown((o as { LastUpdatedBy?: unknown }).LastUpdatedBy)
        out.push({ key, value, enabled, ...(edited && { editedBy: edited }) })
    }
    return out
}

type MultisetVarSide = { display: string; editors: string }

function multisetVarSides(vars: NormEnvVar[]): Map<string, MultisetVarSide> {
    const lines = new Map<string, string[]>()
    const editors = new Map<string, Set<string>>()
    for (const v of vars) {
        const k = v.key.trim() === '' ? '(empty key)' : v.key
        const line = `${v.value}${v.enabled === false ? ' (off)' : ''}`
        const la = lines.get(k)
        if (la) la.push(line)
        else lines.set(k, [line])
        if (v.editedBy) {
            const es = editors.get(k) ?? new Set<string>()
            es.add(v.editedBy)
            editors.set(k, es)
        }
    }
    return new Map(
        [...lines.entries()].map(([k, arr]) => {
            arr.sort()
            const es = editors.get(k)
            const edStr = es && es.size > 0 ? [...es].sort().join(', ') : ''
            return [k, { display: arr.join('\n'), editors: edStr }] as [string, MultisetVarSide]
        })
    )
}

export function getVariableDiffs(
    localVars: Array<{ key: string; value: string; enabled?: boolean }> | undefined,
    serverVars: Array<{ key: string; value: string; enabled?: boolean }> | undefined
): VarDiffRow[] {
    const L = normalizeEnvVarsForDiff(localVars)
    const S = normalizeEnvVarsForDiff(serverVars)
    const lm = multisetVarSides(L)
    const sm = multisetVarSides(S)
    const keys = new Set([...lm.keys(), ...sm.keys()])
    const out: VarDiffRow[] = []
    for (const key of [...keys].sort()) {
        const la = lm.get(key)
        const sa = sm.get(key)
        const ls = la?.display ?? '—'
        const ss = sa?.display ?? '—'
        const le = la?.editors || undefined
        const se = sa?.editors || undefined
        if (!la)
            out.push({
                key,
                kind: 'server_only',
                local: '—',
                server: ss,
                ...(se && { serverEditor: se })
            })
        else if (!sa)
            out.push({
                key,
                kind: 'local_only',
                local: ls,
                server: '—',
                ...(le && { localEditor: le })
            })
        else if (ls !== ss)
            out.push({
                key,
                kind: 'changed',
                local: ls,
                server: ss,
                ...(le && { localEditor: le }),
                ...(se && { serverEditor: se })
            })
    }
    return out
}

export type ConflictDiffModel = {
    title: string
    /** Always shown for collection / environment so “who edited” is visible even when it matches or is unknown. */
    editorRows: FieldDiffRow[]
    scalarRows: FieldDiffRow[]
    varRows: VarDiffRow[]
    itemsStructuralNote: string | null
    /** Set when normalized variables differ but per-key table produced no rows. */
    envVarMismatchCounts: { local: number; server: number } | null
    localJson: string
    serverJson: string
    localTruncated: boolean
    serverTruncated: boolean
}

const MAX_JSON_CHARS = 120_000

function truncateJson(s: string): { text: string; truncated: boolean } {
    if (s.length <= MAX_JSON_CHARS) return { text: s, truncated: false }
    return { text: `${s.slice(0, MAX_JSON_CHARS)}\n\n… (${s.length - MAX_JSON_CHARS} more characters truncated)`, truncated: true }
}

export function buildConflictDiffModel(c: ConflictEntry): ConflictDiffModel {
    const local = c.local
    const server = c.server

    let title = `${c.kind} #${c.entityId}`
    let editorRows: FieldDiffRow[] = []
    let scalarRows: FieldDiffRow[] = []
    let varRows: VarDiffRow[] = []
    let itemsStructuralNote: string | null = null
    let envVarMismatchCounts: { local: number; server: number } | null = null
    if (c.kind === 'workspace') {
        const l = (local ?? {}) as Partial<Workspace>
        const s = (server ?? {}) as Partial<Workspace>
        title = `${l.name ?? s.name ?? 'Workspace'} (#${c.entityId})`
        scalarRows = scalarFieldDiffs(
            { ...l } as Record<string, unknown>,
            { ...s } as Record<string, unknown>,
            ['name', 'id', 'userId', 'createdAt', 'updatedAt']
        )
    } else if (c.kind === 'environment') {
        const l = (local ?? {}) as Partial<Environment>
        const s = (server ?? {}) as Partial<Environment>
        title = `${l.name ?? s.name ?? 'Environment'} (#${c.entityId})`
        editorRows = [
            {
                path: 'lastEditedBy',
                local: lastEditorLabelFromEntity(local),
                server: lastEditorLabelFromEntity(server),
            },
        ]
        scalarRows = scalarFieldDiffs(
            { ...l, variables: undefined, lastUpdatedBy: undefined } as Record<string, unknown>,
            { ...s, variables: undefined, lastUpdatedBy: undefined } as Record<string, unknown>,
            ['name', 'id', 'userId', 'createdAt', 'updatedAt']
        )
        varRows = getVariableDiffs(l.variables, s.variables)
        const normL = normalizeEnvVarsForDiff(l.variables)
        const normS = normalizeEnvVarsForDiff(s.variables)
        if (varRows.length === 0 && stableStringify(normL, 0) !== stableStringify(normS, 0)) {
            envVarMismatchCounts = { local: normL.length, server: normS.length }
        }
    } else if (c.kind === 'collection') {
        const l = (local ?? {}) as Partial<Collection>
        const s = (server ?? {}) as Partial<Collection>
        title = `${l.name ?? s.name ?? 'Collection'} (#${c.entityId})`
        editorRows = [
            {
                path: 'lastEditedBy',
                local: lastEditorLabelFromEntity(local),
                server: lastEditorLabelFromEntity(server),
            },
        ]
        scalarRows = scalarFieldDiffs(
            { ...l, items: undefined, lastUpdatedBy: undefined } as Record<string, unknown>,
            { ...s, items: undefined, lastUpdatedBy: undefined } as Record<string, unknown>,
            [
                'name',
                'description',
                'id',
                'workspaceId',
                'userId',
                'createdAt',
                'updatedAt',
            ]
        )
        if (itemsDiffer(l.items, s.items)) {
            const sl = getCollectionTreeStats(l)
            const ss = getCollectionTreeStats(s)
            itemsStructuralNote = `Requests/folders — local: ${sl.requests} req, ${sl.folders} folders (depth ≤${sl.maxDepth}); server: ${ss.requests} req, ${ss.folders} folders (depth ≤${ss.maxDepth}).`
        }
    }

    const rawLocal = stableStringify(local, 2)
    const rawServer = stableStringify(server, 2)
    const tl = truncateJson(rawLocal)
    const ts = truncateJson(rawServer)

    return {
        title,
        editorRows,
        scalarRows,
        varRows,
        itemsStructuralNote,
        envVarMismatchCounts,
        localJson: tl.text,
        serverJson: ts.text,
        localTruncated: tl.truncated,
        serverTruncated: ts.truncated,
    }
}

export type UnifiedLine = { kind: 'same' | 'add' | 'del'; text: string }

/** Simple line diff for monospace preview (LCS on lines, capped). */
export function unifiedLineDiff(a: string, b: string, maxLines = 400): UnifiedLine[] {
    const la = a.split('\n')
    const lb = b.split('\n')
    if (la.length + lb.length > maxLines * 2) {
        return [{ kind: 'same', text: '… diff skipped (too many lines); use JSON panels below.' }]
    }
    const n = la.length
    const m = lb.length
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] =
                la[i] === lb[j]
                    ? 1 + dp[i + 1][j + 1]
                    : Math.max(dp[i + 1][j], dp[i][j + 1])
        }
    }
    const out: UnifiedLine[] = []
    let i = 0
    let j = 0
    while (i < n || j < m) {
        if (i < n && j < m && la[i] === lb[j]) {
            out.push({ kind: 'same', text: la[i] })
            i++
            j++
        } else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) {
            out.push({ kind: 'add', text: lb[j] })
            j++
        } else if (i < n) {
            out.push({ kind: 'del', text: la[i] })
            i++
        } else {
            break
        }
    }
    return out
}
