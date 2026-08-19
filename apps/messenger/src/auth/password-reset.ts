import { createHash, randomBytes } from 'node:crypto'

import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { log } from '../types.js'
import { escapeHtml, isSmtpBzConfigured, sendViaSmtpBz } from '../email/smtpbz.js'

type UserRow = {
  id: string
  email: string
  full_name: string | null
}

const RESET_TOKEN_BYTES = 32
const RESET_TTL_MS = 30 * 60 * 1000
const RESET_COOLDOWN_MS = 60 * 1000
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX = 5

const requestHits = new Map<string, number[]>()

function httpError(code: string, status: number): Error {
  const err = new Error(code)
  ;(err as Error & { status: number }).status = status
  return err
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeAppUrl(appUrl: string): string {
  return appUrl.replace(/\/+$/, '')
}

function buildResetLink(appUrl: string, token: string): string {
  return `${normalizeAppUrl(appUrl)}/update-password?token=${encodeURIComponent(token)}`
}

export function isPasswordResetConfigured(config: MessengerConfig): boolean {
  return Boolean(isSmtpBzConfigured(config) && config.appUrl)
}

function ensurePasswordResetConfigured(config: MessengerConfig): void {
  if (!isPasswordResetConfigured(config)) {
    throw httpError('password_reset_not_configured', 503)
  }
}

function isMissingTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message ?? ''
  return (
    error?.code === '42P01' ||
    /password_reset_tokens/i.test(message) ||
    /does not exist/i.test(message)
  )
}

function allowRequest(key: string): boolean {
  const now = Date.now()
  const recent = (requestHits.get(key) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    requestHits.set(key, recent)
    return false
  }
  recent.push(now)
  requestHits.set(key, recent)
  return true
}

async function findUserByEmail(db: DbClient, email: string): Promise<UserRow | null> {
  const { data, error } = await db
    .from('users')
    .select('id, email, full_name')
    .ilike('email', email.replace(/[%_]/g, ''))
    .maybeSingle()

  if (error) throw error
  return (data as UserRow | null) ?? null
}

async function recentResetRequestExists(db: DbClient, userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RESET_COOLDOWN_MS).toISOString()
  const { data, error } = await db
    .from('password_reset_tokens')
    .select('id')
    .eq('user_id', userId)
    .is('used_at', null)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) throw httpError('password_reset_not_configured', 503)
    throw error
  }
  return Boolean(data?.id)
}

async function revokeUnusedResetTokens(db: DbClient, userId: string): Promise<void> {
  const { error } = await db
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null)

  if (error) {
    if (isMissingTableError(error)) throw httpError('password_reset_not_configured', 503)
    throw error
  }
}

async function createResetToken(db: DbClient, userId: string): Promise<string> {
  const rawToken = randomBytes(RESET_TOKEN_BYTES).toString('base64url')
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString()

  const { error } = await db.from('password_reset_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })

  if (error) {
    if (isMissingTableError(error)) throw httpError('password_reset_not_configured', 503)
    throw error
  }
  return rawToken
}

async function sendPasswordResetEmail(
  config: MessengerConfig,
  user: UserRow,
  rawToken: string,
): Promise<void> {
  const link = buildResetLink(config.appUrl!, rawToken)
  const subject = 'Восстановление пароля'
  const greeting = user.full_name ? `, ${escapeHtml(user.full_name)}` : ''
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#111827">
      <p style="margin:0 0 12px">Здравствуйте${greeting}!</p>
      <p style="margin:0 0 12px">
        Вы запросили восстановление пароля для личного кабинета АПСС.
      </p>
      <p style="margin:0 0 16px">
        <a href="${escapeHtml(link)}" style="color:#0f766e">Задать новый пароль</a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280">
        Ссылка действует 30 минут и может быть использована только один раз.
      </p>
      <p style="margin:0;color:#6b7280">
        Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.
      </p>
    </div>
  `
  const text = [
    `Здравствуйте${user.full_name ? `, ${user.full_name}` : ''}!`,
    '',
    'Вы запросили восстановление пароля для личного кабинета АПСС.',
    `Ссылка для смены пароля: ${link}`,
    'Ссылка действует 30 минут и может быть использована только один раз.',
    'Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.',
  ].join('\n')

  await sendViaSmtpBz({
    apiKey: config.smtpbzApiKey!,
    from: config.smtpFrom!,
    fromName: config.smtpFromName,
    to: user.email,
    toName: user.full_name,
    subject,
    html,
    text,
    tag: 'apss-password-reset',
  })
}

export async function requestPasswordReset(
  db: DbClient,
  config: MessengerConfig,
  email: string,
  clientKey = 'unknown',
): Promise<{ ok: true }> {
  ensurePasswordResetConfigured(config)

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw httpError('email_required', 400)
  }

  if (!allowRequest(`ip:${clientKey}`) || !allowRequest(`email:${normalizedEmail}`)) {
    throw httpError('password_reset_rate_limited', 429)
  }

  const user = await findUserByEmail(db, normalizedEmail)
  if (!user?.email) {
    log('info', 'Password reset requested for unknown email')
    return { ok: true }
  }

  if (await recentResetRequestExists(db, user.id)) {
    log('info', 'Password reset request throttled', { userId: user.id })
    return { ok: true }
  }

  await revokeUnusedResetTokens(db, user.id)
  const rawToken = await createResetToken(db, user.id)

  try {
    await sendPasswordResetEmail(config, user, rawToken)
  } catch (error) {
    log('error', 'Password reset email failed', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    })
    throw httpError('password_reset_email_failed', 503)
  }

  log('info', 'Password reset email sent', { userId: user.id })
  return { ok: true }
}

async function consumeResetToken(
  db: DbClient,
  rawToken: string,
): Promise<{ tokenId: string; userId: string }> {
  const tokenHash = hashToken(rawToken)
  const now = new Date().toISOString()

  const { data, error } = await db
    .from('password_reset_tokens')
    .update({ used_at: now })
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('id, user_id')
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) throw httpError('password_reset_not_configured', 503)
    throw error
  }

  if (!data?.id || !data.user_id) {
    const { data: existing, error: lookupError } = await db
      .from('password_reset_tokens')
      .select('id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (existing?.used_at) throw httpError('password_reset_token_invalid', 400)
    if (existing && new Date(existing.expires_at as string).getTime() < Date.now()) {
      throw httpError('password_reset_token_expired', 400)
    }
    throw httpError('password_reset_token_invalid', 400)
  }

  return { tokenId: data.id as string, userId: data.user_id as string }
}

export async function confirmPasswordReset(
  db: DbClient,
  _config: MessengerConfig,
  input: { token: string; password: string },
): Promise<{ ok: true }> {
  const rawToken = input.token.trim()
  if (!rawToken) throw httpError('password_reset_token_required', 400)

  if (input.password.length < 8 || input.password.length > 72) {
    throw httpError('invalid_password', 400)
  }

  const { tokenId, userId } = await consumeResetToken(db, rawToken)

  const { error: authError } = await db.auth.admin.updateUserById(userId, {
    password: input.password,
    email_confirm: true,
  })

  if (authError) {
    await db.from('password_reset_tokens').update({ used_at: null }).eq('id', tokenId)
    log('warn', 'Password reset confirm failed', {
      userId,
      message: authError.message,
    })
    throw httpError('password_reset_failed', 500)
  }

  log('info', 'Password reset confirmed', { userId })
  return { ok: true }
}
