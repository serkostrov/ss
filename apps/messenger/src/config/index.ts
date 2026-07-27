export type MessengerConfig = {
  port: number
  supabaseUrl: string
  supabaseServiceRoleKey: string
  telegramBotToken: string | null
  telegramWebhookSecret: string | null
  maxBotToken: string | null
  maxWebhookSecret: string | null
  publicWebhookBaseUrl: string | null
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
    supabaseUrl: required('SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
    telegramWebhookSecret: optional('TELEGRAM_WEBHOOK_SECRET'),
    maxBotToken: optional('MAX_BOT_TOKEN'),
    maxWebhookSecret: optional('MAX_WEBHOOK_SECRET'),
    publicWebhookBaseUrl: optional('PUBLIC_WEBHOOK_BASE_URL')?.replace(/\/+$/, '') ?? null,
    logLevel,
  }
}

export type { MessengerConfig as Config }
