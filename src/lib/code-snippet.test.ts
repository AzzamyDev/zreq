import { describe, expect, it } from 'vitest'
import { buildCodeSnippet } from './code-snippet'

const jsonRequest = {
    method: 'POST',
    url: 'https://example.com/items',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{"name":"Ada"}',
    body_type: 'json',
}

describe('buildCodeSnippet', () => {
    it('writes a curl command with single-quoted body', () => {
        const snippet = buildCodeSnippet('curl', jsonRequest)
        expect(snippet).toContain(`curl -X POST 'https://example.com/items'`)
        expect(snippet).toContain(`-H 'Content-Type: application/json'`)
        expect(snippet).toContain(`--data-raw '{"name":"Ada"}'`)
    })

    it('escapes single quotes in curl strings', () => {
        const snippet = buildCodeSnippet('curl', { ...jsonRequest, url: "https://example.com/a'b" })
        expect(snippet).toContain(`'https://example.com/a'\\''b'`)
    })

    it('writes a fetch call', () => {
        const snippet = buildCodeSnippet('fetch', jsonRequest)
        expect(snippet).toContain(`fetch("https://example.com/items"`)
        expect(snippet).toContain(`method: "POST"`)
        expect(snippet).toContain(`body: "{\\"name\\":\\"Ada\\"}"`)
    })

    it('writes python requests and skips file fields', () => {
        const snippet = buildCodeSnippet('python', {
            method: 'POST',
            url: 'https://example.com/upload',
            headers: { Authorization: 'Bearer tok' },
            body_type: 'form-data',
            body: JSON.stringify([
                { key: 'title', value: 'Ada', enabled: true, valueType: 'text' },
                { key: 'file', value: '', enabled: true, valueType: 'file' },
                { key: 'off', value: 'no', enabled: false, valueType: 'text' },
            ]),
        })
        expect(snippet).toContain('import requests')
        expect(snippet).toContain('"title": "Ada"')
        expect(snippet).toContain('file field "file" is not included')
        expect(snippet).not.toContain('"off"')
        expect(snippet).not.toContain('Content-Type')
    })
})
