import type { DbClient } from '../db.js'
import type { MessengerConfig } from '../config/index.js'
import { log } from '../types.js'
import { escapeHtml, isSmtpBzConfigured, sendViaSmtpBz } from './smtpbz.js'

type NotificationRow = {
  id: string
  user_id: string
  title: string
  body: string | null
  link: string | null
}

type UserRow = {
  id: string
  email: string
  full_name: string | null
  email_notifications_enabled: boolean
}

function absoluteLink(appUrl: string, link: string | null): string | null {
  if (!link) return null
  if (/^https?:\/\//i.test(link)) return link
  const base = appUrl.replace(/\/+$/, '')
  const path = link.startsWith('/') ? link : `/${link}`
  return `${base}${path}`
}

export function isEmailDispatchConfigured(config: MessengerConfig): boolean {
  return Boolean(
    isSmtpBzConfigured(config) &&
      config.smtpFrom &&
      config.emailWebhookSecret &&
      config.appUrl,
  )
}

export async function dispatchNotificationEmail(
  db: DbClient,
  config: MessengerConfig,
  notificationId: string,
): Promise<{ ok: true; skipped?: boolean }> {
  if (!isEmailDispatchConfigured(config)) {
    const err = new Error('email_not_configured')
    ;(err as Error & { status: number }).status = 503
    throw err
  }

  const { data: notification, error: notificationError } = await db
    .from('notifications')
    .select('id, user_id, title, body, link')
    .eq('id', notificationId)
    .maybeSingle()

  if (notificationError) throw notificationError
  if (!notification) {
    const err = new Error('notification_not_found')
    ;(err as Error & { status: number }).status = 404
    throw err
  }

  const row = notification as NotificationRow

  const { data: user, error: userError } = await db
    .from('users')
    .select('id, email, full_name, email_notifications_enabled')
    .eq('id', row.user_id)
    .maybeSingle()

  if (userError) throw userError

  const member = user as UserRow | null
  if (!member?.email || !member.email_notifications_enabled) {
    return { ok: true, skipped: true }
  }

  const link = absoluteLink(config.appUrl!, row.link)
  const bodyText = row.body?.trim() || 'Откройте личный кабинет, чтобы посмотреть подробности.'
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111827">
      <p style="margin:0 0 12px">Здравствуйте${member.full_name ? `, ${escapeHtml(member.full_name)}` : ''}!</p>
      <p style="margin:0 0 8px;font-size:18px;font-weight:600">${escapeHtml(row.title)}</p>
      <p style="margin:0 0 16px">${escapeHtml(bodyText)}</p>
      ${
        link
          ? `<p style="margin:0 0 16px"><a href="${escapeHtml(link)}" style="color:#0f766e">Открыть в кабинете</a></p>`
          : ''
      }
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280">
        Это письмо отправлено, потому что включены уведомления на email в личном кабинете АПСС.
      </p>
    </div>
  `
  const text = [
    `Здравствуйте${member.full_name ? `, ${member.full_name}` : ''}!`,
    '',
    row.title,
    bodyText,
    link ? `Открыть: ${link}` : '',
    '',
    'Отключить: Кабинет → Уведомления.',
  ]
    .filter(Boolean)
    .join('\n')

  await sendViaSmtpBz({
    apiKey: config.smtpbzApiKey!,
    from: config.smtpFrom!,
    fromName: config.smtpFromName,
    to: member.email,
    toName: member.full_name,
    subject: row.title,
    html,
    text,
    tag: 'apss-notification',
  })

  log('info', 'Notification email sent', {
    notificationId,
    to: member.email,
  })

  return { ok: true }
}
