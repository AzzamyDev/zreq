export const isMacOS = () =>
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/** Spacer kiri = trafficLightPosition.x (15) + 3 tombol (~63px). Jangan ubah tauri.macos.conf.json. */
export const MACOS_TRAFFIC_SPACER = 'w-[88px] shrink-0'

/** Integrated title strip height on macOS. */
export const MACOS_TITLEBAR_H = 'h-[52px]'

/** Auth / onboarding slim chrome on macOS. */
export const MACOS_DRAG_HEADER_H = 'h-10'

export const macTitlebarActive = (isTauri: boolean) => isTauri && isMacOS()

/** fullscreen → 0px; windowed/maximize → MACOS_TRAFFIC_SPACER */
export const macTrafficSpacerClass = (fullscreen: boolean) =>
    fullscreen ? 'w-4 shrink-0' : MACOS_TRAFFIC_SPACER
