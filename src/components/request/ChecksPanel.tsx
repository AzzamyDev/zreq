import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { evaluateChecks, readChecks, type CheckVerdict } from '@/lib/request-checks'
import type { HttpResponse, RequestCheck } from '@/types'
import { nanoid } from 'nanoid'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type ChecksPanelProps = {
    checks: RequestCheck[] | undefined
    response: HttpResponse | null
    onChange: (checks: RequestCheck[]) => void
}

function verdictFor(verdicts: CheckVerdict[], id: string) {
    return verdicts.find((row) => row.id === id)
}

export default function ChecksPanel({ checks, response, onChange }: ChecksPanelProps) {
    const { t } = useTranslation()
    const rows = readChecks(checks)
    const verdicts = response ? evaluateChecks(rows, response) : []

    const update = (id: string, next: RequestCheck) => {
        onChange(rows.map((row) => (row.id === id ? next : row)))
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
            <p className="text-sm text-muted-foreground">{t('request.testsHint')}</p>
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('request.noTestsYet')}</p> : null}
            {rows.map((check) => {
                const verdict = verdictFor(verdicts, check.id)
                return (
                    <div key={check.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                        <select
                            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                            value={check.kind}
                            aria-label={t('request.tests')}
                            onChange={(event) => {
                                const kind = event.target.value
                                update(
                                    check.id,
                                    kind === 'json'
                                        ? { id: check.id, kind: 'json', path: '', expected: '' }
                                        : { id: check.id, kind: 'status', expected: 200 },
                                )
                            }}
                        >
                            <option value="status">{t('request.testStatus')}</option>
                            <option value="json">{t('request.testJson')}</option>
                        </select>
                        {check.kind === 'status' ? (
                            <Input
                                className="w-24"
                                type="number"
                                min={0}
                                value={check.expected}
                                aria-label={t('request.testStatus')}
                                onChange={(event) =>
                                    update(check.id, {
                                        ...check,
                                        expected: Number(event.target.value || 0),
                                    })
                                }
                            />
                        ) : (
                            <>
                                <Input
                                    className="w-36"
                                    value={check.path}
                                    placeholder={t('request.jsonPathPlaceholder')}
                                    aria-label={t('request.jsonPath')}
                                    onChange={(event) => update(check.id, { ...check, path: event.target.value })}
                                />
                                <Input
                                    className="min-w-32 flex-1"
                                    value={check.expected}
                                    placeholder={t('request.expectedValue')}
                                    aria-label={t('request.expectedValue')}
                                    onChange={(event) => update(check.id, { ...check, expected: event.target.value })}
                                />
                            </>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('request.removeTest')}
                            onClick={() => onChange(rows.filter((row) => row.id !== check.id))}
                        >
                            <Trash2 />
                        </Button>
                        {verdict ? (
                            <span className={verdict.pass ? 'text-sm text-green-600' : 'text-sm text-destructive'}>
                                {verdict.pass ? t('request.testPassed') : t('request.testFailed')}
                                {' · '}
                                {verdict.missing ? t('request.testMissing') : t('request.testActual', { actual: verdict.actual })}
                            </span>
                        ) : null}
                    </div>
                )
            })}
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => onChange([...rows, { id: nanoid(), kind: 'status', expected: 200 }])}
                >
                    {t('request.addStatusTest')}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => onChange([...rows, { id: nanoid(), kind: 'json', path: '', expected: '' }])}
                >
                    {t('request.addJsonTest')}
                </Button>
            </div>
        </div>
    )
}
