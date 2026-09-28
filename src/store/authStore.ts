import { create } from 'zustand'
import { setCurrentReplicaKey } from '@/lib/local-replica/snapshot-store'
import { useSyncStore } from '@/store/syncStore'
import { useAppStore } from '@/store'

interface User {
    id: number
    name: string
    email: string
    /** false = GitHub/OAuth-only; sync via GET /users/:id if missing (legacy session). */
    hasPassword?: boolean
}

interface AuthState {
    token: string | null
    user: User | null
    isAuthenticated: boolean
    setAuth: (token: string, user: User) => void
    logout: () => void
}

const TOKEN_KEY = 'zreq_token'
const USER_KEY = 'zreq_user'

function loadFromStorage(): { token: string | null; user: User | null } {
    try {
        const token = localStorage.getItem(TOKEN_KEY)
        const userRaw = localStorage.getItem(USER_KEY)
        const user = userRaw ? (JSON.parse(userRaw) as User) : null
        return { token, user }
    } catch {
        return { token: null, user: null }
    }
}

const { token: storedToken, user: storedUser } = loadFromStorage()

export const useAuthStore = create<AuthState>()((set) => ({
    token: storedToken,
    user: storedUser,
    isAuthenticated: !!storedToken,

    setAuth: (token, user) => {
        localStorage.setItem(TOKEN_KEY, token)
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        set({ token, user, isAuthenticated: true })
    },

    logout: () => {
        setCurrentReplicaKey(null)
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        // Clear in-memory sync state so stale workspaces/collections/conflicts from the
        // previous account never bleed into the next session on the same machine.
        useSyncStore.getState().reset()
        useAppStore.getState().resetRemoteSessionState()
        set({ token: null, user: null, isAuthenticated: false })
    },
}))
