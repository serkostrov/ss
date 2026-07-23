import { ApiError } from '@shared/lib/errors'

const SERVICE_ROLE_HINTS = ['service_role', 'service-role']

/**
 * Prevent accidental use of service_role key in the browser bundle.
 */
export function assertBrowserSafeKeys(input: {
  supabaseUrl: string
  supabaseAnonKey: string
}): void {
  const key = input.supabaseAnonKey.trim()

  if (!key) {
    throw new ApiError('Supabase anon key is empty', { code: 'validation' })
  }

  const lower = key.toLowerCase()
  if (SERVICE_ROLE_HINTS.some((hint) => lower.includes(hint))) {
    throw new ApiError('Refusing to initialize browser client with a service_role key', {
      code: 'forbidden',
    })
  }

  // JWT payload role check when key looks like a JWT
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
        role?: string
      }
      if (payload.role === 'service_role') {
        throw new ApiError('Refusing to initialize browser client with service_role JWT', {
          code: 'forbidden',
        })
      }
    } catch (error) {
      if (error instanceof ApiError) throw error
      // Non-decodable placeholder keys in local .env are allowed
    }
  }

  if (typeof window !== 'undefined') {
    // Hard guard: never attach secrets to window for debugging
    const blocked = ['__SUPABASE_SERVICE_ROLE__', '__SERVICE_ROLE_KEY__'] as const
    for (const name of blocked) {
      try {
        Object.defineProperty(window, name, {
          configurable: false,
          enumerable: false,
          get() {
            throw new ApiError('Access to service role secrets from the browser is forbidden', {
              code: 'forbidden',
            })
          },
        })
      } catch {
        // Ignore if already defined
      }
    }
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /service_role/gi,
]

/** Redact tokens from strings before logging. */
export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), value)
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactSecrets(error.message)
  }
  return redactSecrets(String(error))
}

/** Never dump session / access_token objects to console. */
export function sanitizeForLog(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') return redactSecrets(value)
  if (typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map(sanitizeForLog)
  }

  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/token|password|secret|authorization|apikey|refresh/i.test(key)) {
      output[key] = '[REDACTED]'
      continue
    }
    output[key] = sanitizeForLog(entry)
  }
  return output
}
