const STORAGE_KEY = 'zreq_accent'

const vars = ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring', '--chart-5'] as const

export const applyThemeAccentVars = (value: string) => {
    const s = document.documentElement.style
    for (const v of vars) s.setProperty(v, value)
}

export const setThemeAccent = (value: string) => {
    applyThemeAccentVars(value)
    localStorage.setItem(STORAGE_KEY, value)
}

export const hydrateThemeAccent = () => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) applyThemeAccentVars(saved)
}
