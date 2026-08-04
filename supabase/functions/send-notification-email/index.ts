/**
 * Duplicate in-app notifications to member email via smtp.bz API.
 * Invoked by DB trigger (pg_net) after insert into public.notifications.
 *
 * Secrets (Supabase Edge Function env):
 * - SMTPBZ_API_KEY
 * - SMTP_FROM (verified sender on smtp.bz)
 * - SMTP_FROM_NAME (optional)
 * - APP_URL (cabinet base URL for links)
 * - EMAIL_WEBHOOK_SECRET (must match app_settings.notification_email_webhook_secret)
 * - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injected on hosted Supabase)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import { corsHeaders } from '../_shared/cors.ts'

type NotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  created_at: string
}

type UserRow = {
  id: string
  email: string
  full_name: string | null
  email_notifications_enabled: boolean
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function absoluteLink(appUrl: string, link: string | null): string | null {
  if (!link) return null
  if (/^https?:\/\//i.test(link)) return link
  const base = appUrl.replace(/\/+$/, '')
  const path = link.startsWith('/') ? link : `/${link}`
  return `${base}${path}`
}

async function sendViaSmtpBz(input: {
  apiKey: string
  from: string
  fromName: string
  to: string
  toName: string | null
  subject: string
  html: string
  text: string
}): Promise<void> {
  const form = new FormData()
  form.set('from', input.from)
  form.set('name', input.fromName)
  form.set('to', input.to)
  if (input.toName) form.set('to_name', input.toName)
  form.set('subject', input.subject)
  form.set('html', input.html)
  form.set('text', input.text)
  form.set('tag', 'apss-notification')

  const response = await fetch('https://api.smtp.bz/v1/smtp/send', {
    method: 'POST',
    headers: {
      Authorization: input.apiKey,
      Accept: 'application/json',
    },
    body: form,
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`smtp.bz error ${response.status}: ${detail}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const expectedSecret = Deno.env.get('EMAIL_WEBHOOK_SECRET') ?? ''
  const providedSecret = req.headers.get('x-apss-webhook-secret') ?? ''
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('SMTPBZ_API_KEY') ?? ''
  const from = Deno.env.get('SMTP_FROM') ?? ''
  const fromName = Deno.env.get('SMTP_FROM_NAME') ?? 'АПСС «Северное сияние»'
  const appUrl = Deno.env.get('APP_URL') ?? Deno.env.get('VITE_APP_URL') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!apiKey || !from || !supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'misconfigured' }, 500)
  }

  let notificationId: string | null = null
  try {
    const payload = (await req.json()) as { notification_id?: string; record?: { id?: string } }
    notificationId = payload.notification_id ?? payload.record?.id ?? null
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  if (!notificationId) {
    return jsonResponse({ error: 'notification_id_required' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: notification, error: notificationError } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, link, created_at')
    .eq('id', notificationId)
    .maybeSingle()

  if (notificationError) {
    return jsonResponse({ error: notificationError.message }, 500)
  }
  if (!notification) {
    return jsonResponse({ error: 'notification_not_found' }, 404)
  }

  const row = notification as NotificationRow

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name, email_notifications_enabled')
    .eq('id', row.user_id)
    .maybeSingle()

  if (userError) {
    return jsonResponse({ error: userError.message }, 500)
  }

  const member = user as UserRow | null
  if (!member?.email || !member.email_notifications_enabled) {
    return jsonResponse({ ok: true, skipped: true })
  }

  const link = absoluteLink(appUrl, row.link)
  const bodyText = row.body?.trim() || 'Откройте личный кабинет, чтобы посмотреть подробности.'
  const subject = row.title
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

  try {
    await sendViaSmtpBz({
      apiKey,
      from,
      fromName,
      to: member.email,
      toName: member.full_name,
      subject,
      html,
      text,
    })
  } catch (error) {
    console.error('send-notification-email failed', error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'send_failed' },
      502,
    )
  }

  return jsonResponse({ ok: true })
})
