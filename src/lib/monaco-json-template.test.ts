import { describe, expect, it, vi } from 'vitest'
import { templateVarFilterFromLineBeforeCursor } from './monaco-json-template'

vi.mock('../store', () => ({
    useAppStore: {
        getState: () => ({
            environments: [],
            activeEnvironmentId: null,
            collections: [],
            activeRequest: {},
        }),
    },
}))

describe('templateVarFilterFromLineBeforeCursor', () => {
    it('detects incomplete template inside a JSON string', () => {
        expect(templateVarFilterFromLineBeforeCursor('  "url": "{{')).toBe('')
        expect(templateVarFilterFromLineBeforeCursor('  "url": "{{$tim')).toBe('$tim')
    })

    it('returns null when not in a template', () => {
        expect(templateVarFilterFromLineBeforeCursor('  "url": "https://')).toBeNull()
        expect(templateVarFilterFromLineBeforeCursor('  "url": "{')).toBeNull()
    })
})
