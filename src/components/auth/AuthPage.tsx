import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight } from 'lucide-react'
import AuthShell from './AuthShell'
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'
import GitHubOAuthButton from './GitHubOAuthButton'
import { useInstanceStore } from '@/store/instanceStore'

export default function AuthPage() {
    const { t } = useTranslation()
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const returnToInstanceSetup = useInstanceStore((s) => s.returnToInstanceOnboarding)

    return (
        <AuthShell
            showInstanceBadge
            title={mode === 'login' ? t('auth.signIn') : t('auth.register')}
            description={
                mode === 'login' ? t('auth.signInSubtitle') : t('auth.registerSubtitle')
            }
        >
            {mode === 'login' ? <LoginForm /> : <RegisterForm />}
            <GitHubOAuthButton />

            <p className="text-center text-[13px] text-[var(--auth-nebula-fg-soft)]">
                {mode === 'login' ? (
                    <>
                        {t('auth.noAccount')}{' '}
                        <button
                            type="button"
                            className="auth-nebula-link"
                            onClick={() => setMode('register')}
                        >
                            {t('auth.register')}
                        </button>
                    </>
                ) : (
                    <>
                        {t('auth.haveAccount')}{' '}
                        <button
                            type="button"
                            className="auth-nebula-link"
                            onClick={() => setMode('login')}
                        >
                            {t('auth.signIn')}
                        </button>
                    </>
                )}
            </p>

            <button
                type="button"
                className="auth-nebula-muted-link mx-auto mt-0.5 w-full"
                onClick={() => returnToInstanceSetup()}
            >
                <ArrowLeftRight className="size-3.5" aria-hidden />
                {t('auth.changeBackendLink')}
            </button>
        </AuthShell>
    )
}
