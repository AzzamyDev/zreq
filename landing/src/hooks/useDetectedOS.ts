import { useMemo } from 'react'

export type DetectedOS = 'windows' | 'macos' | 'linux' | 'unknown'

export function useDetectedOS(): DetectedOS {
  return useMemo<DetectedOS>(() => {
    const uaData = (navigator as Navigator & {
      userAgentData?: { platform: string }
    }).userAgentData

    const platform = uaData?.platform ?? navigator.platform ?? ''
    const ua = navigator.userAgent

    if (/Win/i.test(platform) || /Win/i.test(ua)) return 'windows'
    if (/Mac/i.test(platform) || /Mac/i.test(ua)) return 'macos'
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux'
    return 'unknown'
  }, [])
}
