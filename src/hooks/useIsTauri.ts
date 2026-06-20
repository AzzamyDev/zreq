import { isTauri as checkIsTauri } from '@tauri-apps/api/core'

/** Sync — jangan async, layout macOS harus benar dari frame pertama. */
export function useIsTauri(): boolean {
    return checkIsTauri()
}
