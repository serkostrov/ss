import type { DbClient } from '../db.js'
import type { MessengerConfig } from '../config/index.js'
import { log } from '../types.js'
import { isSmtpBzConfigured } from './smtpbz.js'
import { isEmailDispatchConfigured } from './send-notification.js'

/**
 * DB trigger `request_notification_email` reads webhook URL/secret from
 * `public.app_settings`. Those rows are empty after migrations — without a
 * manual SQL update, in-app notifications work but emails never leave.
 * Sync them from messenger env on every boot when email is fully configured.
 */
export async function syncNotificationEmailWebhookSettings(
  db: DbClient,
  config: MessengerConfig,
): Promise<void> {
  if (!config.publicWebhookBaseUrl || !config.emailWebhookSecret) {
    log('warn', 'Notification email webhook sync skipped — set PUBLIC_WEBHOOK_BASE_URL and EMAIL_WEBHOOK_SECRET')
    return
  }

  if (!isSmtpBzConfigured(config) || !config.appUrl) {
    log('warn', 'Notification email webhook sync skipped — incomplete SMTP/APP_URL config', {
      smtpKey: Boolean(config.smtpbzApiKey),
      smtpFrom: Boolean(config.smtpFrom),
      appUrl: Boolean(config.appUrl),
    })
    return
  }

  if (!isEmailDispatchConfigured(config)) {
    log('warn', 'Notification email webhook sync skipped — email dispatch not configured')
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
}
