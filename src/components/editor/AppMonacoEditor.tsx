import { useRef, useCallback, useEffect } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { ensureZreqMonacoTheme, defaultMonacoEditorOptions, ZREQ_MONACO_THEME } from '@/lib/monaco-theme'
import { cn } from '@/lib/utils'
import '@/lib/monaco-setup'

export type AppMonacoEditorProps = {
    value: string
    onChange?: (value: string) => void
    language?: string
    readOnly?: boolean
    className?: string
    wrapperClassName?: string
    onMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => void | (() => void)
    options?: Monaco.editor.IStandaloneEditorConstructionOptions
    placeholder?: string
}

export default function AppMonacoEditor({
    value,
    onChange,
    language = 'json',
    readOnly = false,
    className,
    wrapperClassName,
    onMount,
    options,
    placeholder,
}: AppMonacoEditorProps) {
    const cleanupRef = useRef<(() => void) | void>(undefined)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    const handleMount: OnMount = useCallback(
        (editor, monaco) => {
            if (typeof cleanupRef.current === 'function') cleanupRef.current()
            ensureZreqMonacoTheme(monaco)
            monaco.editor.setTheme(ZREQ_MONACO_THEME)
            cleanupRef.current = onMount?.(editor, monaco)
        },
        [onMount],
    )

    useEffect(() => () => {
        if (typeof cleanupRef.current === 'function') cleanupRef.current()
    }, [])

    const handleChange = useCallback((v: string | undefined) => {
        onChangeRef.current?.(v ?? '')
    }, [])

    const showPlaceholder = Boolean(placeholder?.trim()) && !value

    return (
        <div className={cn('relative h-full min-h-0', wrapperClassName)}>
            {showPlaceholder && (
                <div
                    className="pointer-events-none absolute left-[calc(2.25rem+10px)] top-0 z-10 py-0 font-mono text-xs leading-[17px] text-muted-foreground"
                    aria-hidden
                >
                    {placeholder}
                </div>
            )}
            <Editor
                value={value}
                language={language}
                theme={ZREQ_MONACO_THEME}
                onChange={readOnly ? undefined : handleChange}
                onMount={handleMount}
                className={cn('h-full min-h-0', className)}
                options={{
                    ...defaultMonacoEditorOptions,
                    readOnly,
                    ...options,
                }}
                loading={
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        …
                    </div>
                }
            />
        </div>
    )
}
