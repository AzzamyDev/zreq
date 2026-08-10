import { cn } from '@/lib/utils'
import type { HttpResponse } from '../../types'

interface ResponseStatsProps {
    response: HttpResponse
    className?: string
}

export function getStatusColor(status: number): string {
    if (status === 0) return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
    if (status < 300) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    if (status < 400) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    if (status < 500) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`
    return `${(ms / 1000).toFixed(2)} s`
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function ResponseStats({ response, className }: ResponseStatsProps) {
    const statusColor = getStatusColor(response.status)

    return (
        <div
            className={cn('flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30', className)}
        >
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusColor}`}>
                {response.status} {response.statusText}
            </span>
            <span className="text-xs text-muted-foreground">
                {formatDuration(response.durationMs)}
            </span>
            <span className="text-xs text-muted-foreground">
                {formatSize(response.sizeBytes)}
            </span>
        </div>
    )
}
