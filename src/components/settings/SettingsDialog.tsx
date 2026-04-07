import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Palette, Info, Server, KeyRound, X } from 'lucide-react'
import { setThemeAccent } from '@/lib/themeAccent'
import { setAppLocale } from '@/i18n/config'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useInstanceStore } from '@/store/instanceStore'
import { applyInstanceSwitch } from '@/lib/apply-instance-switch'
import { validatezreqBackend } from '@/lib/probe-backend'
import { MCP_AGENT_PRESETS, parseRedirectUrisField } from '@/lib/mcp-oauth-redirects'
import {
    createMcpOAuthClient,
    deleteMcpOAuthClient,
    listMcpOAuthClients,
    rotateMcpOAuthClientSecret,
    updateMcpOAuthClient,
    type McpOAuthClientRow
} from '@/lib/mcp-oauth-clients-api'
import { useAuthStore } from '@/store/authStore'
import type { SyncPushStrategy } from '@/lib/sync-preferences'
import {
    getSyncPushIntervalMs,
    getSyncPushStrategy,
    setSyncPushIntervalMinutes,
    setSyncPushStrategy,
} from '@/lib/sync-preferences'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'

function useSettings() {
    const get = (key: string, fallback: any) => {
        try {
            return JSON.parse(localStorage.getItem(`zreq_${key}`) ?? 'null') ?? fallback
        } catch {
            return fallback
        }
    }
    const set = (key: string, value: any) =>
        localStorage.setItem(`zreq_${key}`, JSON.stringify(value))
    return { get, set }
}

const ACCENT_PRESETS = [
    { name: 'Purple', value: '#bd93f9' },
    { name: 'Pink', value: '#ff79c6' },
    { name: 'Cyan', value: '#8be9fd' },
    { name: 'Green', value: '#50fa7b' },
    { name: 'Orange', value: '#ffb86c' },
    { name: 'Yellow', value: '#f1fa8c' },
]

type Section = 'general' | 'instance' | 'mcp' | 'themes' | 'about'

interface SettingsDialogProps {
    open: boolean
    onClose: () => void
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
    const { t, i18n } = useTranslation()
    const [section, setSection] = useState<Section>('general')
    const { get, set } = useSettings()
    const [timeout, setTimeout_] = useState(() => get('timeout', 30000))
    const [sslVerify, setSslVerify] = useState(() => get('sslVerify', true))
    const [maxSize, setMaxSize] = useState(() => get('maxSize', 50))
    const [autosave, setAutosave] = useState(() => get('autosave', false))
    const [syncPushStrategy, setSyncPushStrategyState] = useState<SyncPushStrategy>(() =>
        getSyncPushStrategy()
    )
    const [syncIntervalMin, setSyncIntervalMinState] = useState(() =>
        Math.round(getSyncPushIntervalMs() / 60_000)
    )

    const instances = useInstanceStore((s) => s.instances)
    const activeInstanceId = useInstanceStore((s) => s.activeInstanceId)
    const addInstance = useInstanceStore((s) => s.addInstance)
    const getActiveBaseUrl = useInstanceStore((s) => s.getActiveBaseUrl)
    const activeMcpBaseUrl = useMemo(() => getActiveBaseUrl(), [getActiveBaseUrl, activeInstanceId, instances])
    const [qaName, setQaName] = useState('')
    const [qaUrl, setQaUrl] = useState('')
    const [qaErr, setQaErr] = useState('')
    const [qaBusy, setQaBusy] = useState(false)
    const mcpBaseUrl = activeMcpBaseUrl
    const authToken = useAuthStore((s) => s.token)
    const [mcpClients, setMcpClients] = useState<McpOAuthClientRow[]>([])
    const [mcpListBusy, setMcpListBusy] = useState(false)
    const [mcpListErr, setMcpListErr] = useState('')
    const [mcpFormOpen, setMcpFormOpen] = useState(false)
    const [mcpEditingId, setMcpEditingId] = useState<number | null>(null)
    const [formPurpose, setFormPurpose] = useState('')
    const [formClientName, setFormClientName] = useState('')
    const [formRedirectText, setFormRedirectText] = useState('')
    const [formAuthMethod, setFormAuthMethod] = useState<
        'none' | 'client_secret_post' | 'client_secret_basic'
    >('client_secret_post')
    const [mcpFormBusy, setMcpFormBusy] = useState(false)
    const [mcpFormErr, setMcpFormErr] = useState('')
    const [mcpLastSecret, setMcpLastSecret] = useState<{ client_id: string; client_secret: string } | null>(
        null
    )
    const [mcpPendingDeleteId, setMcpPendingDeleteId] = useState<number | null>(null)

    useEffect(() => {
        if (!open) return
        setSyncPushStrategyState(getSyncPushStrategy())
        setSyncIntervalMinState(Math.round(getSyncPushIntervalMs() / 60_000))
    }, [open])

    useEffect(() => {
        if (!open || section !== 'mcp' || !authToken) return
        let cancelled = false
        ;(async () => {
            setMcpListBusy(true)
            setMcpListErr('')
            try {
                const rows = await listMcpOAuthClients()
                if (!cancelled) setMcpClients(rows)
            } catch {
                if (!cancelled) setMcpListErr(t('settings.mcpErrors.listFailed'))
            } finally {
                if (!cancelled) setMcpListBusy(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [open, section, authToken, t])

    const openMcpCreate = () => {
        setMcpEditingId(null)
        setFormPurpose('')
        setFormClientName('')
        setFormRedirectText('')
        setFormAuthMethod('client_secret_post')
        setMcpFormErr('')
        setMcpFormOpen(true)
    }

    const openMcpEdit = (row: McpOAuthClientRow) => {
        setMcpEditingId(row.id)
        setFormPurpose(row.purpose ?? '')
        setFormClientName(row.client_name)
        setFormRedirectText(row.redirect_uris.join('\n'))
        setFormAuthMethod(row.token_endpoint_auth_method as typeof formAuthMethod)
        setMcpFormErr('')
        setMcpFormOpen(true)
    }

    const submitMcpForm = async () => {
        setMcpFormErr('')
        const redirect_uris = parseRedirectUrisField(formRedirectText)
        if (!formClientName.trim()) {
            setMcpFormErr(t('settings.mcpErrors.clientNameRequired'))
            return
        }
        if (redirect_uris.length === 0) {
            setMcpFormErr(t('settings.mcpErrors.redirectUriRequired'))
            return
        }
        setMcpFormBusy(true)
        try {
            if (mcpEditingId != null) {
                await updateMcpOAuthClient(mcpEditingId, {
                    purpose: formPurpose.trim() || null,
                    client_name: formClientName.trim(),
                    redirect_uris,
                    token_endpoint_auth_method: formAuthMethod
                })
            } else {
                const created = await createMcpOAuthClient({
                    purpose: formPurpose.trim() || undefined,
                    client_name: formClientName.trim(),
                    redirect_uris,
                    token_endpoint_auth_method: formAuthMethod
                })
                if (created.client_secret) {
                        setMcpLastSecret({ client_id: created.client_id, client_secret: created.client_secret })
                    }
            }
            const rows = await listMcpOAuthClients()
            setMcpClients(rows)
            setMcpFormOpen(false)
        } catch (e) {
            setMcpFormErr(e instanceof Error ? e.message : t('settings.mcpErrors.saveFailed'))
        } finally {
            setMcpFormBusy(false)
        }
    }

    const onDeleteMcpClient = async (id: number) => {
        if (mcpPendingDeleteId !== id) {
            setMcpPendingDeleteId(id)
            return
        }
        setMcpPendingDeleteId(null)
        try {
            await deleteMcpOAuthClient(id)
            setMcpClients(await listMcpOAuthClients())
        } catch {
            setMcpListErr(t('settings.mcpErrors.deleteFailed'))
        }
    }

    const onRotateMcpSecret = async (id: number) => {
        try {
            const out = await rotateMcpOAuthClientSecret(id)
            setMcpLastSecret(out)
        } catch {
            setMcpListErr(t('settings.mcpErrors.rotateFailed'))
        }
    }

    if (!open) return null

    const saveGeneral = () => {
        set('timeout', timeout)
        set('sslVerify', sslVerify)
        set('maxSize', maxSize)
        set('autosave', autosave)
    }

    const setAccent = (value: string) => setThemeAccent(value)

    const NAV_ITEMS: { id: Section; label: string; icon: ReactNode }[] = [
        { id: 'general', label: t('settings.navGeneral'), icon: <Settings className="h-4 w-4" /> },
        { id: 'instance', label: t('settings.navInstance'), icon: <Server className="h-4 w-4" /> },
        { id: 'mcp', label: t('settings.navMcp'), icon: <KeyRound className="h-4 w-4" /> },
        { id: 'themes', label: t('settings.navThemes'), icon: <Palette className="h-4 w-4" /> },
        { id: 'about', label: t('settings.navAbout'), icon: <Info className="h-4 w-4" /> },
    ]

    const submitQuickAddInstance = async () => {
        setQaErr('')
        setQaBusy(true)
        const v = await validatezreqBackend(qaUrl)
        if (!v.ok) {
            setQaErr(
                t(
                    v.code === 'invalid_url'
                        ? 'instance.invalidUrl'
                        : v.code === 'unreachable'
                          ? 'instance.backendUnreachable'
                          : 'instance.backendInvalidResponse'
                )
            )
            setQaBusy(false)
            return
        }
        const r = addInstance(qaName, v.baseUrl)
        if (!r.ok) {
            setQaErr(t('instance.invalidUrl'))
            setQaBusy(false)
            return
        }
        setQaName('')
        setQaUrl('')
        applyInstanceSwitch(r.id)
        setQaBusy(false)
    }

    const normalizedMcpBase = mcpBaseUrl.trim().replace(/\/+$/, '')
    const mcpEndpoints = normalizedMcpBase
        ? {
              mcp: `${normalizedMcpBase}/mcp`,
              register: `${normalizedMcpBase}/mcp/oauth/register`,
              authorize: `${normalizedMcpBase}/mcp/oauth/authorize`,
              token: `${normalizedMcpBase}/mcp/oauth/token`,
              callback: `${normalizedMcpBase}/mcp/oauth/callback`,
              localLogin: `${normalizedMcpBase}/mcp/oauth/local-login`,
              wellKnownAuthz: `${normalizedMcpBase}/.well-known/oauth-authorization-server`,
              wellKnownResource: `${normalizedMcpBase}/.well-known/oauth-protected-resource`
          }
        : null

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <div className="relative flex h-[80vh] w-[800px] max-w-[95vw] rounded-lg border border-border bg-background shadow-2xl overflow-hidden">
                {/* Sidebar */}
                <div className="w-48 shrink-0 border-r border-border bg-muted/20 flex flex-col gap-0.5 p-2 pt-4">
                    <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('settings.title')}
                    </p>
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setSection(item.id)}
                            className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm text-left transition-colors ${section === item.id
                                    ? 'bg-accent/20 text-foreground'
                                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                }`}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    {section === 'general' && (
                        <div className="space-y-8">
                            <h2 className="text-xl font-semibold">{t('settings.generalTitle')}</h2>

                            <div className="space-y-6">
                                <div className="flex items-start justify-between border-b border-border pb-6">
                                    <div>
                                        <p className="font-medium">{t('settings.language')}</p>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            {t('settings.languageHint')}
                                        </p>
                                    </div>
                                    <Select
                                        value={i18n.language.startsWith('id') ? 'id' : 'en'}
                                        onValueChange={(val) => setAppLocale(val as 'en' | 'id')}
                                    >
                                        <SelectTrigger className="w-[160px] rounded border border-border bg-muted/30 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                                            <SelectValue>
                                                {i18n.language.startsWith('id')
                                                    ? t('settings.langIndonesian')
                                                    : t('settings.langEnglish')}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="en">{t('settings.langEnglish')}</SelectItem>
                                            <SelectItem value="id">{t('settings.langIndonesian')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-start justify-between border-b border-border pb-6">
                                    <div>
                                        <p className="font-medium">{t('settings.requestTimeout')}</p>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            {t('settings.requestTimeoutHint')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={timeout}
                                            onChange={(e) => setTimeout_(+e.target.value)}
                                            onBlur={saveGeneral}
                                            className="w-24 rounded border border-border bg-muted/30 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                        <span className="text-sm text-muted-foreground">ms</span>
                                    </div>
                                </div>

                                <div className="flex items-start justify-between border-b border-border pb-6">
                                    <div>
                                        <p className="font-medium">{t('settings.maxResponseSize')}</p>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            {t('settings.maxResponseSizeHint')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={maxSize}
                                            onChange={(e) => setMaxSize(+e.target.value)}
                                            onBlur={saveGeneral}
                                            className="w-24 rounded border border-border bg-muted/30 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                        <span className="text-sm text-muted-foreground">MB</span>
                                    </div>
                                </div>

                                <div className="flex items-start justify-between border-b border-border pb-6">
                                    <div>
                                        <p className="font-medium">{t('settings.sslVerify')}</p>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            {t('settings.sslVerifyHint')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const v = !sslVerify
                                            setSslVerify(v)
                                            set('sslVerify', v)
                                        }}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${sslVerify ? 'bg-primary' : 'bg-muted'}`}
                                    >
                                        <span
                                            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${sslVerify ? 'translate-x-4' : 'translate-x-0'}`}
                                        />
                                    </button>
                                </div>

                                <div className="flex items-start justify-between border-b border-border pb-6">
                                    <div>
                                        <p className="font-medium">{t('settings.autosave')}</p>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            {t('settings.autosaveHint')}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const v = !autosave
                                            setAutosave(v)
                                            set('autosave', v)
                                        }}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${autosave ? 'bg-primary' : 'bg-muted'}`}
                                    >
                                        <span
                                            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${autosave ? 'translate-x-4' : 'translate-x-0'}`}
                                        />
                                    </button>
                                </div>

                                <div className="flex flex-col gap-4 border-b border-border pb-6">
                                    <div>
                                        <p className="font-medium">{t('settings.syncPushTitle')}</p>
                                        <p className="text-sm text-muted-foreground mt-0.5">
                                            {t('settings.syncPushHint')}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-2 max-w-md">
                                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                                            <input
                                                type="radio"
                                                name="syncPush"
                                                className="mt-1"
                                                checked={syncPushStrategy === 'debounced'}
                                                onChange={() => {
                                                    setSyncPushStrategyState('debounced')
                                                    setSyncPushStrategy('debounced')
                                                }}
                                            />
                                            <span>
                                                <span className="font-medium">{t('settings.syncPushDebounced')}</span>
                                                <span className="block text-muted-foreground text-xs">
                                                    {t('settings.syncPushDebouncedHint')}
                                                </span>
                                            </span>
                                        </label>
                                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                                            <input
                                                type="radio"
                                                name="syncPush"
                                                className="mt-1"
                                                checked={syncPushStrategy === 'interval'}
                                                onChange={() => {
                                                    setSyncPushStrategyState('interval')
                                                    setSyncPushStrategy('interval')
                                                }}
                                            />
                                            <span>
                                                <span className="font-medium">{t('settings.syncPushInterval')}</span>
                                                <span className="block text-muted-foreground text-xs">
                                                    {t('settings.syncPushIntervalHint')}
                                                </span>
                                            </span>
                                        </label>
                                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                                            <input
                                                type="radio"
                                                name="syncPush"
                                                className="mt-1"
                                                checked={syncPushStrategy === 'manual'}
                                                onChange={() => {
                                                    setSyncPushStrategyState('manual')
                                                    setSyncPushStrategy('manual')
                                                }}
                                            />
                                            <span>
                                                <span className="font-medium">{t('settings.syncPushManual')}</span>
                                                <span className="block text-muted-foreground text-xs">
                                                    {t('settings.syncPushManualHint')}
                                                </span>
                                            </span>
                                        </label>
                                    </div>
                                    {syncPushStrategy === 'interval' ? (
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                            <label className="text-muted-foreground">{t('settings.syncPushEvery')}</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={120}
                                                value={syncIntervalMin}
                                                onChange={(e) => setSyncIntervalMinState(+e.target.value)}
                                                onBlur={() => {
                                                    const v = Math.max(1, Math.min(120, syncIntervalMin || 2))
                                                    setSyncIntervalMinState(v)
                                                    setSyncPushIntervalMinutes(v)
                                                }}
                                                className="w-16 rounded border border-border bg-muted/30 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                                            />
                                            <span className="text-muted-foreground">{t('settings.syncPushMinutes')}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}

                    {section === 'instance' && (
                        <div className="space-y-8">
                            <h2 className="text-xl font-semibold">{t('settings.instanceTitle')}</h2>
                            <p className="text-sm text-muted-foreground -mt-4">{t('settings.instanceHint')}</p>

                            <div className="space-y-3 rounded-lg border border-border p-4">
                                <p className="text-sm font-medium">{t('settings.instanceListHeading')}</p>
                                <ul className="space-y-2 text-sm">
                                    {instances.map((inst) => (
                                        <li
                                            key={inst.id}
                                            className="flex flex-col gap-0.5 rounded border border-border/60 bg-muted/20 px-3 py-2"
                                        >
                                            <span className="font-medium">
                                                {inst.name}
                                                {inst.id === activeInstanceId ? (
                                                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                                                        ({t('settings.instanceActive')})
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span className="text-muted-foreground truncate text-xs">{inst.baseUrl}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="space-y-4 border-t border-border pt-6">
                                <p className="text-sm font-medium">{t('settings.instanceQuickAdd')}</p>
                                <div className="grid max-w-md gap-3">
                                    <div className="grid gap-1">
                                        <label className="text-muted-foreground text-xs">{t('common.name')}</label>
                                        <Input
                                            value={qaName}
                                            onChange={(e) => setQaName(e.target.value)}
                                            placeholder={t('instance.namePlaceholder')}
                                        />
                                    </div>
                                    <div className="grid gap-1">
                                        <label className="text-muted-foreground text-xs">{t('instance.baseUrl')}</label>
                                        <Input
                                            value={qaUrl}
                                            onChange={(e) => setQaUrl(e.target.value)}
                                            placeholder={t('instance.urlPlaceholder')}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') void submitQuickAddInstance()
                                            }}
                                        />
                                    </div>
                                    {qaErr ? <p className="text-destructive text-xs">{qaErr}</p> : null}
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="w-fit"
                                        disabled={qaBusy}
                                        onClick={() => void submitQuickAddInstance()}
                                    >
                                        {qaBusy ? t('instance.validating') : t('instance.addAndSwitch')}
                                    </Button>
                                </div>
                            </div>

                        </div>
                    )}

                    {section === 'mcp' && (
                        <div className="space-y-8">
                            <h2 className="text-xl font-semibold">{t('settings.mcpTitle')}</h2>
                            <p className="text-sm text-muted-foreground -mt-4">{t('settings.mcpSubtitle')}</p>

                            <div className="space-y-4 border-t border-border pt-6">
                                <p className="text-sm font-medium">{t('settings.mcpClientsTitle')}</p>
                                <p className="text-xs text-muted-foreground">{t('settings.mcpClientsHint')}</p>

                                <div className="grid max-w-xl gap-3">
                                    <div className="grid gap-1">
                                        <label className="text-muted-foreground text-xs">{t('settings.mcpBaseUrl')}</label>
                                        <Input
                                            value={mcpBaseUrl}
                                            readOnly
                                            placeholder="https://your-backend.example"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            {t('settings.mcpBaseUrlHint')}{' '}
                                            <span className="font-mono">https://backend.zreq.com</span>
                                        </p>
                                    </div>
                                    {mcpEndpoints ? (
                                        <div className="rounded border border-border bg-muted/20 p-3 text-[11px] space-y-1.5">
                                            <p className="text-muted-foreground font-medium">{t('settings.mcpDerivedUrls')}</p>
                                            <p>
                                                <span className="text-muted-foreground">{t('settings.mcpConnectorUrl')}</span>{' '}
                                                <span className="font-mono break-all">{mcpEndpoints.mcp}</span>
                                            </p>
                                            <p>
                                                <span className="text-muted-foreground">{t('settings.mcpOauthAuthorize')}</span>{' '}
                                                <span className="font-mono break-all">{mcpEndpoints.authorize}</span>
                                            </p>
                                            <p>
                                                <span className="text-muted-foreground">{t('settings.mcpOauthToken')}</span>{' '}
                                                <span className="font-mono break-all">{mcpEndpoints.token}</span>
                                            </p>
                                            <p>
                                                <span className="text-muted-foreground">{t('settings.mcpOauthLocalLogin')}</span>{' '}
                                                <span className="font-mono break-all">{mcpEndpoints.localLogin}</span>
                                            </p>
                                        </div>
                                    ) : null}

                                    {!authToken ? (
                                        <p className="text-amber-600 text-sm">{t('settings.mcpLoginRequired')}</p>
                                    ) : null}

                                    {mcpLastSecret ? (
                                        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
                                            <p className="font-medium text-amber-800 dark:text-amber-200">
                                                {t('settings.mcpSecretOnce')}
                                            </p>
                                            <p className="font-mono break-all">
                                                <span className="text-muted-foreground">client_id:</span> {mcpLastSecret.client_id}
                                            </p>
                                            <p className="font-mono break-all">
                                                <span className="text-muted-foreground">client_secret:</span>{' '}
                                                {mcpLastSecret.client_secret}
                                            </p>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void navigator.clipboard.writeText(mcpLastSecret.client_secret)}
                                            >
                                                {t('settings.mcpCopySecret')}
                                            </Button>
                                            <Button type="button" size="sm" variant="ghost" onClick={() => setMcpLastSecret(null)}>
                                                {t('settings.mcpDismissSecret')}
                                            </Button>
                                        </div>
                                    ) : null}

                                    {mcpListErr ? <p className="text-destructive text-xs">{mcpListErr}</p> : null}

                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={!authToken || mcpListBusy}
                                            onClick={() => openMcpCreate()}
                                        >
                                            {t('settings.mcpAddClient')}
                                        </Button>
                                    </div>

                                    {authToken && mcpListBusy ? (
                                        <p className="text-xs text-muted-foreground">{t('settings.mcpLoading')}</p>
                                    ) : null}
                                    {authToken && !mcpListBusy && mcpClients.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">{t('settings.mcpNoClients')}</p>
                                    ) : null}

                                    {mcpClients.length > 0 ? (
                                        <div className="rounded border border-border overflow-x-auto">
                                            <table className="w-full text-xs text-left">
                                                <thead className="bg-muted/40 border-b border-border">
                                                    <tr>
                                                        <th className="p-2 font-medium">{t('settings.mcpPurposeLabel')}</th>
                                                        <th className="p-2 font-medium">{t('settings.mcpClientName')}</th>
                                                        <th className="p-2 font-medium">client_id</th>
                                                        <th className="p-2 font-medium w-[1%]">{t('settings.mcpActions')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {mcpClients.map((row) => (
                                                        <tr key={row.id} className="border-b border-border/60">
                                                            <td className="p-2 align-top">{row.purpose || '—'}</td>
                                                            <td className="p-2 align-top">{row.client_name}</td>
                                                            <td className="p-2 align-top font-mono break-all max-w-[200px]">
                                                                {row.client_id}
                                                            </td>
                                                            <td className="p-2 align-top whitespace-nowrap space-x-1">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-7 px-2"
                                                                    onClick={() => openMcpEdit(row)}
                                                                >
                                                                    {t('settings.mcpEdit')}
                                                                </Button>
                                                                {row.token_endpoint_auth_method !== 'none' ? (
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="h-7 px-2"
                                                                        onClick={() => void onRotateMcpSecret(row.id)}
                                                                    >
                                                                        {t('settings.mcpRotateSecret')}
                                                                    </Button>
                                                                ) : null}
                                                                {mcpPendingDeleteId === row.id ? (
                                                                    <>
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="destructive"
                                                                            className="h-7 px-2"
                                                                            onClick={() => void onDeleteMcpClient(row.id)}
                                                                        >
                                                                            {t('settings.mcpDeleteConfirmBtn')}
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="h-7 px-2"
                                                                            onClick={() => setMcpPendingDeleteId(null)}
                                                                        >
                                                                            {t('settings.mcpCancel')}
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="destructive"
                                                                        className="h-7 px-2"
                                                                        onClick={() => void onDeleteMcpClient(row.id)}
                                                                    >
                                                                        {t('settings.mcpDelete')}
                                                                    </Button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : null}

                                    <div className="rounded border border-border bg-muted/20 p-3 text-[11px] space-y-1.5">
                                        <p className="text-muted-foreground font-medium">{t('settings.mcpFlowTitle')}</p>
                                        <p>{t('settings.mcpFlow1')}</p>
                                        <p>{t('settings.mcpFlow2')}</p>
                                        <p>{t('settings.mcpFlow3')}</p>
                                        <p>{t('settings.mcpFlow4')}</p>
                                    </div>
                                </div>
                            </div>

                            <Dialog open={mcpFormOpen} onOpenChange={setMcpFormOpen}>
                                <DialogContent className="sm:max-w-lg" showCloseButton>
                                    <DialogHeader>
                                        <DialogTitle>
                                            {mcpEditingId != null
                                                ? t('settings.mcpEditClientTitle')
                                                : t('settings.mcpAddClientTitle')}
                                        </DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-3 py-2">
                                        <p className="text-[11px] text-muted-foreground">{t('settings.mcpPresetsHint')}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {MCP_AGENT_PRESETS.map((p) => (
                                                <Button
                                                    key={p.id}
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-7 text-xs"
                                                    onClick={() => {
                                                        setFormPurpose(p.purpose)
                                                        setFormClientName(p.client_name)
                                                        setFormRedirectText(p.redirect_uri)
                                                        // Cursor / Claude use PKCE public clients — mcp.json only has CLIENT_ID.
                                                        setFormAuthMethod('none')
                                                    }}
                                                >
                                                    {p.purpose}
                                                </Button>
                                            ))}
                                        </div>
                                        <div className="grid gap-1">
                                            <label className="text-muted-foreground text-xs">
                                                {t('settings.mcpPurposeLabel')}
                                            </label>
                                            <Input
                                                value={formPurpose}
                                                onChange={(e) => setFormPurpose(e.target.value)}
                                                placeholder={t('settings.mcpPurposePlaceholder')}
                                            />
                                        </div>
                                        <div className="grid gap-1">
                                            <label className="text-muted-foreground text-xs">{t('settings.mcpClientName')}</label>
                                            <Input
                                                value={formClientName}
                                                onChange={(e) => setFormClientName(e.target.value)}
                                                placeholder="ZReq MCP — …"
                                            />
                                        </div>
                                        <div className="grid gap-1">
                                            <label className="text-muted-foreground text-xs">
                                                {t('settings.mcpRedirectUrisLabel')}
                                            </label>
                                            <textarea
                                                className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                value={formRedirectText}
                                                onChange={(e) => setFormRedirectText(e.target.value)}
                                                placeholder={t('settings.mcpRedirectUrisPlaceholder')}
                                                spellCheck={false}
                                            />
                                        </div>
                                        <div className="grid gap-1">
                                            <label className="text-muted-foreground text-xs">
                                                {t('settings.mcpTokenAuthMethod')}
                                            </label>
                                            <Select
                                                value={formAuthMethod}
                                                onValueChange={(v) =>
                                                    setFormAuthMethod(
                                                        v as 'none' | 'client_secret_post' | 'client_secret_basic'
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="client_secret_post">
                                                        {t('settings.mcpAuthMethodPost')}
                                                    </SelectItem>
                                                    <SelectItem value="client_secret_basic">
                                                        client_secret_basic
                                                    </SelectItem>
                                                    <SelectItem value="none">{t('settings.mcpAuthMethodNone')}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {formAuthMethod === 'none' ? (
                                                <p className="text-[11px] text-muted-foreground">
                                                    {t('settings.mcpAuthMethodNoneHint')}
                                                </p>
                                            ) : (
                                                <p className="text-[11px] text-muted-foreground">
                                                    {t('settings.mcpAuthMethodSecretHint')}
                                                </p>
                                            )}
                                        </div>
                                        {mcpFormErr ? <p className="text-destructive text-xs">{mcpFormErr}</p> : null}
                                    </div>
                                    <DialogFooter className="border-0 bg-transparent sm:justify-end">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setMcpFormOpen(false)}
                                        >
                                            {t('settings.mcpCancel')}
                                        </Button>
                                        <Button type="button" disabled={mcpFormBusy} onClick={() => void submitMcpForm()}>
                                            {mcpFormBusy ? t('settings.mcpSaving') : t('settings.mcpSave')}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}

                    {section === 'themes' && (
                        <div className="space-y-8">
                            <h2 className="text-xl font-semibold">{t('settings.themesTitle')}</h2>
                            <div>
                                <p className="font-medium mb-1">{t('settings.accentColor')}</p>
                                <p className="text-sm text-muted-foreground mb-4">
                                    {t('settings.accentColorHint')}
                                </p>
                                <div className="flex gap-3 flex-wrap">
                                    {ACCENT_PRESETS.map((preset) => (
                                        <button
                                            key={preset.name}
                                            onClick={() => setAccent(preset.value)}
                                            title={preset.name}
                                            style={{ background: preset.value }}
                                            className="h-10 w-10 rounded-full border-2 border-border hover:scale-110 transition-transform hover:border-white"
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {section === 'about' && (
                        <div className="space-y-6">
                            <h2 className="text-xl font-semibold">{t('settings.aboutTitle')}</h2>
                            <div className="space-y-4 text-sm">
                                <div className="flex gap-2">
                                    <span className="text-muted-foreground w-24">{t('settings.version')}</span>
                                    <span>0.1.0</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-muted-foreground w-24">{t('settings.builtWith')}</span>
                                    <span>Tauri 2 + React + NestJS</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
