import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { flushSync } from 'react-dom'
import { useAppStore } from '../../store'
import MethodSelect from './MethodSelect'
import type { HttpMethod } from '../../types'
import VarTemplateField from './VarTemplateField'
import { Send, SendHorizonal } from 'lucide-react'

interface UrlBarProps {
    onSend: () => void
    isLoading: boolean
}

export default function UrlBar({ onSend, isLoading }: UrlBarProps) {
    const { t } = useTranslation()
    const { activeRequest, setActiveRequest } = useAppStore()

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                if (!isLoading) onSend()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onSend, isLoading])

    return (
        <div className="relative flex items-center gap-2">
            <MethodSelect
                value={activeRequest.method}
                onChange={(val) => setActiveRequest({ method: val as HttpMethod })}
            />

            <div className="flex h-9 min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-input bg-[#1a1b26]">
                <VarTemplateField
                    value={activeRequest.url || ''}
                    onChange={(url) => {
                        flushSync(() => setActiveRequest({ url }))
                    }}
                    onMetaEnter={() => {
                        if (!isLoading) onSend()
                    }}
                    metaEnterDisabled={isLoading}
                    className="w-full min-w-0 border-y border-[color-mix(in_srgb,#6272a4_38%,transparent)] bg-[#16171f] px-2 py-1"
                />
            </div>

            <button
                onClick={onSend}
                disabled={isLoading}
                className="flex cursor-pointer h-9 min-w-[72px] shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {isLoading ? (
                    <>
                        <svg
                            className="h-4 w-4 animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                        </svg>
                        <span>{t('request.sending')}</span>
                    </>
                ) : (
                    <div className="flex items-center gap-2">
                        <SendHorizonal className="size-4" />
                        <span>{t('request.send')}</span>
                    </div>
                )}
            </button>
        </div>
    )
}
