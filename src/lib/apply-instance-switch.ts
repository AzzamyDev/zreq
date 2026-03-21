import { useInstanceStore } from '@/store/instanceStore'
import { useAppStore } from '@/store'
import { useAuthStore } from '@/store/authStore'

export function applyInstanceSwitch(nextActiveId: string) {
    if (useInstanceStore.getState().activeInstanceId === nextActiveId) return
    useInstanceStore.getState().setActiveInstanceId(nextActiveId)
    useAppStore.getState().resetRemoteSessionState()
    useAuthStore.getState().logout()
}

/** After URL change on active instance, or removeInstance moved active to another backend */
export function refreshSessionForCurrentBackend() {
    useAppStore.getState().resetRemoteSessionState()
    useAuthStore.getState().logout()
}
