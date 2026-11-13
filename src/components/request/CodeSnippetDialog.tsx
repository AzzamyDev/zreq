import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { useAppStore } from '../../store'
import { getActiveEnvVars, resolveRequest } from '../../lib/env-resolver'
import { buildCodeSnippet, type SnippetKind } from '../../lib/code-snippet'

interface CodeSnippetDialogProps {
    open: boolean
    onClose: () => void
}

const KINDS: { id: SnippetKind; labelKey: 'request.codeCurl' | 'request.codeFetch' | 'request.codePython' }[] = [
    { id: 'curl', labelKey: 'request.codeCurl' },
    { id: 'fetch', labelKey: 'request.codeFetch' },
    { id: 'python', labelKey: 'request.codePython' },
]

export default function CodeSnippetDialog({ open, onClose }: CodeSnippetDialogProps) {
    const { t } = useTranslation()
    const activeRequest = useAppStore((s) => s.activeRequest)
    const environments = useAppStore((s) => s.environments)
    const collections = useAppStore((s) => s.collections)
    const activeEnvironmentId = useAppStore((s) => s.activeEnvironmentId)
    const [kind, setKind] = useState<SnippetKind>('curl')

    const snippet = useMemo(() => {
        if (!open) return ''
        const url = (activeRequest.url || '').trim()
        if (!url && activeRequest.params.every((param) => !param.key)) return ''
        const resolved = resolveRequest(activeRequest, getActiveEnvVars())
        return buildCodeSnippet(kind, resolved)
    }, [open, kind, activeRequest, environments, collections, activeEnvironmentId])

    const handleCopy = async () => {
        if (!snippet) return
        try {
            await navigator.clipboard.writeText(snippet)
            toast.success(t('response.copied'))
        } catch {
            toast.error(t('request.codeCopyFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t('request.codeTitle')}</DialogTitle>
                    <DialogDescription>{t('request.codeDescription')}</DialogDescription>
                </DialogHeader>
                <div className="flex gap-1">
                    {KINDS.map((item) => (
                        <Button
                            key={item.id}
                            type="button"
                            size="sm"
                            variant={kind === item.id ? 'default' : 'outline'}
                            onClick={() => setKind(item.id)}
                        >
                            {t(item.labelKey)}
                        </Button>
                    ))}
                </div>
                {snippet ? (
                    <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                        {snippet}
                    </pre>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('request.codeEmptyUrl')}</p>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('common.close')}
                    </Button>
                    <Button onClick={() => void handleCopy()} disabled={!snippet}>
                        {t('response.copy')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
