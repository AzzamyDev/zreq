import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { DEFAULT_FALLBACK, useInstanceStore } from '../store/instanceStore'

export const apiClient = axios.create({
    baseURL: DEFAULT_FALLBACK,
    headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
    const baseUrl = useInstanceStore.getState().getActiveBaseUrl()
    config.baseURL = baseUrl
    // Bypass ngrok free-tier browser warning interstitial for all API requests
    if (baseUrl.includes('ngrok')) {
        config.headers['ngrok-skip-browser-warning'] = '1'
    }
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
