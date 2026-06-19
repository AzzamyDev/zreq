import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'

export default function RegisterForm() {
    const { t } = useTranslation()
    const setAuth = useAuthStore((s) => s.setAuth)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const res = await apiClient.post('/auth/register', { name, email, password })
            const { access_token, user } = res.data.data
            setAuth(access_token, user)
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                t('auth.registrationFailed')
            setError(Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2.5">
                <label htmlFor="name" className="auth-nebula-label">
                    {t('common.name')}
                </label>
                <input
                    id="name"
                    placeholder={t('auth.namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="auth-nebula-input"
                    autoComplete="name"
                />
            </div>
            <div className="space-y-2.5">
                <label htmlFor="email" className="auth-nebula-label">
                    {t('common.email')}
                </label>
                <input
                    id="email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="auth-nebula-input"
                    autoComplete="email"
                />
            </div>
            <div className="space-y-2.5">
                <label htmlFor="password" className="auth-nebula-label">
                    {t('common.password')}
                </label>
                <input
                    id="password"
                    type="password"
                    placeholder={t('auth.passwordMinPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="auth-nebula-input"
                    autoComplete="new-password"
                />
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <button type="submit" className="auth-nebula-btn-primary mt-1" disabled={loading}>
                {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
            </button>
        </form>
    )
}
