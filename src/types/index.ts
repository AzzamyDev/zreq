export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type KV = {
    id: string
    key: string
    value: string
    enabled: boolean
}

export type BodyType = 'json' | 'form-data' | 'urlencoded' | 'raw' | 'none'

export type RequestBody = {
    type: BodyType
    content: string
}

export type AuthConfig =
    | { type: 'none' }
    | { type: 'inherit' }
    | { type: 'bearer'; token: string }
    | { type: 'basic'; username: string; password: string }
    | { type: 'jwt'; token: string; prefix: string }

/** User who last wrote this row (from API sync). */
export type ActorSummary = { id: number; name: string; email: string }

export type EnvVariable = {
    id?: number
    key: string
    value: string
    enabled: boolean
    /** From API (EnvironmentVariable row); optional for locally drafted rows. */
    createdAt?: string
    updatedAt?: string
    lastUpdatedBy?: ActorSummary
}

export type RequestItem = {
    id: string
    type: 'request'
    name: string
    method: HttpMethod
    url: string
    headers: KV[]
    params: KV[]
    body: RequestBody
    auth: AuthConfig
    scripts?: {
        preRequest?: string
        postResponse?: string
    }
}

export type Folder = {
    id: string
    type: 'folder'
    name: string
    description?: string
    auth?: AuthConfig
    variables?: EnvVariable[]
    items: (Folder | RequestItem)[]
}

export type Workspace = {
    id: number
    name: string
    userId: number
    createdAt: string
    updatedAt: string
}

/** From GET /workspaces/:id/members */
export type WorkspaceMemberEntry = {
    user: ActorSummary
    isOwner: boolean
}

export type Collection = {
    id: number
    name: string
    description?: string
    auth?: AuthConfig
    variables?: EnvVariable[]
    items: (Folder | RequestItem)[]
    userId: number
    workspaceId: number
    createdAt: string
    updatedAt: string
    lastUpdatedBy?: ActorSummary
}

export type Environment = {
    id: number
    name: string
    variables: EnvVariable[]
    workspaceId: number
    createdAt: string
    updatedAt: string
    lastUpdatedBy?: ActorSummary
}

export type HttpRequest = {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
    bodyType: BodyType
}

export type HttpResponse = {
    status: number
    statusText: string
    headers: Record<string, string>
    /** Raw `Set-Cookie` header lines (multiple cookies preserved). */
    cookies?: string[]
    body: string
    durationMs: number
    sizeBytes: number
}

export type ActiveRequest = {
    method: HttpMethod
    url: string
    headers: KV[]
    params: KV[]
    body: RequestBody
    auth: AuthConfig
    name: string
    collectionId?: number
    itemId?: string
    folderId?: string
    scripts?: {
        preRequest?: string
        postResponse?: string
    }
}

export type ConsoleEntry = {
    id: string
    timestamp: number
    level: 'log' | 'warn' | 'error' | 'info'
    source: 'script' | 'request' | 'response'
    message: string
}

export type RequestTab = {
    id: string
    name: string
    method: string
    isDirty: boolean
    request: ActiveRequest
    /** Last HTTP response for this tab (global `response` mirrors the active tab). */
    response: HttpResponse | null
}
