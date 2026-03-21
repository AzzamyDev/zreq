import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useInstanceStore } from '../store/instanceStore'

const FALLBACK_BASE =
    (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001'

export const apiClient = axios.create({
    baseURL: FALLBACK_BASE,
    headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
    config.baseURL = useInstanceStore.getState().getActiveBaseUrl()
    const token = useAuthStore.getState().token
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            useAuthStore.getState().logout()
        }
        return Promise.reject(err)
    }
)
