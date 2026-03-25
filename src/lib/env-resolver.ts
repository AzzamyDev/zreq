import { stripJsonComments } from './strip-json-comments'
import { useAppStore } from '../store'
import type { ActiveRequest, AuthConfig, EnvVariable, Folder } from '../types'

export function resolveEnvVars(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => vars[key.trim()] ?? match)
}

/** Expand `{{key}}` inside variable values until stable (order-independent within a pass). */
function expandInterpolatedValues(map: Record<string, string>, maxPasses = 12): Record<string, string> {
    let cur = { ...map }
    for (let p = 0; p < maxPasses; p++) {
        const next: Record<string, string> = {}
        let changed = false
        for (const [k, v] of Object.entries(cur)) {
            const nv = resolveEnvVars(v, cur)
            next[k] = nv
            if (nv !== v) changed = true
        }
        cur = next
        if (!changed) break
    }
    return cur
}

/** Root → … → target folder (inclusive). */
export function findFolderChain(items: (Folder | { type: string })[], targetFolderId: string): Folder[] | null {
    for (const item of items) {
        if (item.type !== 'folder') continue
        const f = item as Folder
        if (f.id === targetFolderId) return [f]
        const inner = findFolderChain(f.items ?? [], targetFolderId)
        if (inner) return [f, ...inner]
    }
    return null
}

export function getActiveEnvVars(): Record<string, string> {
    const { environments, activeEnvironmentId, collections, activeRequest } = useAppStore.getState()

    const result: Record<string, string> = {}
    if (activeRequest.collectionId) {
        const collection = collections.find((c) => c.id === activeRequest.collectionId)
        for (const v of collection?.variables ?? []) {
            if (v.enabled && v.key) result[v.key] = v.value
        }
        if (activeRequest.folderId && collection) {
            const chain = findFolderChain(collection.items ?? [], activeRequest.folderId)
            for (const folder of chain ?? []) {
                for (const v of folder.variables ?? []) {
                    if (v.enabled && v.key) result[v.key] = v.value
                }
            }
        }
    }

    if (activeEnvironmentId) {
        const env = environments.find((e) => e.id === activeEnvironmentId)
        for (const v of env?.variables ?? []) {
            if (v.enabled && v.key) result[v.key] = v.value
        }
    }

    return expandInterpolatedValues(result)
}

/** Optional collection/folder context for variable labels and template suggestions (e.g. settings dialogs). */
export type VariableSuggestionScope = {
    collectionId?: number | null
    folderId?: string | null
}

function resolveVariableContext(scope?: VariableSuggestionScope): {
    colId: number | null | undefined
    foldId: string | undefined
} {
    const { activeRequest } = useAppStore.getState()
    if (scope == null) {
        return { colId: activeRequest.collectionId, foldId: activeRequest.folderId }
    }
    const colId =
        scope.collectionId !== undefined ? scope.collectionId : activeRequest.collectionId
    const foldId =
        scope.folderId !== undefined ? (scope.folderId ?? undefined) : activeRequest.folderId
    return { colId: colId ?? null, foldId }
}

/** Where the variable key is defined (environment wins, then nested folders, then collection). */
export function getVariableSource(
    key: string,
    scope?: VariableSuggestionScope,
): 'environment' | 'folder' | 'collection' | 'none' {
    const k = key.trim()
    const { environments, activeEnvironmentId, collections } = useAppStore.getState()
    const env = environments.find((e) => e.id === activeEnvironmentId)
    if (env?.variables?.some((v) => v.enabled && v.key === k)) return 'environment'

    const { colId, foldId } = resolveVariableContext(scope)
    const col = colId != null ? collections.find((c) => c.id === colId) : undefined
    const chain = col && foldId ? findFolderChain(col.items ?? [], foldId) : null
    if (chain) {
        for (let i = chain.length - 1; i >= 0; i--) {
            const vars = chain[i].variables ?? []
            if (vars.some((v: EnvVariable) => v.enabled && v.key === k)) return 'folder'
        }
    }
    if (col?.variables?.some((v) => v.enabled && v.key === k)) return 'collection'
    return 'none'
}

/** Keys from active environment + collection (and folder chain when folderId is set) for `{{` autocomplete. */
export function listTemplateVariableSuggestions(scope?: VariableSuggestionScope): {
    key: string
    source: 'environment' | 'folder' | 'collection' | 'none'
}[] {
    const { environments, activeEnvironmentId, collections } = useAppStore.getState()
    const keys = new Set<string>()

    if (activeEnvironmentId) {
        const env = environments.find((e) => e.id === activeEnvironmentId)
        for (const v of env?.variables ?? []) {
            if (v.enabled && v.key.trim()) keys.add(v.key.trim())
        }
    }

    const { colId, foldId } = resolveVariableContext(scope)
    const col = colId != null ? collections.find((c) => c.id === colId) : undefined
    if (col) {
        if (foldId) {
            const chain = findFolderChain(col.items ?? [], foldId)
            for (const folder of chain ?? []) {
                for (const v of folder.variables ?? []) {
                    if (v.enabled && v.key.trim()) keys.add(v.key.trim())
                }
            }
        }
        for (const v of col.variables ?? []) {
            if (v.enabled && v.key.trim()) keys.add(v.key.trim())
        }
    }

    return [...keys]
        .sort((a, b) => a.localeCompare(b))
        .map((key) => ({ key, source: getVariableSource(key, scope) }))
}

/** Invalidates JSON `{{var}}` badges when active env / collection / folder or defined keys change. */
export function templateVariablesFingerprint(scope?: VariableSuggestionScope): string {
    const s = useAppStore.getState()
    const colId = scope?.collectionId !== undefined ? scope.collectionId : s.activeRequest.collectionId
    const foldId = scope?.folderId !== undefined ? (scope.folderId ?? undefined) : s.activeRequest.folderId
    const keys = listTemplateVariableSuggestions(scope)
        .map((v) => v.key)
        .sort()
        .join('|')
    return `${s.activeEnvironmentId ?? 'noenv'}|${colId ?? 'nocol'}|${foldId ?? 'nofold'}|${keys}`
}

function resolveInheritedAuth(collectionId: number, folderId: string | undefined): AuthConfig {
    const { collections } = useAppStore.getState()
    const collection = collections.find((c) => c.id === collectionId)
    if (!collection) return { type: 'none' }

    const chain = folderId ? findFolderChain(collection.items ?? [], folderId) : null
    if (chain) {
        for (let i = chain.length - 1; i >= 0; i--) {
            const a = chain[i].auth ?? { type: 'inherit' as const }
            if (a.type !== 'inherit') return a
        }
    }
    return collection.auth ?? { type: 'none' }
}

export function resolveRequest(req: ActiveRequest, vars: Record<string, string>) {
    let url = resolveEnvVars(req.url || '', vars)

    const enabledParams = (req.params || []).filter((p) => p.enabled && p.key)
    if (enabledParams.length > 0) {
        const qs = enabledParams
            .map(
                (p) =>
                    `${encodeURIComponent(resolveEnvVars(p.key, vars))}=${encodeURIComponent(resolveEnvVars(p.value || '', vars))}`
            )
            .join('&')
        url += (url.includes('?') ? '&' : '?') + qs
    }

    const headers: Record<string, string> = {}
    for (const h of (req.headers || []).filter((h) => h.enabled && h.key)) {
        headers[resolveEnvVars(h.key, vars)] = resolveEnvVars(h.value || '', vars)
    }

    let auth = req.auth || { type: 'none' }
    if (auth.type === 'inherit' && req.collectionId != null) {
        auth = resolveInheritedAuth(req.collectionId, req.folderId)
    }
    if (auth.type === 'bearer' && auth.token) {
        headers['Authorization'] = `Bearer ${resolveEnvVars(auth.token, vars)}`
    } else if (auth.type === 'basic' && auth.username) {
        const username = resolveEnvVars(auth.username, vars)
        const password = resolveEnvVars(auth.password || '', vars)
        headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`
    } else if (auth.type === 'jwt' && auth.token) {
        const prefix = auth.prefix || 'Bearer'
        headers['Authorization'] = `${prefix} ${resolveEnvVars(auth.token, vars)}`
    }

    let body: string | null = null
    const bodyType = req.body?.type || 'none'

    if (bodyType === 'json' && req.body?.content) {
        const withoutComments = stripJsonComments(req.body.content)
        body = resolveEnvVars(withoutComments, vars)
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json'
    } else if (bodyType === 'raw' && req.body?.content) {
        body = resolveEnvVars(req.body.content, vars)
    } else if (bodyType === 'urlencoded') {
        if (req.body?.content) {
            body = req.body.content
            if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded'
        }
    } else if (bodyType === 'form-data') {
        if (req.body?.content) {
            try {
                const rows = JSON.parse(req.body.content) as unknown
                if (Array.isArray(rows)) {
                    const resolvedRows = rows
                        .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
                        .map((row) => {
                            const valueType = row.valueType === 'file' ? 'file' : 'text'
                            return {
                                ...row,
                                valueType,
                                key: resolveEnvVars(String(row.key ?? ''), vars),
                                value: valueType === 'text' ? resolveEnvVars(String(row.value ?? ''), vars) : '',
                                fileName:
                                    valueType === 'file'
                                        ? resolveEnvVars(String(row.fileName ?? ''), vars)
                                        : undefined,
                                fileParts:
                                    valueType === 'file' && Array.isArray(row.fileParts)
                                        ? row.fileParts
                                            .filter(
                                                (part): part is Record<string, unknown> =>
                                                    typeof part === 'object' && part !== null,
                                            )
                                            .map((part) => ({
                                                name: resolveEnvVars(String(part.name ?? ''), vars),
                                                mimeType: String(part.mimeType ?? ''),
                                                base64: String(part.base64 ?? ''),
                                            }))
                                        : undefined,
                            }
                        })
                    body = JSON.stringify(resolvedRows)
                } else {
                    body = req.body.content
                }
            } catch {
                body = req.body.content
            }
        }
    }

    return { method: req.method || 'GET', url, headers, body, body_type: bodyType }
}
