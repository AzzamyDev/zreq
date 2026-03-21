import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
            pill={t('auth.appTitle')}
            title={mode === 'login' ? t('auth.signIn') : t('auth.register')}
            description={
                mode === 'login' ? t('auth.signInSubtitle') : t('auth.registerSubtitle')
            }
        >
            {mode === 'login' ? <LoginForm /> : <RegisterForm />}
            <GitHubOAuthButton />

            <p className="text-muted-foreground text-center text-sm">
                {mode === 'login' ? (
                    <>
                        {t('auth.noAccount')}{' '}
                        <button
                            type="button"
                            className="text-primary font-medium underline-offset-4 hover:underline"
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
                            className="text-primary font-medium underline-offset-4 hover:underline"
                            onClick={() => setMode('login')}
                        >
                            {t('auth.signIn')}
                        </button>
                    </>
                )}
            </p>

            <p className="text-center">
                <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                    onClick={() => returnToInstanceSetup()}
                >
                    {t('auth.changeBackendLink')}
                </button>
            </p>
        </AuthShell>
    )
}
