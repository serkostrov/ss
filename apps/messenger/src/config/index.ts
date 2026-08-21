export type MessengerConfig = {
  port: number
  supabaseUrl: string
  supabaseServiceRoleKey: string
  telegramBotToken: string | null
  telegramWebhookSecret: string | null
  maxBotToken: string | null
  maxWebhookSecret: string | null
  publicWebhookBaseUrl: string | null
  /** smtp.bz API key for notification emails (optional). */
  smtpbzApiKey: string | null
  smtpFrom: string | null
  smtpFromName: string
  appUrl: string | null
  emailWebhookSecret: string | null
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

function optional(name: string): string | null {
  const value = process.env[name]?.trim()
  return value || null
}

function normalizeWebhookBaseUrl(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(
      `PUBLIC_WEBHOOK_BASE_URL is not a valid URL: ${JSON.stringify(raw)}. Example: https://messenger.example.com`,
    )
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `PUBLIC_WEBHOOK_BASE_URL must use HTTPS (Telegram/Max require it). Got: ${parsed.href}`,
    )
  }
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    throw new Error(
      `PUBLIC_WEBHOOK_BASE_URL cannot be localhost — Telegram/Max cannot reach it. Use a public HTTPS URL or a tunnel (cloudflared/ngrok).`,
    )
  }
  return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')}`
}

export function loadConfig(): MessengerConfig {
  const logLevelRaw = (process.env.LOG_LEVEL ?? 'info').toLowerCase()
  const logLevel =
    logLevelRaw === 'debug' ||
    logLevelRaw === 'info' ||
    logLevelRaw === 'warn' ||
    logLevelRaw === 'error'
      ? logLevelRaw
      : 'info'

  return {
    port: Number(process.env.PORT ?? process.env.MESSENGER_PORT ?? 8787),
    // DEV: в корневом .env обычно лежат VITE_* переменные для web.
    // Worker использует non-VITE ключи, поэтому даём fallback.
    supabaseUrl: process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || required('SUPABASE_URL'),
    // Never read VITE_* service-role keys — Vite would bake them into the SPA.
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || required('SUPABASE_SERVICE_ROLE_KEY'),
    telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
    telegramWebhookSecret: optional('TELEGRAM_WEBHOOK_SECRET'),
    maxBotToken: optional('MAX_BOT_TOKEN'),
    maxWebhookSecret: optional('MAX_WEBHOOK_SECRET'),
    publicWebhookBaseUrl: normalizeWebhookBaseUrl(optional('PUBLIC_WEBHOOK_BASE_URL')),
    smtpbzApiKey: optional('SMTPBZ_API_KEY'),
    smtpFrom: optional('SMTP_FROM'),
    smtpFromName: optional('SMTP_FROM_NAME') ?? 'АПСС(ЭР)',
    appUrl: optional('APP_URL') ?? optional('VITE_APP_URL'),
    emailWebhookSecret: optional('EMAIL_WEBHOOK_SECRET'),
    logLevel,
  }
}

export type { MessengerConfig as Config }
