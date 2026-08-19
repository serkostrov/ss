import type { MessengerConfig } from '../config/index.js'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function isSmtpBzConfigured(config: MessengerConfig): boolean {
  return Boolean(config.smtpbzApiKey && config.smtpFrom)
}

export async function sendViaSmtpBz(input: {
  apiKey: string
  from: string
  fromName: string
  to: string
  toName: string | null
  subject: string
  html: string
  text: string
  tag?: string
}): Promise<void> {
  const form = new FormData()
  form.set('from', input.from)
  form.set('name', input.fromName)
  form.set('to', input.to)
  if (input.toName) form.set('to_name', input.toName)
  form.set('subject', input.subject)
  form.set('html', input.html)
  form.set('text', input.text)
  form.set('tag', input.tag ?? 'apss-email')

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
