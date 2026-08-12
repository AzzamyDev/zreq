/** Quick-fill presets for MCP OAuth client form (one agent → one redirect). */
export const MCP_AGENT_PRESETS = [
    {
        id: 'cursor',
        purpose: 'Cursor',
        client_name: 'ZReq MCP — Cursor',
        redirect_uris: [
            'https://www.cursor.com/agents/mcp/oauth/callback',
            'http://localhost:8787/callback'
        ],
        token_endpoint_auth_method: 'none' as const
    },
    {
        id: 'claude',
        purpose: 'Claude',
        client_name: 'ZReq MCP — Claude',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        token_endpoint_auth_method: 'client_secret_basic' as const
    }
] as const

export function parseRedirectUrisField(raw: string): string[] {
    return raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
}
