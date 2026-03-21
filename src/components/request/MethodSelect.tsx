import {
    METHOD_BG_CLASS,
    METHOD_FOCUS_RING_CLASS,
    METHOD_TEXT_CLASS,
} from '../../lib/httpMethodTheme'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

interface MethodSelectProps {
    value: string
    onChange: (val: string) => void
}

export default function MethodSelect({ value, onChange }: MethodSelectProps) {
    const textClass = METHOD_TEXT_CLASS[value] ?? 'text-foreground'
    const bgClass = METHOD_BG_CLASS[value] ?? 'bg-background'
    const ringClass = METHOD_FOCUS_RING_CLASS[value] ?? 'focus:ring-ring'

    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`
                h-9 w-[105px] shrink-0 cursor-pointer appearance-none rounded-md border border-input/80
                px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-1
                focus:ring-offset-background ${textClass} ${bgClass} ${ringClass}
            `}
        >
            {METHODS.map((m) => (
                <option key={m} value={m} className={METHOD_TEXT_CLASS[m] ?? ''}>
                    {m}
                </option>
            ))}
        </select>
    )
}
