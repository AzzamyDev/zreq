import { apiClient } from '@/lib/api-client'
import type { WorkspaceMemberEntry } from '@/types'

type ListRes = { message: string; data: WorkspaceMemberEntry[] }
type AddRes = { message: string; data: WorkspaceMemberEntry }

export async function fetchWorkspaceMembers(workspaceId: number): Promise<WorkspaceMemberEntry[]> {
    const res = await apiClient.get<ListRes>(`/workspaces/${workspaceId}/members`)
    return res.data.data ?? []
}

export async function inviteWorkspaceMember(workspaceId: number, email: string): Promise<WorkspaceMemberEntry> {
    const res = await apiClient.post<AddRes>(`/workspaces/${workspaceId}/members`, { email })
    return res.data.data
}

export async function removeWorkspaceMember(workspaceId: number, memberUserId: number): Promise<void> {
    await apiClient.delete(`/workspaces/${workspaceId}/members/${memberUserId}`)
}
