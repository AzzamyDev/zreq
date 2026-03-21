/** Strip line and block comments outside JSON strings (JSONC-style). */

export function stripJsonComments(input: string): string {
    let i = 0
    let out = ''
    let inString = false
    let escape = false
    const n = input.length

    while (i < n) {
        const c = input[i]!

        if (escape) {
            out += c
            escape = false
            i++
            continue
        }

        if (inString) {
            if (c === '\\') {
                escape = true
                out += c
            } else if (c === '"') {
                inString = false
                out += c
            } else {
                out += c
            }
            i++
            continue
        }

        if (c === '"') {
            inString = true
            out += c
            i++
            continue
        }

        if (c === '/' && input[i + 1] === '/') {
            i += 2
            while (i < n && input[i] !== '\n' && input[i] !== '\r') i++
            continue
        }

        if (c === '/' && input[i + 1] === '*') {
            i += 2
            while (i < n - 1) {
                if (input[i] === '*' && input[i + 1] === '/') {
                    i += 2
                    break
                }
                i++
            }
            continue
        }

        out += c
        i++
    }

    return out
}
