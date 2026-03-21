export type UrlSegment =
    | { type: 'text'; value: string }
    | { type: 'var'; name: string }

function normalizeUrlSegmentsForEditing(segments: UrlSegment[]): UrlSegment[] {
    if (segments.length === 0) {
        return [{ type: 'text', value: '' }]
    }
    const result: UrlSegment[] = []
    for (const s of segments) {
        const prev = result[result.length - 1]
        if (s.type === 'var' && prev?.type === 'var') {
            result.push({ type: 'text', value: '' })
        }
        result.push(s)
    }
    if (result[0]?.type === 'var') {
        result.unshift({ type: 'text', value: '' })
    }
    if (result[result.length - 1]?.type === 'var') {
        result.push({ type: 'text', value: '' })
    }
    return result
}

export function parseUrlSegments(url: string): UrlSegment[] {
    const re = /\{\{([^}]+)\}\}/g
    const out: UrlSegment[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(url)) !== null) {
        if (m.index > last) {
            out.push({ type: 'text', value: url.slice(last, m.index) })
        }
        out.push({ type: 'var', name: m[1].trim() })
        last = m.index + m[0].length
    }
    if (last < url.length) {
        out.push({ type: 'text', value: url.slice(last) })
    }
    if (out.length === 0) {
        out.push({ type: 'text', value: '' })
    }
    return normalizeUrlSegmentsForEditing(out)
}

export function segmentsToUrl(segments: UrlSegment[]): string {
    return segments.map((s) => (s.type === 'text' ? s.value : `{{${s.name}}}`)).join('')
}

function varTokenLength(name: string): number {
    return 2 + name.length + 2
}

/** Map flat string offset → text segment index + caret (snaps to right of var if offset falls inside `{{…}}`). */
/** Index of the `var` segment whose `{{…}}` starts at `urlOffset` in the serialized URL. */
export function findVarSegmentIndexAtUrlOffset(segments: UrlSegment[], urlOffset: number): number {
    let o = 0
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i]
        if (s.type === 'text') {
            o += s.value.length
        } else {
            if (o === urlOffset) return i
            o += 2 + s.name.length + 2
        }
    }
    return -1
}

export function flatOffsetToTextCaret(
    segments: UrlSegment[],
    offset: number,
): { segIndex: number; caret: number } | null {
    let o = Math.max(0, offset)
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i]
        if (s.type === 'text') {
            const len = s.value.length
            if (len === 0) {
                if (o === 0) return { segIndex: i, caret: 0 }
                continue
            }
            if (o <= len) return { segIndex: i, caret: o }
            o -= len
        } else {
            const len = varTokenLength(s.name)
            if (o <= len) {
                for (let j = i + 1; j < segments.length; j++) {
                    const t = segments[j]
                    if (t.type === 'text') return { segIndex: j, caret: 0 }
                }
                return null
            }
            o -= len
        }
    }
    for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i]
        if (s.type === 'text') return { segIndex: i, caret: s.value.length }
    }
    return null
}

export function updateTextSegment(segments: UrlSegment[], index: number, value: string): UrlSegment[] {
    return segments.map((s, i) => (i === index && s.type === 'text' ? { type: 'text', value } : s))
}

export function updateVarSegmentName(segments: UrlSegment[], index: number, name: string): UrlSegment[] {
    const trimmed = name.trim()
    return segments.map((s, i) =>
        i === index && s.type === 'var' ? { type: 'var', name: trimmed || s.name } : s,
    )
}

/** Remove `{{name}}` at index; merge adjacent text segments. */
export function removeVarSegment(segments: UrlSegment[], varIndex: number): UrlSegment[] {
    if (varIndex < 0 || varIndex >= segments.length || segments[varIndex].type !== 'var') {
        return segments
    }
    const prev = segments[varIndex - 1]
    const next = segments[varIndex + 1]
    const left = prev?.type === 'text' ? prev.value : ''
    const right = next?.type === 'text' ? next.value : ''
    const merged: UrlSegment = { type: 'text', value: left + right }
    const start = prev?.type === 'text' ? varIndex - 1 : varIndex
    const end = next?.type === 'text' ? varIndex + 2 : varIndex + 1
    return normalizeUrlSegmentsForEditing([...segments.slice(0, start), merged, ...segments.slice(end)])
}
