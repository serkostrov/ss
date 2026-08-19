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

type TokenRow = {
  id: string
  user_id: string
  created_at: string
}

const RESET_TOKEN_BYTES = 32
const RESET_TTL_MS = 30 * 60 * 1000
const RESET_COOLDOWN_MS = 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeAppUrl(appUrl: string): string {
  return appUrl.replace(/\/+$/, '')
}

function buildResetLink(appUrl: string, token: string): string {
  return `${normalizeAppUrl(appUrl)}/update-password?token=${encodeURIComponent(token)}`
}

function ensurePasswordResetConfigured(config: MessengerConfig): void {
  if (!isSmtpBzConfigured(config) || !config.appUrl) {
    const err = new Error('password_reset_not_configured')
    ;(err as Error & { status: number }).status = 503
    throw err
  }
}

async function findUserByEmail(db: DbClient, email: string): Promise<UserRow | null> {
  const { data, error } = await db
    .from('users')
    .select('id, email, full_name')
    .ilike('email', email)
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

  if (error) throw error
  return Boolean(data?.id)
}

async function revokeUnusedResetTokens(db: DbClient, userId: string): Promise<void> {
  const { error } = await db
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null)

  if (error) throw error
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

  if (error) throw error
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
): Promise<{ ok: true }> {
  ensurePasswordResetConfigured(config)

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    const err = new Error('email_required')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  const user = await findUserByEmail(db, normalizedEmail)
  if (!user?.email) {
    log('info', 'Password reset requested for unknown email', { email: normalizedEmail })
    return { ok: true }
  }

  if (await recentResetRequestExists(db, user.id)) {
    log('info', 'Password reset request throttled', { userId: user.id })
    return { ok: true }
  }

  await revokeUnusedResetTokens(db, user.id)
  const rawToken = await createResetToken(db, user.id)
  await sendPasswordResetEmail(config, user, rawToken)

  log('info', 'Password reset email sent', { userId: user.id, email: user.email })
  return { ok: true }
}

async function consumeResetToken(
  db: DbClient,
  rawToken: string,
): Promise<{ tokenId: string; userId: string }> {
  const tokenHash = hashToken(rawToken)
  const { data, error } = await db
    .from('password_reset_tokens')
    .select('id, user_id, created_at, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) throw error

  const token = (data as (TokenRow & { expires_at: string; used_at: string | null }) | null) ?? null
  if (!token || token.used_at) {
    const err = new Error('password_reset_token_invalid')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  if (new Date(token.expires_at).getTime() < Date.now()) {
    const err = new Error('password_reset_token_expired')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  return { tokenId: token.id, userId: token.user_id }
}

export async function confirmPasswordReset(
  db: DbClient,
  _config: MessengerConfig,
  input: { token: string; password: string },
): Promise<{ ok: true }> {
  const rawToken = input.token.trim()
  if (!rawToken) {
    const err = new Error('password_reset_token_required')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  if (input.password.length < 8 || input.password.length > 72) {
    const err = new Error('invalid_password')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  const { tokenId, userId } = await consumeResetToken(db, rawToken)

  const { error: authError } = await db.auth.admin.updateUserById(userId, {
    password: input.password,
    email_confirm: true,
  })
  if (authError) throw authError

  const { error: markError } = await db
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenId)

  if (markError) throw markError

  log('info', 'Password reset confirmed', { userId })
  return { ok: true }
}
