import { create } from 'zustand'
import { setCurrentReplicaKey } from '@/lib/local-replica/snapshot-store'

interface User {
    id: number
    name: string
    email: string
}

interface AuthState {
    token: string | null
    user: User | null
    isAuthenticated: boolean
    setAuth: (token: string, user: User) => void
    logout: () => void
}

const TOKEN_KEY = 'postwoman_token'
const USER_KEY = 'postwoman_user'

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
        set({ token: null, user: null, isAuthenticated: false })
    },
}))
