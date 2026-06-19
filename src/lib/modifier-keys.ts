export function isApplePlatform() {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

/** Ctrl+click (Windows/Linux) or ⌘+click (macOS) — toggle multi-select */
export function isToggleSelectModifier(e: Pick<MouseEvent, 'metaKey' | 'ctrlKey'>) {
    return isApplePlatform() ? e.metaKey : e.metaKey || e.ctrlKey
}

/** Shift+click — range select */
export function isRangeSelectModifier(e: Pick<MouseEvent, 'shiftKey'>) {
    return e.shiftKey
}
