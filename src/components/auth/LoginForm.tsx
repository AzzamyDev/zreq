import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'

export default function LoginForm() {
    const { t } = useTranslation()
    const setAuth = useAuthStore((s) => s.setAuth)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const res = await apiClient.post('/auth/login', { email, password })
            const { access_token, user } = res.data.data
            setAuth(access_token, user)
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                t('auth.loginFailed')
            setError(Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-10 bg-background/60"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="password">{t('common.password')}</Label>
                <Input
                    id="password"
                    type="password"
                    placeholder={t('auth.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-10 bg-background/60"
                />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
                {loading ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
        </form>
    )
}
