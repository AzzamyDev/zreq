/** HTTP method colors — aligned with sidebar request badges (Dracula palette). */
import { inferProtocolFromUrl } from './persist-request'
export const METHOD_TEXT_CLASS: Record<string, string> = {
    GET: 'text-[var(--dracula-green)]',
    POST: 'text-[var(--dracula-cyan)]',
    PUT: 'text-[var(--dracula-orange)]',
    PATCH: 'text-[var(--dracula-yellow)]',
    DELETE: 'text-[var(--dracula-red)]',
    HEAD: 'text-[var(--muted-foreground)]',
    OPTIONS: 'text-[var(--muted-foreground)]',
    WS: 'text-[var(--dracula-cyan)]',
}

/** CSS color values for inline styles (beat menu focus:text overrides). */
export const METHOD_COLOR: Record<string, string> = {
    GET: 'var(--dracula-green)',
    POST: 'var(--dracula-cyan)',
    PUT: 'var(--dracula-orange)',
    PATCH: 'var(--dracula-yellow)',
    DELETE: 'var(--dracula-red)',
    HEAD: 'var(--muted-foreground)',
    OPTIONS: 'var(--muted-foreground)',
    WS: 'var(--dracula-cyan)',
}

export const METHOD_BG_CLASS: Record<string, string> = {
    GET: 'bg-[#50fa7b]/14',
    POST: 'bg-[#8be9fd]/14',
    PUT: 'bg-[#ffb86c]/14',
    PATCH: 'bg-[#f1fa8c]/12',
    DELETE: 'bg-[#ff5555]/14',
    HEAD: 'bg-[var(--sidebar-row-hover)]',
    OPTIONS: 'bg-[var(--sidebar-row-hover)]',
    WS: 'bg-[#8be9fd]/14',
}

/** Focus ring tint per method (avoids generic purple ring on method picker). */
export const METHOD_FOCUS_RING_CLASS: Record<string, string> = {
    GET: 'focus:ring-[var(--dracula-green)]/40',
    POST: 'focus:ring-[var(--dracula-cyan)]/40',
    PUT: 'focus:ring-[var(--dracula-orange)]/40',
    PATCH: 'focus:ring-[var(--dracula-yellow)]/40',
    DELETE: 'focus:ring-[var(--dracula-red)]/40',
    HEAD: 'focus:ring-[var(--muted-foreground)]/35',
    OPTIONS: 'focus:ring-[var(--muted-foreground)]/35',
    WS: 'focus:ring-[var(--dracula-cyan)]/40',
}

export function requestBadgeLabel(item: { protocol?: string; method?: string; url?: string }): string {
    return inferProtocolFromUrl(item.url ?? '', item.protocol) === 'ws' ? 'WS' : item.method || 'GET'
}
