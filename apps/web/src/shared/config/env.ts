import { z } from 'zod'

declare global {
  interface Window {
    __ENV__?: {
      VITE_SUPABASE_URL?: string
      VITE_SUPABASE_ANON_KEY?: string
      VITE_APP_URL?: string
      VITE_TELEGRAM_BOT_URL?: string
      VITE_MAX_BOT_URL?: string
      VITE_MESSENGER_API_URL?: string
    }
  }
}

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url('must be a valid URL').optional(),
)

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z
    .string({ required_error: 'VITE_SUPABASE_URL is required' })
    .url('VITE_SUPABASE_URL must be a valid URL'),
  VITE_SUPABASE_ANON_KEY: z
    .string({ required_error: 'VITE_SUPABASE_ANON_KEY is required' })
    .min(1, 'VITE_SUPABASE_ANON_KEY must not be empty'),
  VITE_APP_URL: optionalUrl,
  VITE_TELEGRAM_BOT_URL: optionalUrl,
  VITE_MAX_BOT_URL: optionalUrl,
  VITE_MESSENGER_API_URL: optionalUrl,
  MODE: z.enum(['development', 'production', 'test']),
  DEV: z.boolean(),
  PROD: z.boolean(),
})

export type ClientEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
  appUrl: string
  telegramBotUrl: string | null
  maxBotUrl: string | null
  /** Public messenger worker origin (e.g. https://messenger.example.com). Empty → same-origin /api/messenger. */
  messengerApiUrl: string | null
  mode: 'development' | 'production' | 'test'
  isDev: boolean
  isProd: boolean
}

function formatEnvError(error: z.ZodError): string {
  const details = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')
  return [
    'Invalid environment configuration.',
    'Copy `.env.example` to `.env` and fill in the values.',
    'On Dokploy set VITE_* as runtime Environment variables (not only build args).',
    details,
  ].join('\n')
}

function readRuntimeEnv() {
  if (typeof window === 'undefined') return {}
  return window.__ENV__ ?? {}
}

function pick(runtime: string | undefined, baked: unknown): unknown {
  const fromRuntime = emptyToUndefined(runtime)
  if (fromRuntime !== undefined) return fromRuntime
  return emptyToUndefined(baked)
}

let cachedEnv: ClientEnv | undefined

export function getClientEnv(): ClientEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  const runtime = readRuntimeEnv()
  const parsed = clientEnvSchema.safeParse({
    VITE_SUPABASE_URL: pick(runtime.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: pick(
      runtime.VITE_SUPABASE_ANON_KEY,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    ),
    VITE_APP_URL: pick(runtime.VITE_APP_URL, import.meta.env.VITE_APP_URL),
    VITE_TELEGRAM_BOT_URL: pick(
      runtime.VITE_TELEGRAM_BOT_URL,
      import.meta.env.VITE_TELEGRAM_BOT_URL,
    ),
    VITE_MAX_BOT_URL: pick(runtime.VITE_MAX_BOT_URL, import.meta.env.VITE_MAX_BOT_URL),
    VITE_MESSENGER_API_URL: pick(
      runtime.VITE_MESSENGER_API_URL,
      import.meta.env.VITE_MESSENGER_API_URL,
    ),
    MODE: import.meta.env.MODE,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
  })

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error))
  }

  const data = parsed.data

  cachedEnv = {
    supabaseUrl: data.VITE_SUPABASE_URL,
    supabaseAnonKey: data.VITE_SUPABASE_ANON_KEY,
    appUrl: data.VITE_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : ''),
    telegramBotUrl: data.VITE_TELEGRAM_BOT_URL ?? null,
    maxBotUrl: data.VITE_MAX_BOT_URL ?? null,
    messengerApiUrl: data.VITE_MESSENGER_API_URL?.replace(/\/+$/, '') ?? null,
    mode: data.MODE,
    isDev: data.DEV,
    isProd: data.PROD,
  }

  return cachedEnv
}

/** Lazy validated env — first property access runs Zod checks. */
export const env: ClientEnv = new Proxy({} as ClientEnv, {
  get(_target, property) {
    const value = getClientEnv()[property as keyof ClientEnv]
    return value
  },
})
