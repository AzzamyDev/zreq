import { useEffect, useState } from 'react'
import { useIsTauri } from '@/hooks/useIsTauri'
import { isMacOS } from '@/lib/platform'

export function useMacWindowFullscreen() {
    const isTauri = useIsTauri()
    const macOS = isMacOS()
    const [fullscreen, setFullscreen] = useState(false)

    useEffect(() => {
        if (!isTauri || !macOS) return

        let unlistenResize: (() => void) | undefined
        let unlistenFocus: (() => void) | undefined

        void (async () => {
            const { getCurrentWindow } = await import('@tauri-apps/api/window')
            const win = getCurrentWindow()

            const sync = async () => {
                setFullscreen(await win.isFullscreen())
            }

            await sync()
            unlistenResize = await win.onResized(() => {
                void sync()
            })
            unlistenFocus = await win.onFocusChanged(() => {
                void sync()
            })
        })()

        return () => {
            unlistenResize?.()
            unlistenFocus?.()
        }
    }, [isTauri, macOS])

    return fullscreen
}
