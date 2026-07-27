import { loadEnvFiles } from './load-env.js'
loadEnvFiles()

import { registerMaxWebhook, registerTelegramWebhook } from './adapters/index.js'
import { loadConfig } from './config/index.js'
import { createDb } from './db.js'
import { startHttpServer } from './http/server.js'
import { log } from './types.js'

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts = [error.message]
  const cause = (error as Error & { cause?: unknown }).cause
  if (cause instanceof Error) parts.push(cause.message)
  else if (cause != null) parts.push(String(cause))
  return parts.join(' | ')
}

async function main() {
  const config = loadConfig()
  const db = createDb(config)

  startHttpServer(config, db)

  if (config.publicWebhookBaseUrl) {
    log('info', 'Webhook base URL', { url: config.publicWebhookBaseUrl })

    if (config.telegramBotToken) {
      try {
        await registerTelegramWebhook(
          config.telegramBotToken,
          config.publicWebhookBaseUrl,
          config.telegramWebhookSecret,
        )
      } catch (error) {
        log('error', 'Telegram webhook registration failed', {
          message: formatError(error),
          webhookUrl: `${config.publicWebhookBaseUrl}/webhooks/telegram`,
        })
      }
    } else {
      log('warn', 'TELEGRAM_BOT_TOKEN not set — Telegram webhook skipped')
    }

    if (config.maxBotToken) {
      try {
        await registerMaxWebhook(
          config.maxBotToken,
          config.publicWebhookBaseUrl,
          config.maxWebhookSecret,
        )
      } catch (error) {
        const message = formatError(error)
        log('error', 'Max webhook registration failed', {
          message,
          webhookUrl: `${config.publicWebhookBaseUrl}/webhooks/max`,
          hint: message.toLowerCase().includes('cert')
            ? 'Max API uses the Russian Минцифры CA — install it or set NODE_EXTRA_CA_CERTS'
            : undefined,
        })
      }
    } else {
      log('warn', 'MAX_BOT_TOKEN not set — Max webhook skipped')
    }
  } else {
    log('warn', 'PUBLIC_WEBHOOK_BASE_URL not set — webhook registration skipped')
  }

  log('info', 'Messenger worker ready')
}

main().catch((error) => {
  console.error('[messenger] fatal', formatError(error))
  process.exit(1)
})
