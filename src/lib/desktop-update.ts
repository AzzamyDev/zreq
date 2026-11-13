import { invoke, isTauri } from '@tauri-apps/api/core'

export type DesktopUpdateStatus = {
    available: boolean
    version: string
    notes: string
    currentVersion: string
}

export async function checkDesktopUpdate(baseUrl: string): Promise<DesktopUpdateStatus> {
    if (!isTauri()) {
        return { available: false, version: '', notes: '', currentVersion: '' }
    }
    return invoke<DesktopUpdateStatus>('check_desktop_update', { baseUrl })
}

export async function installDesktopUpdate(baseUrl: string): Promise<void> {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await invoke('install_desktop_update', { baseUrl })
    await relaunch()
}
