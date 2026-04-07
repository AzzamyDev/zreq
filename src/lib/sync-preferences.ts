/** How local edits (outbox) are uploaded to the server. */
export type SyncPushStrategy = 'debounced' | 'manual' | 'interval'

const KEY_STRATEGY = 'zreq_sync_push_strategy'
const KEY_INTERVAL_MIN = 'zreq_sync_push_interval_min'

const DEFAULT_STRATEGY: SyncPushStrategy = 'debounced'
const DEFAULT_INTERVAL_MIN = 2

export const SYNC_PREFS_CHANGED = 'zreq-sync-prefs-changed'

export function getSyncPushStrategy(): SyncPushStrategy {
    try {
        const v = localStorage.getItem(KEY_STRATEGY)
        if (v === 'manual' || v === 'interval' || v === 'debounced') return v
    } catch {
        /* ignore */
    }
    return DEFAULT_STRATEGY
}

export function setSyncPushStrategy(s: SyncPushStrategy) {
    try {
        localStorage.setItem(KEY_STRATEGY, s)
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event(SYNC_PREFS_CHANGED))
}

/** Interval for periodic push when strategy is `interval` (ms). */
export function getSyncPushIntervalMs(): number {
    try {
        const raw = localStorage.getItem(KEY_INTERVAL_MIN)
        const m = raw != null ? Number(raw) : DEFAULT_INTERVAL_MIN
        if (Number.isFinite(m) && m >= 1 && m <= 120) return Math.round(m) * 60_000
    } catch {
        /* ignore */
    }
    return DEFAULT_INTERVAL_MIN * 60_000
}

export function setSyncPushIntervalMinutes(minutes: number) {
    const m = Math.max(1, Math.min(120, Math.round(minutes)))
    try {
        localStorage.setItem(KEY_INTERVAL_MIN, String(m))
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event(SYNC_PREFS_CHANGED))
}

export function shouldDebouncePushAfterLocalEdit(): boolean {
    return getSyncPushStrategy() === 'debounced'
}

/** Background probe / focus: full pull+push (legacy aggressive sync). */
export function shouldBackgroundPullThenPush(): boolean {
    return getSyncPushStrategy() === 'debounced'
}
