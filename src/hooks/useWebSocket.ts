import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { nanoid } from 'nanoid'
import { useAppStore } from '../store'
import { resolveWebSocketRequest, getActiveEnvVars } from '../lib/env-resolver'
import type { WsFrame } from '../types'

type WsHandshakePayload = {
    session_id: string
    status: number
    headers: Record<string, string>
}

type WsMessagePayload = {
    session_id: string
    direction: string
    data: string
    is_binary: boolean
    opcode: string
    timestamp: number
}

type WsStatusPayload = {
    session_id: string
    status: string
}

type WsErrorPayload = {
    session_id: string
    message: string
}

export function useWebSocket() {
    const activeTabId = useAppStore((s) => s.activeTabId)
    const activeRequest = useAppStore((s) => s.activeRequest)
    const tabs = useAppStore((s) => s.tabs)
    const {
        setWsState,
        appendWsFrame,
        clearWsFrames,
        setWsHandshake,
        setWsConnectedAt,
        addConsoleLog,
    } = useAppStore()

    const unlistenersRef = useRef<UnlistenFn[]>([])
    const subscribedTabRef = useRef<string | null>(null)

    const activeTab = tabs.find((t) => t.id === activeTabId)
    const wsState = activeTab?.wsState ?? 'idle'
    const isConnected = wsState === 'connected'
    const isConnecting = wsState === 'connecting'

    const cleanupListeners = useCallback(async () => {
        for (const unlisten of unlistenersRef.current) {
            unlisten()
        }
        unlistenersRef.current = []
        subscribedTabRef.current = null
    }, [])

    const setupListeners = useCallback(
        async (sessionId: string) => {
            await cleanupListeners()
            subscribedTabRef.current = sessionId

            const handlers: Array<[string, (payload: unknown) => void]> = [
                [
                    'ws-handshake',
                    (p) => {
                        const ev = p as WsHandshakePayload
                        if (ev.session_id !== sessionId) return
                        setWsHandshake(sessionId, {
                            status: ev.status,
                            headers: ev.headers,
                        })
                    },
                ],
                [
                    'ws-message',
                    (p) => {
                        const ev = p as WsMessagePayload
                        if (ev.session_id !== sessionId) return
                        const frame: WsFrame = {
                            id: nanoid(),
                            direction: ev.direction as WsFrame['direction'],
                            timestamp: ev.timestamp,
                            data: ev.data,
                            isBinary: ev.is_binary,
                            opcode: ev.opcode as WsFrame['opcode'],
                        }
                        appendWsFrame(sessionId, frame)
                    },
                ],
                [
                    'ws-status',
                    (p) => {
                        const ev = p as WsStatusPayload
                        if (ev.session_id !== sessionId) return
                        const status = ev.status as typeof wsState
                        setWsState(sessionId, status)
                        if (status === 'connected') {
                            setWsConnectedAt(sessionId, Date.now())
                        }
                        if (status === 'disconnected' || status === 'error') {
                            setWsConnectedAt(sessionId, null)
                        }
                    },
                ],
                [
                    'ws-error',
                    (p) => {
                        const ev = p as WsErrorPayload
                        if (ev.session_id !== sessionId) return
                        addConsoleLog({
                            level: 'error',
                            source: 'request',
                            message: `WebSocket: ${ev.message}`,
                        })
                        setWsState(sessionId, 'error')
                    },
                ],
            ]

            for (const [event, handler] of handlers) {
                const unlisten = await listen(event, (e) => handler(e.payload))
                unlistenersRef.current.push(unlisten)
            }
        },
        [
            appendWsFrame,
            cleanupListeners,
            setWsConnectedAt,
            setWsHandshake,
            setWsState,
            addConsoleLog,
        ],
    )

    useEffect(() => {
        if (!activeTabId) return
        const tab = useAppStore.getState().tabs.find((t) => t.id === activeTabId)
        if (!tab || (tab.request.protocol ?? 'http') !== 'ws') {
            void cleanupListeners()
            return
        }
        if (subscribedTabRef.current !== activeTabId) {
            void setupListeners(activeTabId)
        }
    }, [activeTabId, cleanupListeners, setupListeners])

    useEffect(() => {
        return () => {
            void cleanupListeners()
        }
    }, [cleanupListeners])

    const connect = useCallback(async () => {
        if (!activeTabId) return
        const sessionId = activeTabId
        const req = useAppStore.getState().activeRequest
        if (!req.url?.trim()) {
            addConsoleLog({
                level: 'error',
                source: 'request',
                message: 'WebSocket URL is required',
            })
            return
        }

        clearWsFrames(sessionId)
        setWsHandshake(sessionId, null)
        setWsState(sessionId, 'connecting')

        try {
            const vars = getActiveEnvVars()
            const resolved = resolveWebSocketRequest(req, vars)
            await setupListeners(sessionId)
            await invoke('ws_connect', {
                sessionId,
                url: resolved.url,
                headers: resolved.headers,
                subprotocols: resolved.subprotocols || null,
            })
            addConsoleLog({
                level: 'info',
                source: 'request',
                message: `→ WS connect ${resolved.url}`,
            })
        } catch (err) {
            setWsState(sessionId, 'error')
            addConsoleLog({
                level: 'error',
                source: 'request',
                message: `WebSocket connect failed: ${String(err)}`,
            })
        }
    }, [
        activeTabId,
        addConsoleLog,
        clearWsFrames,
        setWsHandshake,
        setWsState,
        setupListeners,
    ])

    const disconnect = useCallback(async () => {
        if (!activeTabId) return
        try {
            await invoke('ws_disconnect', { sessionId: activeTabId })
        } catch {
            /* ignore */
        }
        setWsState(activeTabId, 'disconnected')
        setWsConnectedAt(activeTabId, null)
    }, [activeTabId, setWsConnectedAt, setWsState])

    const sendMessage = useCallback(
        async (data: string, isBinary = false) => {
            if (!activeTabId || !isConnected) return
            try {
                await invoke('ws_send', {
                    sessionId: activeTabId,
                    data,
                    isBinary,
                })
            } catch (err) {
                addConsoleLog({
                    level: 'error',
                    source: 'request',
                    message: `WebSocket send failed: ${String(err)}`,
                })
            }
        },
        [activeTabId, addConsoleLog, isConnected],
    )

    const sendPing = useCallback(async () => {
        if (!activeTabId || !isConnected) return
        try {
            await invoke('ws_send_ping', { sessionId: activeTabId, payload: null })
        } catch (err) {
            addConsoleLog({
                level: 'error',
                source: 'request',
                message: `WebSocket ping failed: ${String(err)}`,
            })
        }
    }, [activeTabId, addConsoleLog, isConnected])

    return {
        wsState,
        isConnected,
        isConnecting,
        connect,
        disconnect,
        sendMessage,
        sendPing,
        wsFrames: activeTab?.wsFrames ?? [],
        wsHandshake: activeTab?.wsHandshake ?? null,
        wsConnectedAt: activeTab?.wsConnectedAt ?? null,
        messageTemplate: activeRequest.messageTemplate ?? '',
    }
}
