import { useEffect, useState } from 'react'

let cached: boolean | null = null

export function useIsTauri(): boolean {
    const [isTauri, setIsTauri] = useState(cached ?? false)

    useEffect(() => {
        if (cached !== null) {
            setIsTauri(cached)
            return
        }
        void import('@tauri-apps/api/core').then(({ isTauri: check }) => {
            cached = check()
            setIsTauri(cached)
        })
    }, [])

    return isTauri
}
