import type { DbClient } from '../db.js'
import type { MessengerConfig } from '../config/index.js'
import { log } from '../types.js'
import { isSmtpBzConfigured } from './smtpbz.js'

/**
 * DB trigger `request_notification_email` reads webhook URL/secret from
 * `public.app_settings`. Those rows are empty after migrations — without sync,
 * in-app notifications work but emails never leave.
 *
 * Sync needs PUBLIC_WEBHOOK_BASE_URL + EMAIL_WEBHOOK_SECRET + SMTP.
 * APP_URL is optional here (only used later for deep links in the email body).
 */
export async function syncNotificationEmailWebhookSettings(
  db: DbClient,
  config: MessengerConfig,
): Promise<void> {
  if (!config.publicWebhookBaseUrl || !config.emailWebhookSecret) {
    log(
      'warn',
      'Notification email webhook sync skipped — set PUBLIC_WEBHOOK_BASE_URL and EMAIL_WEBHOOK_SECRET',
    )
    return
  }

  if (!isSmtpBzConfigured(config)) {
    log('warn', 'Notification email webhook sync skipped — incomplete SMTP config', {
      smtpKey: Boolean(config.smtpbzApiKey),
      smtpFrom: Boolean(config.smtpFrom),
    })
    return
  }

  const url = `${config.publicWebhookBaseUrl}/v1/notification-email`

  const { error } = await db.rpc('sync_notification_email_webhook', {
    p_url: url,
    p_secret: config.emailWebhookSecret,
  })

  if (error) {
    log('error', 'Failed to sync notification email webhook settings', {
      message: error.message,
      code: error.code,
      hint: 'Apply migration 20261016000001_fix_notification_email_dispatch.sql',
    })
    return
  }

  log('info', 'Notification email webhook settings synced', { url })
  if (!config.appUrl) {
    log(
      'warn',
      'APP_URL is not set — emails will send, but cabinet links inside them may be omitted. Set APP_URL=https://your-app.example',
    )
  }
}
