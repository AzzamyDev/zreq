import { invoke } from '@tauri-apps/api/core'
import type { HttpRequest, HttpResponse } from '../types'

export async function sendRequest(req: HttpRequest): Promise<HttpResponse> {
    const result = await invoke<{
        status: number
        status_text: string
        headers: Record<string, string>
        set_cookies?: string[]
        body: string
        duration_ms: number
        size_bytes: number
    }>('send_request', {
        payload: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body ?? null,
            body_type: req.bodyType,
        },
    })
    return {
        status: result.status,
        statusText: result.status_text,
        headers: result.headers,
        cookies: result.set_cookies ?? [],
        body: result.body,
        durationMs: result.duration_ms,
        sizeBytes: result.size_bytes,
    }
}
