/** Shared styles for collection sidebar “⋯” overflow menus */
export const SIDEBAR_MORE_MENU_OUTER =
    'absolute right-0 top-full z-[200] isolate flex min-w-[220px] max-w-[min(100vw-1rem,320px)] flex-col items-stretch pt-1'

export const SIDEBAR_MORE_MENU_PANEL =
    'flex w-full flex-col items-stretch rounded-xl border border-border/50 bg-popover p-1.5 text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.65)] ring-1 ring-foreground/[0.06]'

export const SIDEBAR_MORE_MENU_ITEM =
    'flex w-full cursor-pointer items-center justify-start rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-(--sidebar-row-hover) focus-visible:bg-(--sidebar-row-hover) focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0'
