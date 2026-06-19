import { describe, expect, it } from 'vitest'
import { formatJsoncPreserveComments, tryFormatJsoncBody } from './format-jsonc-body'

describe('tryFormatJsoncBody', () => {
    it('returns empty for blank input', () => {
        expect(tryFormatJsoncBody('   ')).toEqual({ ok: false, reason: 'empty' })
    })

    it('returns invalid for malformed JSON', () => {
        expect(tryFormatJsoncBody('{ "a": ')).toEqual({ ok: false, reason: 'invalid' })
    })

    it('pretty-prints valid JSONC with comments preserved', () => {
        const input = '{// line\n"a":1,"b":[2,3]}'
        const result = tryFormatJsoncBody(input)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.formatted).toContain('// line')
            expect(result.formatted).toContain('"a": 1')
        }
    })
})

describe('formatJsoncPreserveComments', () => {
    it('indents nested objects', () => {
        const out = formatJsoncPreserveComments('{"a":{"b":1}}')
        expect(out).toBe('{\n    "a": {\n        "b": 1\n    }\n}')
    })
})
