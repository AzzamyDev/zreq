/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module 'monaco-editor/language/json/monaco.contribution.js' {
    export const jsonDefaults: {
        setDiagnosticsOptions: (opts: Record<string, unknown>) => void
    }
}
