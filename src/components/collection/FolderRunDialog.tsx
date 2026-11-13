import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { sendHttpRequest } from '@/lib/send-http'
import type { ActiveRequest } from '@/types'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type RowState = 'wait' | 'run' | 'pass' | 'fail' | 'sent'

type Row = {
    key: string
    name: string
    method: string
    state: RowState
    status?: number
}

type FolderRunDialogProps = {
    open: boolean
    title: string
    requests: ActiveRequest[]
    onClose: () => void
}

function outcome(status: number, failedChecks: number, checkCount: number): RowState {
    if (status === 0 || failedChecks > 0) return 'fail'
    if (checkCount === 0) return 'sent'
    return 'pass'
}

export default function FolderRunDialog({ open, title, requests, onClose }: FolderRunDialogProps) {
    const { t } = useTranslation()
    const [rows, setRows] = useState<Row[]>([])
    const [running, setRunning] = useState(false)
    const [nonce, setNonce] = useState(0)
    const requestsRef = useRef(requests)
    requestsRef.current = requests

    useEffect(() => {
        if (!open) return
        const batch = requestsRef.current
        let cancelled = false
        const initial = batch.map((request, index) => ({
            key: `${request.itemId ?? request.name}-${index}`,
            name: request.name,
            method: request.method,
            state: 'wait' as RowState,
        }))
        setRows(initial)
        if (batch.length === 0) return

        const run = async () => {
            setRunning(true)
            for (let index = 0; index < batch.length; index += 1) {
                if (cancelled) return
                setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, state: 'run' } : row)))
                const result = await sendHttpRequest(batch[index])
                if (cancelled) return
                const failed = result.checks.filter((check) => !check.pass).length
                const state = outcome(result.response.status, failed, result.checks.length)
                setRows((current) =>
                    current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, state, status: result.response.status } : row,
                    ),
                )
            }
            if (!cancelled) setRunning(false)
        }
        void run()
        return () => {
            cancelled = true
            setRunning(false)
        }
    }, [open, nonce])

    const passed = rows.filter((row) => row.state === 'pass').length
    const failed = rows.filter((row) => row.state === 'fail').length
    const sent = rows.filter((row) => row.state === 'sent').length

    const label = (state: RowState) => {
        if (state === 'run') return t('collection.runRunning')
        if (state === 'pass') return t('collection.runPassed')
        if (state === 'fail') return t('collection.runFailed')
        if (state === 'sent') return t('collection.runSent')
        return t('collection.runWaiting')
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('collection.runTitle', { name: title })}</DialogTitle>
                </DialogHeader>
                {requests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('collection.runEmpty')}</p>
                ) : (
                    <div className="max-h-80 space-y-1 overflow-auto">
                        <p className="pb-2 text-sm text-muted-foreground">
                            {t('collection.runSummary', { passed, failed, sent })}
                        </p>
                        {rows.map((row) => (
                            <div key={row.key} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
                                <span className="w-14 shrink-0 text-xs text-muted-foreground">{row.method}</span>
                                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                                <span
                                    className={
                                        row.state === 'fail'
                                            ? 'text-destructive'
                                            : row.state === 'pass'
                                              ? 'text-green-600'
                                              : 'text-muted-foreground'
                                    }
                                >
                                    {row.status !== undefined && row.state !== 'wait' && row.state !== 'run' ? `${row.status} · ` : ''}
                                    {label(row.state)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t('collection.runClose')}
                    </Button>
                    <Button
                        type="button"
                        disabled={running || requests.length === 0}
                        onClick={() => setNonce((value) => value + 1)}
                    >
                        {running ? t('collection.runRunning') : t('collection.runAgain')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
