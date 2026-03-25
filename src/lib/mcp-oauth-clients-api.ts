import { apiClient } from '@/lib/api-client'

export type McpOAuthClientRow = {
    id: number
    client_id: string
    client_name: string
    purpose: string | null
    redirect_uris: string[]
    token_endpoint_auth_method: string
    created_at: string
    updated_at: string
}

export type McpOAuthClientCreated = McpOAuthClientRow & { client_secret: string }

export async function listMcpOAuthClients() {
    const res = await apiClient.get<{ data: McpOAuthClientRow[] }>('/mcp-oauth-clients')
    return res.data.data
}

export async function createMcpOAuthClient(body: {
    purpose?: string
    client_name: string
    redirect_uris: string[]
    token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic'
}) {
    const res = await apiClient.post<{ data: McpOAuthClientCreated }>('/mcp-oauth-clients', body)
    return res.data.data
}

export async function updateMcpOAuthClient(
    id: number,
    body: Partial<{
        purpose: string | null
        client_name: string
        redirect_uris: string[]
        token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic'
    }>
) {
    const res = await apiClient.patch<{ data: McpOAuthClientRow }>(`/mcp-oauth-clients/${id}`, body)
    return res.data.data
}

export async function deleteMcpOAuthClient(id: number) {
    await apiClient.delete(`/mcp-oauth-clients/${id}`)
}

export async function rotateMcpOAuthClientSecret(id: number) {
    const res = await apiClient.post<{ data: { client_id: string; client_secret: string } }>(
        `/mcp-oauth-clients/${id}/rotate-secret`
    )
    return res.data.data
}
