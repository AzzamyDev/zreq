/** Quick-fill presets for MCP OAuth client form (one agent → one redirect). */
export const MCP_AGENT_PRESETS = [
    {
        id: 'cursor',
        purpose: 'Cursor',
        client_name: 'ZReq MCP — Cursor',
        redirect_uri: 'cursor://anysphere.cursor-mcp/oauth/callback'
    },
    {
        id: 'claude',
        purpose: 'Claude',
        client_name: 'ZReq MCP — Claude',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback'
    }
] as const

export function parseRedirectUrisField(raw: string): string[] {
    return raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
}
