import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type AppLogoProps = {
    className?: string
}

export default function AppLogo({ className }: AppLogoProps) {
    const { t } = useTranslation()
    return (
        <img
            src="/icon.svg"
            alt={t('auth.appTitle')}
            width={110}
            height={110}
            decoding="async"
            className={cn('pointer-events-none shrink-0 object-contain', className)}
        />
    )
}
