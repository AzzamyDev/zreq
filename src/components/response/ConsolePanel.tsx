import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store'
import { ConsoleEntry } from '../../types'

const LEVEL_STYLES: Record<ConsoleEntry['level'], string> = {
    log: 'text-foreground',
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
}

const SOURCE_LABELS: Record<ConsoleEntry['source'], string> = {
    script: 'script',
    request: 'req',
    response: 'res',
}

export default function ConsolePanel() {
    const { t } = useTranslation()
    const logs = useAppStore(s => s.consoleLogs)
    const clearLogs = useAppStore(s => s.clearConsoleLogs)

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-1 border-b">
                <span className="text-xs text-muted-foreground">{t('response.entries', { count: logs.length })}</span>
                <button onClick={clearLogs} className="text-xs text-muted-foreground hover:text-foreground">
                    {t('response.clear')}
                </button>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">{t('response.noConsoleOutput')}</p>
                ) : (
                    logs.map(entry => (
                        <div key={entry.id} className={`flex gap-2 px-3 py-0.5 hover:bg-muted/30 ${LEVEL_STYLES[entry.level]}`}>
                            <span className="text-muted-foreground shrink-0">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="text-muted-foreground shrink-0 uppercase text-[10px]">
                                [{SOURCE_LABELS[entry.source]}]
                            </span>
                            <span className="break-all">{entry.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
