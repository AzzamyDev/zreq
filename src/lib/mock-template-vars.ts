/** Postman-style dynamic variables: `{{$name}}` (leading `$` inside braces). */

export type MockTemplateSubgroupId = 'timeId' | 'number' | 'person' | 'contact' | 'place' | 'net' | 'biz'

type SubgroupDef<K extends readonly string[] = readonly string[]> = {
    id: MockTemplateSubgroupId
    labelI18n: string
    keys: K
}

export const MOCK_TEMPLATE_SUBGROUPS = [
    {
        id: 'timeId',
        labelI18n: 'mockSubgroupTimeId',
        keys: ['$timestamp', '$isoTimestamp', '$guid', '$randomUUID'],
    },
    {
        id: 'number',
        labelI18n: 'mockSubgroupNumber',
        keys: ['$randomInt', '$randomFloat', '$randomBoolean'],
    },
    {
        id: 'person',
        labelI18n: 'mockSubgroupPerson',
        keys: ['$randomFirstName', '$randomLastName', '$randomFullName', '$randomUserName', '$randomNIK'],
    },
    {
        id: 'contact',
        labelI18n: 'mockSubgroupContact',
        keys: ['$randomEmail', '$randomPhoneNumber'],
    },
    {
        id: 'place',
        labelI18n: 'mockSubgroupPlace',
        keys: [
            '$randomStreetAddress',
            '$randomCity',
            '$randomCountry',
            '$randomCountryCode',
            '$randomZipCode',
        ],
    },
    {
        id: 'net',
        labelI18n: 'mockSubgroupNet',
        keys: [
            '$randomUrl',
            '$randomIP',
            '$randomIPV6',
            '$randomMACAddress',
            '$randomDomainName',
            '$randomUserAgent',
            '$randomHexColor',
        ],
    },
    {
        id: 'biz',
        labelI18n: 'mockSubgroupBiz',
        keys: [
            '$randomCompanyName',
            '$randomJobTitle',
            '$randomPrice',
            '$randomAlphaNumeric',
            '$randomProductName',
        ],
    },
] as const satisfies readonly SubgroupDef[]

export type MockTemplateVariableKey = (typeof MOCK_TEMPLATE_SUBGROUPS)[number]['keys'][number]

export const MOCK_TEMPLATE_VARIABLE_KEYS: readonly MockTemplateVariableKey[] =
    MOCK_TEMPLATE_SUBGROUPS.flatMap((g) => g.keys)

const KNOWN_MOCK_KEYS = new Set<string>(MOCK_TEMPLATE_VARIABLE_KEYS)

/** Inclusive upper bound for `{{$randomInt}}` (0 … MOCK_RANDOM_INT_MAX). */
export const MOCK_RANDOM_INT_MAX = 1000

/** Inclusive digit count for `{{$randomAlphaNumeric}}`. */
export const MOCK_RANDOM_ALPHANUMERIC_LENGTH = 12

const STREET_NAMES = ['Maple', 'Oak', 'Cedar', 'Pine', 'Elm', 'Birch', 'Willow', 'Ash', 'Cherry', 'Walnut']
const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Sam', 'Jamie']
const LAST_NAMES = ['Smith', 'Johnson', 'Lee', 'Brown', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore', 'Clark']
const CITIES = ['Springfield', 'Riverton', 'Lakeside', 'Fairview', 'Brookfield', 'Greenville', 'Madison', 'Arlington']
const COUNTRIES = [
    { name: 'United States', code: 'US' },
    { name: 'Indonesia', code: 'ID' },
    { name: 'Germany', code: 'DE' },
    { name: 'Japan', code: 'JP' },
    { name: 'Brazil', code: 'BR' },
    { name: 'Canada', code: 'CA' },
]
const COMPANY_SUFFIX = ['Inc', 'LLC', 'Co', 'Labs', 'Systems', 'Group']
const JOB_TITLES = ['Engineer', 'Designer', 'Manager', 'Analyst', 'Consultant', 'Developer', 'Director']
const PRODUCT_NOUNS = ['Widget', 'Sensor', 'Hub', 'Module', 'Pack', 'Kit', 'Adapter', 'Monitor', 'Dock']
const PRODUCT_QUALIFIERS = ['Pro', 'Ultra', 'Lite', 'Max', 'Mini', 'Smart', 'Plus', 'Air']
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
]

function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!
}

function randomIntInclusive(max: number): number {
    return Math.floor(Math.random() * (max + 1))
}

function randomUuidV4(): string {
    return crypto.randomUUID()
}

function randomFirstName(): string {
    return pick(FIRST_NAMES)
}

function randomLastName(): string {
    return pick(LAST_NAMES)
}

/** Fake 16-digit NIK-shaped string (location + DDMMYY + serial); not real PII. */
export function generateFakeNik(): string {
    const prov = String(randomIntInclusive(89) + 11).padStart(2, '0')
    const reg = String(randomIntInclusive(99) + 1).padStart(2, '0')
    const dist = String(randomIntInclusive(99) + 1).padStart(2, '0')
    const day = String(randomIntInclusive(28) + 1).padStart(2, '0')
    const month = String(randomIntInclusive(12) + 1).padStart(2, '0')
    const year = String(randomIntInclusive(99)).padStart(2, '0')
    const serial = String(randomIntInclusive(9999)).padStart(4, '0')
    return `${prov}${reg}${dist}${day}${month}${year}${serial}`
}

/** i18n keys under `vars.*` for one-line descriptions in the suggest popover. */
export const MOCK_TEMPLATE_VARIABLE_DESC_I18N: Record<MockTemplateVariableKey, string> = {
    $timestamp: 'mockDescTimestamp',
    $isoTimestamp: 'mockDescIsoTimestamp',
    $guid: 'mockDescGuid',
    $randomUUID: 'mockDescRandomUUID',
    $randomInt: 'mockDescRandomInt',
    $randomFloat: 'mockDescRandomFloat',
    $randomBoolean: 'mockDescRandomBoolean',
    $randomFirstName: 'mockDescRandomFirstName',
    $randomLastName: 'mockDescRandomLastName',
    $randomFullName: 'mockDescRandomFullName',
    $randomUserName: 'mockDescRandomUserName',
    $randomNIK: 'mockDescRandomNIK',
    $randomEmail: 'mockDescRandomEmail',
    $randomPhoneNumber: 'mockDescRandomPhoneNumber',
    $randomStreetAddress: 'mockDescRandomStreetAddress',
    $randomCity: 'mockDescRandomCity',
    $randomCountry: 'mockDescRandomCountry',
    $randomCountryCode: 'mockDescRandomCountryCode',
    $randomZipCode: 'mockDescRandomZipCode',
    $randomUrl: 'mockDescRandomUrl',
    $randomIP: 'mockDescRandomIP',
    $randomIPV6: 'mockDescRandomIPV6',
    $randomMACAddress: 'mockDescRandomMACAddress',
    $randomDomainName: 'mockDescRandomDomainName',
    $randomUserAgent: 'mockDescRandomUserAgent',
    $randomHexColor: 'mockDescRandomHexColor',
    $randomCompanyName: 'mockDescRandomCompanyName',
    $randomJobTitle: 'mockDescRandomJobTitle',
    $randomPrice: 'mockDescRandomPrice',
    $randomAlphaNumeric: 'mockDescRandomAlphaNumeric',
    $randomProductName: 'mockDescRandomProductName',
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
        case '$randomUUID':
            return randomUuidV4()
        case '$randomInt':
            return String(randomIntInclusive(MOCK_RANDOM_INT_MAX))
        case '$randomFloat':
            return (Math.random() * 1000).toFixed(2)
        case '$randomBoolean':
            return Math.random() < 0.5 ? 'true' : 'false'
        case '$randomFirstName':
            return randomFirstName()
        case '$randomLastName':
            return randomLastName()
        case '$randomFullName':
            return `${randomFirstName()} ${randomLastName()}`
        case '$randomUserName': {
            const base = randomFirstName().toLowerCase().replace(/[^a-z]/g, '')
            return `${base}${randomIntInclusive(9999)}`
        }
        case '$randomNIK':
            return generateFakeNik()
        case '$randomEmail': {
            const user = `${randomFirstName()}.${randomLastName()}`.toLowerCase().replace(/[^a-z.]/g, '')
            return `${user}${randomIntInclusive(99)}@example.com`
        }
        case '$randomPhoneNumber':
            return `+1-${randomIntInclusive(899) + 100}-${randomIntInclusive(899) + 100}-${String(randomIntInclusive(9999)).padStart(4, '0')}`
        case '$randomStreetAddress': {
            const num = randomIntInclusive(9998) + 1
            return `${num} ${pick(STREET_NAMES)} St`
        }
        case '$randomCity':
            return pick(CITIES)
        case '$randomCountry':
            return pick(COUNTRIES).name
        case '$randomCountryCode':
            return pick(COUNTRIES).code
        case '$randomZipCode':
            return String(randomIntInclusive(89999) + 10000)
        case '$randomUrl': {
            const slug = pick(['api', 'docs', 'v1', 'health', 'users'])
            return `https://example.com/${slug}/${randomIntInclusive(999)}`
        }
        case '$randomIP':
            return `${randomIntInclusive(255)}.${randomIntInclusive(255)}.${randomIntInclusive(255)}.${randomIntInclusive(255)}`
        case '$randomIPV6': {
            const seg = () => randomIntInclusive(65535).toString(16)
            return `${seg()}:${seg()}:${seg()}:${seg()}:${seg()}:${seg()}:${seg()}:${seg()}`
        }
        case '$randomMACAddress': {
            const byte = () => randomIntInclusive(255).toString(16).padStart(2, '0')
            return Array.from({ length: 6 }, byte).join(':')
        }
        case '$randomDomainName':
            return `${pick(['app', 'cdn', 'api', 'www'])}.${pick(['example', 'acme', 'contoso'])}.com`
        case '$randomUserAgent':
            return pick(USER_AGENTS)
        case '$randomHexColor': {
            const byte = () => randomIntInclusive(255).toString(16).padStart(2, '0')
            return `#${byte()}${byte()}${byte()}`
        }
        case '$randomCompanyName':
            return `${pick(LAST_NAMES)} ${pick(COMPANY_SUFFIX)}`
        case '$randomJobTitle':
            return pick(JOB_TITLES)
        case '$randomPrice':
            return (Math.random() * 500 + 0.99).toFixed(2)
        case '$randomAlphaNumeric': {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
            let out = ''
            for (let i = 0; i < MOCK_RANDOM_ALPHANUMERIC_LENGTH; i++) {
                out += chars[randomIntInclusive(chars.length - 1)]
            }
            return out
        }
        case '$randomProductName':
            return `${pick(PRODUCT_NOUNS)} ${pick(PRODUCT_QUALIFIERS)}-${randomIntInclusive(8999) + 1000}`
        default:
            return null
    }
}
