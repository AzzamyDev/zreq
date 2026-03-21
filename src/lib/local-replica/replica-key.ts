import { normalizeBaseUrl } from '@/store/instanceStore'

export function makeReplicaKey(baseUrlRaw: string, userId: number): string {
    const base = normalizeBaseUrl(baseUrlRaw) ?? baseUrlRaw.trim()
    return `${base}|${userId}`
}
