import { describe, expect, it } from 'vitest'
import { refreshTabsFromPulledCollections } from './sync-refresh-tabs'
import type { Collection, RequestTab } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCollection = (overrides: Partial<Collection> = {}): Collection => ({
    id: 1,
    name: 'My Collection',
    items: [],
    userId: 1,
    workspaceId: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
})

const makeTab = (overrides: Partial<RequestTab> = {}): RequestTab => ({
    id: 'tab-1',
    name: 'Get Users',
    method: 'GET',
    isDirty: false,
    request: {
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: [],
        params: [],
        body: { type: 'none', content: '' },
        auth: { type: 'none' },
        name: 'Get Users',
        itemId: 'req-1',
        collectionId: 1,
    },
    response: null,
    wsState: 'idle',
    wsFrames: [],
    wsHandshake: null,
    wsConnectedAt: null,
    ...overrides,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('refreshTabsFromPulledCollections', () => {
    it('updates URL on a clean tab when the remote request changed', () => {
        const tab = makeTab()
        const col = makeCollection({
            items: [
                {
                    type: 'request',
                    id: 'req-1',
                    name: 'Get Users',
                    method: 'GET',
                    url: 'https://api.example.com/v2/users',
                    headers: [],
                    params: [],
                    body: { type: 'none', content: '' },
                    auth: { type: 'none' },
                },
            ],
        })

        const { tabs, refreshedTabIds } = refreshTabsFromPulledCollections([tab], [col])

        expect(refreshedTabIds.has('tab-1')).toBe(true)
        expect(tabs[0].request.url).toBe('https://api.example.com/v2/users')
    })

    it('updates method, headers, and body on a clean tab', () => {
        const tab = makeTab()
        const col = makeCollection({
            items: [
                {
                    type: 'request',
                    id: 'req-1',
                    name: 'Create User',
                    method: 'POST',
                    url: 'https://api.example.com/users',
                    headers: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
                    params: [],
                    body: { type: 'json', content: '{"name":"test"}' },
                    auth: { type: 'bearer', token: 'abc' },
                },
            ],
        })

        const { tabs, refreshedTabIds } = refreshTabsFromPulledCollections([tab], [col])

        expect(refreshedTabIds.has('tab-1')).toBe(true)
        expect(tabs[0].request.method).toBe('POST')
        expect(tabs[0].method).toBe('POST')
        expect(tabs[0].request.headers).toHaveLength(1)
        expect(tabs[0].request.headers[0].key).toBe('Content-Type')
        expect(tabs[0].request.body.type).toBe('json')
        expect(tabs[0].request.auth).toEqual({ type: 'bearer', token: 'abc' })
        expect(tabs[0].name).toBe('Create User')
    })

    it('does NOT update a dirty tab (user has unsaved edits)', () => {
        const tab = makeTab({ isDirty: true })
        const col = makeCollection({
            items: [
                {
                    type: 'request',
                    id: 'req-1',
                    name: 'Get Users',
                    method: 'DELETE',
                    url: 'https://api.example.com/v99/users',
                    headers: [],
                    params: [],
                    body: { type: 'none', content: '' },
                    auth: { type: 'none' },
                },
            ],
        })

        const { tabs, refreshedTabIds } = refreshTabsFromPulledCollections([tab], [col])

        expect(refreshedTabIds.has('tab-1')).toBe(false)
        expect(tabs[0].request.url).toBe('https://api.example.com/users')
        expect(tabs[0].request.method).toBe('GET')
    })

    it('does NOT update a saved-response tab', () => {
        const tab = makeTab({
            request: {
                ...makeTab().request,
                savedResponseId: 'saved-1',
            },
        })
        const col = makeCollection({
            items: [
                {
                    type: 'request',
                    id: 'req-1',
                    name: 'Get Users',
                    method: 'DELETE',
                    url: 'https://api.example.com/v99/users',
                    headers: [],
                    params: [],
                    body: { type: 'none', content: '' },
                    auth: { type: 'none' },
                },
            ],
        })

        const { tabs, refreshedTabIds } = refreshTabsFromPulledCollections([tab], [col])

        expect(refreshedTabIds.has('tab-1')).toBe(false)
        expect(tabs[0].request.url).toBe('https://api.example.com/users')
    })

    it('does NOT update a scratch tab with no itemId', () => {
        const tab = makeTab({
            request: {
                ...makeTab().request,
                itemId: undefined,
            },
        })
        const col = makeCollection({
            items: [
                {
                    type: 'request',
                    id: 'req-1',
                    name: 'Get Users',
                    method: 'DELETE',
                    url: 'https://api.example.com/changed',
                    headers: [],
                    params: [],
                    body: { type: 'none', content: '' },
                    auth: { type: 'none' },
                },
            ],
        })

        const { tabs, refreshedTabIds } = refreshTabsFromPulledCollections([tab], [col])

        expect(refreshedTabIds.size).toBe(0)
        expect(tabs[0].request.url).toBe('https://api.example.com/users')
    })

    it('updates a tab for a request nested inside a folder', () => {
        const tab = makeTab({
            request: {
                ...makeTab().request,
                itemId: 'req-nested',
                folderId: 'folder-1',
            },
        })
        const col = makeCollection({
            items: [
                {
                    type: 'folder',
                    id: 'folder-1',
                    name: 'Auth',
                    items: [
                        {
                            type: 'request',
                            id: 'req-nested',
                            name: 'Login',
                            method: 'POST',
                            url: 'https://api.example.com/auth/login',
                            headers: [],
                            params: [],
                            body: { type: 'json', content: '{}' },
                            auth: { type: 'inherit' },
                        },
                    ],
                },
            ],
        })

        const { tabs, refreshedTabIds } = refreshTabsFromPulledCollections([tab], [col])

        expect(refreshedTabIds.has('tab-1')).toBe(true)
        expect(tabs[0].request.url).toBe('https://api.example.com/auth/login')
        expect(tabs[0].request.method).toBe('POST')
    })

    it('updates multiple tabs independently', () => {
        const tab1 = makeTab({ id: 'tab-1' })
        const tab2 = makeTab({
            id: 'tab-2',
            isDirty: true,
            request: { ...makeTab().request, itemId: 'req-2', collectionId: 1 },
        })
        const tab3 = makeTab({
            id: 'tab-3',
            request: { ...makeTab().request, itemId: 'req-3', collectionId: 1 },
        })

        const col = makeCollection({
            items: [
                {
                    type: 'request',
                    id: 'req-1',
                    name: 'Get Users',
                    method: 'GET',
                    url: 'https://api.example.com/v2/users',
                    headers: [],
                    params: [],
                    body: { type: 'none', content: '' },
                    auth: { type: 'none' },
                },
                {
                    type: 'request',
                    id: 'req-2',
                    name: 'Delete Users',
                    method: 'DELETE',
                    url: 'https://api.example.com/v2/users',
                    headers: [],
                    params: [],
                    body: { type: 'none', content: '' },
                    auth: { type: 'none' },
                },
                {
                    type: 'request',
                    id: 'req-3',
                    name: 'List Posts',
                    method: 'GET',
                    url: 'https://api.example.com/v2/posts',
                    headers: [],
                    params: [],
                    body: { type: 'none', content: '' },
                    auth: { type: 'none' },
                },
            ],
        })

        const { tabs, refreshedTabIds } = refreshTabsFromPulledCollections([tab1, tab2, tab3], [col])

        // tab-1 (clean) -> refreshed
        expect(refreshedTabIds.has('tab-1')).toBe(true)
        expect(tabs[0].request.url).toBe('https://api.example.com/v2/users')

        // tab-2 (dirty) -> not refreshed
        expect(refreshedTabIds.has('tab-2')).toBe(false)
        expect(tabs[1].request.url).toBe('https://api.example.com/users')

        // tab-3 (clean) -> refreshed
        expect(refreshedTabIds.has('tab-3')).toBe(true)
        expect(tabs[2].request.url).toBe('https://api.example.com/v2/posts')
    })

    it('returns an empty refreshedTabIds set when no tabs change', () => {
        const tab = makeTab()
        const col = makeCollection({ items: [] })

        const { tabs, refreshedTabIds } = refreshTabsFromPulledCollections([tab], [col])

        expect(refreshedTabIds.size).toBe(0)
        expect(tabs[0]).toBe(tab)
    })

    it('preserves WS state and response on a refreshed tab', () => {
        const tab = makeTab({
            wsState: 'connected',
            wsFrames: [{ id: 'f1', direction: 'outgoing', timestamp: 1, data: 'ping' }],
            response: {
                status: 200,
                statusText: 'OK',
                headers: {},
                body: 'old body',
                durationMs: 100,
                sizeBytes: 9,
            },
        })
        const col = makeCollection({
            items: [
                {
                    type: 'request',
                    id: 'req-1',
                    name: 'Get Users',
                    method: 'GET',
                    url: 'https://api.example.com/v2/users',
                    headers: [],
                    params: [],
                    body: { type: 'none', content: '' },
                    auth: { type: 'none' },
                },
            ],
        })

        const { tabs } = refreshTabsFromPulledCollections([tab], [col])

        expect(tabs[0].wsState).toBe('connected')
        expect(tabs[0].wsFrames).toHaveLength(1)
        expect(tabs[0].response?.status).toBe(200)
    })
})
