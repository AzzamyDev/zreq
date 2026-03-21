/** Postman "Export Environment" JSON (v2). */
type PostmanEnvValue = {
    key?: string
    value?: unknown
    enabled?: boolean
}

export function parsePostmanEnvironment(data: unknown): {
    name: string
    variables: { key: string; value: string; enabled: boolean }[]
} {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid JSON: expected an object')
    }
    const o = data as Record<string, unknown>
    const values = o.values
    if (!Array.isArray(values)) {
        throw new Error('Not a Postman environment file (missing "values" array)')
    }
    const name =
        typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Imported environment'
    const variables = values
        .map((raw) => {
            if (!raw || typeof raw !== 'object') return null
            const row = raw as PostmanEnvValue
            const key = typeof row.key === 'string' ? row.key.trim() : ''
            if (!key) return null
            const value =
                row.value === null || row.value === undefined ? '' : String(row.value)
            const enabled = row.enabled !== false
            return { key, value, enabled }
        })
        .filter((v): v is { key: string; value: string; enabled: boolean } => v !== null)
    return { name, variables }
}
