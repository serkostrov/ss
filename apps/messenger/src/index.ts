import { registerMaxWebhook, registerTelegramWebhook } from './adapters/index.js'
import { loadConfig } from './config/index.js'
import { createDb } from './db.js'
import { startHttpServer } from './http/server.js'
import { log } from './types.js'

async function main() {
  const config = loadConfig()
  const db = createDb(config)

  startHttpServer(config, db)

  if (config.publicWebhookBaseUrl) {
    if (config.telegramBotToken) {
      try {
        await registerTelegramWebhook(
          config.telegramBotToken,
          config.publicWebhookBaseUrl,
          config.telegramWebhookSecret,
        )
      } catch (error) {
        log('error', 'Telegram webhook registration failed', {
          message: error instanceof Error ? error.message : String(error),
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
        log('error', 'Max webhook registration failed', {
          message: error instanceof Error ? error.message : String(error),
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
  console.error('[messenger] fatal', error)
  process.exit(1)
})
