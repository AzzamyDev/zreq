/**
 * Vaul/Radix Drawer treats portaled UI (popover, select, VarTemplateField tooltips)
 * as "outside" the drawer. Interacting with them would close the drawer and unmount the popup.
 */
export function isPortaledLayerOutsideDrawer(target: EventTarget | null): boolean {
    const el = target instanceof HTMLElement ? target : null
    if (!el) return false
    return !!(
        el.closest('[data-slot="popover-content"]') ||
        el.closest('[data-slot="select-content"]') ||
        el.closest('[data-var-template-suggest]') ||
        el.closest('[data-var-extract-popover]') ||
        el.closest('[data-var-value-panel]')
    )
}

export function preventDrawerDismissForPortaledLayer(
    e: { preventDefault: () => void },
    target: EventTarget | null,
): void {
    if (isPortaledLayerOutsideDrawer(target)) e.preventDefault()
}

/** Focus moved into a portaled layer while drawer is open. */
export function preventDrawerFocusDismiss(e: { preventDefault: () => void }): void {
    const active = document.activeElement
    if (active instanceof HTMLElement && isPortaledLayerOutsideDrawer(active)) e.preventDefault()
}
