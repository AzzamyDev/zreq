import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { probeBackendReachable, validatezreqBackend } from '@/lib/probe-backend'
import { DEFAULT_FALLBACK, normalizeBaseUrl, useInstanceStore } from '@/store/instanceStore'
import AuthShell from './AuthShell'

export default function InstanceOnboarding() {
    const { t } = useTranslation()
    const complete = useInstanceStore((s) => s.completeInstanceOnboarding)
    const skipDefaults = useInstanceStore((s) => s.skipInstanceOnboardingWithDefaults)

    const defaultUrl = DEFAULT_FALLBACK

    const [name, setName] = useState('')
    const [url, setUrl] = useState(defaultUrl)

    useEffect(() => {
        const { instances, activeInstanceId } = useInstanceStore.getState()
        const active = instances.find((i) => i.id === activeInstanceId)
        if (active) {
            setName(active.name)
            setUrl(active.baseUrl)
        }
    }, [])
    const [urlErr, setUrlErr] = useState('')
    const [probeOk, setProbeOk] = useState<boolean | null>(null)
    const [probeBusy, setProbeBusy] = useState(false)
    const [submitBusy, setSubmitBusy] = useState(false)

    const runProbe = async () => {
        setUrlErr('')
        setProbeOk(null)
        const n = normalizeBaseUrl(url)
        if (!n) {
            setUrlErr(t('instance.invalidUrl'))
            return
        }
        setProbeBusy(true)
        try {
            const ok = await probeBackendReachable(n)
            setProbeOk(ok)
        } finally {
            setProbeBusy(false)
        }
    }

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setUrlErr('')
        setSubmitBusy(true)
        const v = await validatezreqBackend(url)
        if (!v.ok) {
            setUrlErr(
                t(
                    v.code === 'invalid_url'
                        ? 'instance.invalidUrl'
                        : v.code === 'unreachable'
                          ? 'instance.backendUnreachable'
                          : 'instance.backendInvalidResponse'
                )
            )
            setSubmitBusy(false)
            return
        }
        const r = complete(name, v.baseUrl)
        if (!r.ok) {
            setUrlErr(t('instance.invalidUrl'))
        }
        setSubmitBusy(false)
    }

    return (
        <AuthShell
            pill={t('onboarding.pill')}
            title={t('onboarding.title')}
            description={t('onboarding.description')}
        >
            <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="ob-name">{t('onboarding.instanceName')}</Label>
                    <Input
                        id="ob-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('instance.namePlaceholder')}
                        className="h-10 bg-background/60"
                        autoComplete="off"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="ob-url">{t('instance.baseUrl')}</Label>
                    <Input
                        id="ob-url"
                        value={url}
                        onChange={(e) => {
                            setUrl(e.target.value)
                            setProbeOk(null)
                            setUrlErr('')
                        }}
                        placeholder={t('instance.urlPlaceholder')}
                        className="h-10 bg-background/60 font-mono text-[13px]"
                        autoComplete="url"
                        spellCheck={false}
                    />
                    {urlErr ? <p className="text-destructive text-xs">{urlErr}</p> : null}
                    {probeOk === true ? (
                        <p className="text-(--dracula-green) flex items-center gap-1.5 text-xs">
                            <Radio className="size-3.5" aria-hidden />
                            {t('onboarding.reachable')}
                        </p>
                    ) : null}
                    {probeOk === false ? (
                        <p className="text-destructive text-xs">{t('onboarding.unreachable')}</p>
                    ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="h-10 w-full sm:w-auto"
                        disabled={probeBusy}
                        onClick={() => void runProbe()}
                    >
                        {probeBusy ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                {t('onboarding.testing')}
                            </>
                        ) : (
                            t('onboarding.testConnection')
                        )}
                    </Button>
                </div>

                <Button type="submit" size="lg" className="h-11 w-full" disabled={submitBusy}>
                    {submitBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t('onboarding.continue')}
                </Button>

                <div className="border-border/60 space-y-3 border-t pt-5">
                    <p className="text-muted-foreground text-center text-xs">{t('onboarding.skipHint')}</p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        className="text-muted-foreground hover:text-foreground h-10 w-full"
                        onClick={() => skipDefaults()}
                    >
                        {t('onboarding.useLocalDefaults')}
                    </Button>
                </div>
            </form>
        </AuthShell>
    )
}
