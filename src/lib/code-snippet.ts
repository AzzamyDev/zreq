export type SnippetKind = 'curl' | 'fetch' | 'python'

export type SnippetRequest = {
    method: string
    url: string
    headers: Record<string, string>
    body: string | null
    body_type: string
}

type FormRow = {
    key?: string
    value?: string
    enabled?: boolean
    valueType?: string
}

function shellSingle(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`
}

function jsString(value: string): string {
    return JSON.stringify(value)
}

function parseFormRows(body: string | null): { texts: { key: string; value: string }[]; files: string[] } {
    const texts: { key: string; value: string }[] = []
    const files: string[] = []
    if (!body) return { texts, files }
    try {
        const rows = JSON.parse(body) as unknown
        if (!Array.isArray(rows)) return { texts, files }
        for (const row of rows) {
            if (!row || typeof row !== 'object') continue
            const field = row as FormRow
            if (field.enabled === false) continue
            const key = String(field.key ?? '').trim()
            if (!key) continue
            if (field.valueType === 'file') files.push(key)
            else texts.push({ key, value: String(field.value ?? '') })
        }
    } catch {
        return { texts, files }
    }
    return { texts, files }
}

function headersWithoutContentType(headers: Record<string, string>): Record<string, string> {
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === 'content-type') continue
        next[key] = value
    }
    return next
}

function curlSnippet(req: SnippetRequest): string {
    const lines = [`curl -X ${req.method || 'GET'} ${shellSingle(req.url)}`]
    const form = req.body_type === 'form-data' ? parseFormRows(req.body) : null
    const headers = form ? headersWithoutContentType(req.headers) : req.headers
    for (const [key, value] of Object.entries(headers)) {
        lines.push(`  -H ${shellSingle(`${key}: ${value}`)}`)
    }
    if (form) {
        for (const field of form.texts) {
            lines.push(`  -F ${shellSingle(`${field.key}=${field.value}`)}`)
        }
        for (const name of form.files) {
            lines.push(`  # file field ${name} is not included`)
        }
    } else if (req.body) {
        lines.push(`  --data-raw ${shellSingle(req.body)}`)
    }
    return lines.join(' \\\n')
}

function fetchSnippet(req: SnippetRequest): string {
    const form = req.body_type === 'form-data' ? parseFormRows(req.body) : null
    const headers = form ? headersWithoutContentType(req.headers) : req.headers
    const headerLines = Object.entries(headers).map(([key, value]) => `    ${jsString(key)}: ${jsString(value)},`)
    const lines: string[] = []
    if (form) {
        lines.push('const body = new FormData()')
        for (const field of form.texts) {
            lines.push(`body.append(${jsString(field.key)}, ${jsString(field.value)})`)
        }
        for (const name of form.files) {
            lines.push(`// file field ${JSON.stringify(name)} is not included`)
        }
        lines.push('')
    }
    lines.push(`fetch(${jsString(req.url)}, {`)
    lines.push(`  method: ${jsString(req.method || 'GET')},`)
    if (headerLines.length > 0) {
        lines.push('  headers: {')
        lines.push(...headerLines)
        lines.push('  },')
    }
    if (form) lines.push('  body,')
    else if (req.body != null && req.body !== '') lines.push(`  body: ${jsString(req.body)},`)
    lines.push('})')
    return lines.join('\n')
}

function pythonSnippet(req: SnippetRequest): string {
    const form = req.body_type === 'form-data' ? parseFormRows(req.body) : null
    const headers = form ? headersWithoutContentType(req.headers) : req.headers
    const headerLiteral = `{${Object.entries(headers)
        .map(([key, value]) => `${jsString(key)}: ${jsString(value)}`)
        .join(', ')}}`
    const lines = ['import requests', '']
    if (form) {
        for (const name of form.files) {
            lines.push(`# file field ${JSON.stringify(name)} is not included`)
        }
        const dataLiteral = `{${form.texts.map((field) => `${jsString(field.key)}: ${jsString(field.value)}`).join(', ')}}`
        lines.push('response = requests.request(')
        lines.push(`    ${jsString(req.method || 'GET')},`)
        lines.push(`    ${jsString(req.url)},`)
        lines.push(`    headers=${headerLiteral},`)
        lines.push(`    data=${dataLiteral},`)
        lines.push(')')
        return lines.join('\n')
    }
    lines.push('response = requests.request(')
    lines.push(`    ${jsString(req.method || 'GET')},`)
    lines.push(`    ${jsString(req.url)},`)
    lines.push(`    headers=${headerLiteral},`)
    if (req.body) lines.push(`    data=${jsString(req.body)},`)
    lines.push(')')
    return lines.join('\n')
}

export function buildCodeSnippet(kind: SnippetKind, req: SnippetRequest): string {
    if (kind === 'fetch') return fetchSnippet(req)
    if (kind === 'python') return pythonSnippet(req)
    return curlSnippet(req)
}
