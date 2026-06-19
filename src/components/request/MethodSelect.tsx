import {
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
    const ringClass = METHOD_FOCUS_RING_CLASS[value] ?? 'focus:ring-ring'

    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`
                h-9 w-[105px] shrink-0 cursor-pointer appearance-none rounded-md border border-input/80
                px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-1
                bg-popover text-popover-foreground focus:ring-offset-background ${textClass} ${ringClass}
            `}
        >
            {METHODS.map((m) => (
                <option
                    key={m}
                    value={m}
                    className={`bg-popover ${METHOD_TEXT_CLASS[m] ?? 'text-popover-foreground'}`}
                >
                    {m}
                </option>
            ))}
        </select>
    )
}
