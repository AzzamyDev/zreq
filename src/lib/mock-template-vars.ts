/** Postman-style dynamic variables: `{{$name}}` (leading `$` inside braces). */

export const MOCK_TEMPLATE_VARIABLE_KEYS = [
    '$timestamp',
    '$isoTimestamp',
    '$guid',
    '$randomInt',
    '$randomStreetAddress',
] as const

export type MockTemplateVariableKey = (typeof MOCK_TEMPLATE_VARIABLE_KEYS)[number]

const KNOWN_MOCK_KEYS = new Set<string>(MOCK_TEMPLATE_VARIABLE_KEYS)

/** Inclusive upper bound for `{{$randomInt}}` (0 … MOCK_RANDOM_INT_MAX). */
export const MOCK_RANDOM_INT_MAX = 1000

const STREET_NAMES = [
    'Maple',
    'Oak',
    'Cedar',
    'Pine',
    'Elm',
    'Birch',
    'Willow',
    'Ash',
    'Cherry',
    'Walnut',
]

/** i18n keys under `vars.*` for one-line descriptions in the suggest popover. */
export const MOCK_TEMPLATE_VARIABLE_DESC_I18N: Record<MockTemplateVariableKey, string> = {
    $timestamp: 'mockDescTimestamp',
    $isoTimestamp: 'mockDescIsoTimestamp',
    $guid: 'mockDescGuid',
    $randomInt: 'mockDescRandomInt',
    $randomStreetAddress: 'mockDescRandomStreetAddress',
}

export function isKnownMockTemplateVariable(key: string): boolean {
    return KNOWN_MOCK_KEYS.has(key.trim())
}

export function resolveMockTemplateVariable(key: string): string | null {
    const k = key.trim()
    if (!KNOWN_MOCK_KEYS.has(k)) return null
    switch (k) {
        case '$timestamp':
            return String(Date.now())
        case '$isoTimestamp':
            return new Date().toISOString()
        case '$guid':
            return crypto.randomUUID()
        case '$randomInt':
            return String(Math.floor(Math.random() * (MOCK_RANDOM_INT_MAX + 1)))
        case '$randomStreetAddress':
            const num = Math.floor(Math.random() * 9999) + 1
            const street = STREET_NAMES[Math.floor(Math.random() * STREET_NAMES.length)]
            return `${num} ${street} St`
        default:
            return null
    }
}
