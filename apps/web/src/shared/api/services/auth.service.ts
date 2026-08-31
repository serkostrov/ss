import type { CompanyAccessStatus, TableRow, UserRole, UserStatus } from '../types/database'
import type {
  AuthChangeEvent,
  Session,
  Subscription,
  User,
  AuthError as SupabaseAuthError,
} from '@supabase/supabase-js'

import { toApiError } from '@shared/lib/errors'
import { env, routes } from '@shared/config'

import { supabaseClient, syncRealtimeAuth } from '../lib/client'
import { fromSupabaseError, unwrapMaybe } from '../lib/helpers'
import { sanitizeForLog } from '../lib/security'

export type SignInInput = {
  email: string
  password: string
}

export type SignUpInput = {
  email: string
  password: string
  fullName: string
  position?: string
  phone?: string
  companyNameHint?: string
  companyInnHint?: string
  /** Whether other members may see phone/email in the association directory. */
  showContactsToMembers?: boolean
  /** Duplicate in-app notifications to registration email. */
  emailNotificationsEnabled?: boolean
  /** Telegram username without @. */
  telegramUsername?: string
  /** Required gate — registration is rejected without acceptance. */
  accepted: true
}

/** Company + level resolved through users → representatives → companies. */
export type MemberMembership = {
  representativeId: string
  representativeName: string | null
  companyId: string
  companyName: string
  companyBalance: number
  accessStatus: CompanyAccessStatus
  accessStatusExcludesProgram: boolean
  accessStatusIsDefault: boolean
  participationLevelId: string | null
  participationLevelName: string | null
  participationLevelActive: boolean | null
}

export type AuthProfile = {
  id: string
  email: string | null
  role: UserRole | null
  status: UserStatus | null
  representativeId: string | null
  fullName: string | null
  position: string | null
  phone: string | null
  telegramUsername: string | null
  showContactsToMembers: boolean
  emailNotificationsEnabled: boolean
  companyNameHint: string | null
  companyInnHint: string | null
  staffPosition: string | null
  isCeo: boolean
  canManageWorkGroups: boolean
  membership: MemberMembership | null
}

export type UpdateOwnMemberProfileInput = {
  fullName: string
  position?: string | null
  phone?: string | null
  telegramUsername?: string | null
  showContactsToMembers: boolean
}

type ProfileCompanyAccessStatusRow = {
  excludes_from_program: boolean
  is_default: boolean
}

type ProfileCompanyRow = {
  id: string
  name: string
  access_status: CompanyAccessStatus
  participation_level_id: string | null
  balance: number | string | null
  participation_levels:
    | {
        id: string
        name: string
        is_active: boolean
      }
    | Array<{
        id: string
        name: string
        is_active: boolean
      }>
    | null
  company_access_statuses:
    | ProfileCompanyAccessStatusRow
    | ProfileCompanyAccessStatusRow[]
    | null
}

type ProfileRepresentativeRow = {
  id: string
  full_name: string
  position: string | null
  phone: string | null
  telegram_username: string | null
  max_username: string | null
  show_contacts_to_members: boolean
  companies: ProfileCompanyRow | ProfileCompanyRow[] | null
}

type ProfileQueryRow = Pick<
  TableRow<'users'>,
  | 'id'
  | 'email'
  | 'role'
  | 'status'
  | 'representative_id'
  | 'full_name'
  | 'phone'
  | 'telegram_username'
  | 'max_username'
  | 'show_contacts_to_members'
  | 'email_notifications_enabled'
  | 'company_name_hint'
  | 'company_inn_hint'
  | 'staff_position'
  | 'is_ceo'
  | 'can_manage_work_groups'
> & {
  representatives: ProfileRepresentativeRow | ProfileRepresentativeRow[] | null
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapMembership(row: ProfileQueryRow): MemberMembership | null {
  const representative = firstRelation(row.representatives)
  if (!representative) return null

  const company = firstRelation(representative.companies)
  if (!company) return null

  const level = firstRelation(company.participation_levels)
  const accessStatusMeta = firstRelation(company.company_access_statuses)

  return {
    representativeId: representative.id,
    representativeName: representative.full_name,
    companyId: company.id,
    companyName: company.name,
    companyBalance: Number(company.balance) || 0,
    accessStatus: company.access_status,
    accessStatusExcludesProgram:
      accessStatusMeta?.excludes_from_program ?? company.access_status === 'archived',
    accessStatusIsDefault: accessStatusMeta?.is_default ?? company.access_status === 'active',
    participationLevelId: company.participation_level_id,
    participationLevelName: level?.name ?? null,
    participationLevelActive: level?.is_active ?? null,
  }
}

function mapProfile(row: ProfileQueryRow): AuthProfile {
  const representative = firstRelation(row.representatives)

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    representativeId: row.representative_id,
    fullName: representative?.full_name ?? row.full_name,
    position: representative?.position ?? null,
    phone: representative?.phone ?? row.phone,
    telegramUsername: representative?.telegram_username ?? row.telegram_username,
    showContactsToMembers:
      representative?.show_contacts_to_members ?? row.show_contacts_to_members ?? false,
    emailNotificationsEnabled: row.email_notifications_enabled !== false,
    companyNameHint: row.company_name_hint,
    companyInnHint: row.company_inn_hint,
    staffPosition: row.staff_position,
    isCeo: row.is_ceo === true,
    canManageWorkGroups: row.can_manage_work_groups !== false,
    membership: mapMembership(row),
  }
}

function throwAuth(error: SupabaseAuthError | null): asserts error is null {
  if (error) {
    throw fromSupabaseError(error)
  }
}

type PasswordRecoveryParams = {
  code: string | null
  type: string | null
  accessToken: string | null
  refreshToken: string | null
}

function readPasswordRecoveryParams(): PasswordRecoveryParams {
  if (typeof window === 'undefined') {
    return {
      code: null,
      type: null,
      accessToken: null,
      refreshToken: null,
    }
  }

  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  return {
    code: search.get('code'),
    type: search.get('type') ?? hash.get('type'),
    accessToken: hash.get('access_token'),
    refreshToken: hash.get('refresh_token'),
  }
}

function cleanupPasswordRecoveryUrl(): void {
  if (typeof window === 'undefined') return
  window.history.replaceState({}, document.title, routes.updatePassword)
}

function passwordResetApiUrls(path = ''): string[] {
  const suffix = `/v1/auth/password-reset${path}`
  const absolute = env.messengerApiUrl ? `${env.messengerApiUrl}${suffix}` : null
  const sameOrigin = `/api/messenger${suffix}`
  const urls = env.isDev ? [sameOrigin, absolute] : [absolute, sameOrigin]
  return [...new Set(urls.filter((url): url is string => Boolean(url)))]
}

const PASSWORD_RESET_MESSAGES: Record<string, string> = {
  email_required: 'Укажите email',
  invalid_payload: 'Некорректные данные',
  invalid_password: 'Пароль должен содержать от 8 до 72 символов',
  not_found: 'Сервис восстановления пароля недоступен. Нужно пересобрать messenger.',
  messenger_api_unavailable: 'Сервис восстановления пароля недоступен. Нужно пересобрать messenger.',
  password_reset_not_configured:
    'Восстановление пароля не настроено: проверьте SMTPBZ_API_KEY, SMTP_FROM и APP_URL у messenger.',
  password_reset_email_failed: 'Не удалось отправить письмо. Попробуйте позже.',
  password_reset_rate_limited: 'Слишком много попыток. Подождите несколько минут.',
  password_reset_token_invalid: 'Ссылка для восстановления недействительна',
  password_reset_token_expired: 'Срок действия ссылки истёк. Запросите новую',
  password_reset_token_required: 'Отсутствует токен восстановления пароля',
  password_reset_failed: 'Не удалось обновить пароль. Запросите новую ссылку.',
}

function mapPasswordResetError(code: string | undefined, status: number): string {
  if (code && PASSWORD_RESET_MESSAGES[code]) return PASSWORD_RESET_MESSAGES[code]
  if (status === 404) return PASSWORD_RESET_MESSAGES.not_found
  if (status === 429) return PASSWORD_RESET_MESSAGES.password_reset_rate_limited
  if (status >= 500) return 'Не удалось сохранить пароль. Попробуйте позже.'
  return 'Не удалось восстановить пароль. Попробуйте позже.'
}

async function postPasswordReset<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const payload = JSON.stringify(body)
  const urls = passwordResetApiUrls(path)
  let lastError: Error | null = null

  for (const url of urls) {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        // text/plain avoids CORS preflight, which Traefik often blocks with a 404.
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: payload,
      })
    } catch {
      lastError = new Error(mapPasswordResetError('not_found', 0))
      continue
    }

    const json = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null

    if (response.ok && json?.ok) {
      return json as T
    }

    const code = json?.error?.trim()
    if (response.status === 404 || code === 'not_found' || code === 'messenger_api_unavailable') {
      lastError = new Error(mapPasswordResetError(code, response.status))
      continue
    }

    throw toApiError(new Error(mapPasswordResetError(code, response.status)))
  }

  throw toApiError(lastError ?? new Error(PASSWORD_RESET_MESSAGES.not_found))
}

const PROFILE_SELECT = `
  id,
  email,
  role,
  status,
  representative_id,
  full_name,
  phone,
  telegram_username,
  max_username,
  show_contacts_to_members,
  email_notifications_enabled,
  company_name_hint,
  company_inn_hint,
  staff_position,
  is_ceo,
  can_manage_work_groups,
  representatives (
    id,
    full_name,
    position,
    phone,
    telegram_username,
    max_username,
    show_contacts_to_members,
    companies (
      id,
      name,
      access_status,
      participation_level_id,
      balance,
      participation_levels (
        id,
        name,
        is_active
      ),
      company_access_statuses (
        excludes_from_program,
        is_default
      )
    )
  )
`

export const authService = {
  async getSession(): Promise<Session | null> {
    const { data, error } = await supabaseClient.auth.getSession()
    throwAuth(error)
    syncRealtimeAuth(data.session?.access_token)
    return data.session
  },

  async getUser(): Promise<User | null> {
    const { data, error } = await supabaseClient.auth.getUser()
    throwAuth(error)
    return data.user
  },

  /**
   * Force-refresh the access token. Prefer SDK autoRefresh; call explicitly after long idle.
   */
  async refreshSession(): Promise<Session | null> {
    const { data, error } = await supabaseClient.auth.refreshSession()
    throwAuth(error)
    syncRealtimeAuth(data.session?.access_token)
    return data.session
  },

  async ensureFreshSession(maxAgeSeconds = 60): Promise<Session | null> {
    const session = await this.getSession()
    if (!session) return null

    const expiresAt = session.expires_at ?? 0
    const now = Math.floor(Date.now() / 1000)
    if (expiresAt - now > maxAgeSeconds) {
      return session
    }

    return this.refreshSession()
  },

  async signInWithPassword(input: SignInInput): Promise<{ session: Session; user: User }> {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    })
    throwAuth(error)

    if (!data.session || !data.user) {
      throw toApiError(new Error('Вход выполнен, но сессия не создана'))
    }

    return { session: data.session, user: data.user }
  },

  async signUp(input: SignUpInput): Promise<{ user: User | null; session: Session | null }> {
    if (!input.accepted) {
      throw toApiError(new Error('Необходимо принять условия регистрации'))
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        data: {
          full_name: input.fullName,
          position_hint: input.position?.trim() || null,
          phone: input.phone ?? null,
          company_name_hint: input.companyNameHint ?? null,
          company_inn_hint: input.companyInnHint ?? null,
          show_contacts_to_members: input.showContactsToMembers === true,
          email_notifications_enabled: input.emailNotificationsEnabled !== false,
          telegram_username: input.telegramUsername?.trim().replace(/^@+/, '') || null,
          pd_consent: true,
          pd_consent_at: new Date().toISOString(),
        },
      },
    })
    throwAuth(error)
    return { user: data.user, session: data.session }
  },

  async signOut(): Promise<void> {
    const { error } = await supabaseClient.auth.signOut({ scope: 'global' })
    throwAuth(error)
  },

  async requestPasswordReset(email: string): Promise<void> {
    await postPasswordReset('/request', {
      email: email.trim().toLowerCase(),
    })
  },

  async confirmPasswordReset(token: string, password: string): Promise<void> {
    await postPasswordReset('/confirm', {
      token: token.trim(),
      password,
    })
  },

  hasPasswordRecoveryParams(): boolean {
    const params = readPasswordRecoveryParams()
    return Boolean(
      params.code ||
        (params.accessToken && params.refreshToken) ||
        params.type === 'recovery',
    )
  },

  async restorePasswordRecoverySession(): Promise<boolean> {
    const params = readPasswordRecoveryParams()
    const isRecovery =
      params.type === 'recovery' ||
      Boolean(params.code) ||
      Boolean(params.accessToken && params.refreshToken)

    if (!isRecovery) return false

    if (params.code) {
      const { error } = await supabaseClient.auth.exchangeCodeForSession(params.code)
      throwAuth(error)
      cleanupPasswordRecoveryUrl()
      return true
    }

    if (params.accessToken && params.refreshToken) {
      const { error } = await supabaseClient.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      })
      throwAuth(error)
      cleanupPasswordRecoveryUrl()
      return true
    }

    return false
  },

  async updatePassword(password: string): Promise<User> {
    const { data, error } = await supabaseClient.auth.updateUser({ password })
    throwAuth(error)
    if (!data.user) {
      throw toApiError(new Error('Не удалось обновить пароль'))
    }
    return data.user
  },

  async getProfile(userId: string): Promise<AuthProfile | null> {
    const result = await supabaseClient
      .from('users')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle()

    if (result.error) {
      // Migration 00021 not applied yet — staff columns missing
      const message = result.error.message ?? ''
      if (/staff_position|is_ceo|can_manage_work_groups/i.test(message)) {
        const fallback = await supabaseClient
          .from('users')
          .select(
            `
            id,
            email,
            role,
            status,
            representative_id,
            full_name,
            phone,
            telegram_username,
            max_username,
            show_contacts_to_members,
            email_notifications_enabled,
            company_name_hint,
            company_inn_hint,
            representatives (
              id,
              full_name,
              position,
              phone,
              telegram_username,
              max_username,
              show_contacts_to_members,
              companies (
                id,
                name,
                access_status,
                participation_level_id,
                balance,
                participation_levels (
                  id,
                  name,
                  is_active
                ),
                company_access_statuses (
                  excludes_from_program,
                  is_default
                )
              )
            )
          `,
          )
          .eq('id', userId)
          .maybeSingle()

        const fallbackRow = unwrapMaybe(fallback) as ProfileQueryRow | null
        if (!fallbackRow) return null
        return mapProfile({
          ...fallbackRow,
          staff_position: null,
          is_ceo: false,
          can_manage_work_groups: true,
        })
      }

      throw fromSupabaseError(result.error)
    }

    const row = unwrapMaybe({ data: result.data, error: null }) as ProfileQueryRow | null
    return row ? mapProfile(row) : null
  },

  async updateOwnMemberProfile(input: UpdateOwnMemberProfileInput): Promise<void> {
    const { error } = await supabaseClient.rpc('update_own_member_profile', {
      p_full_name: input.fullName,
      p_position: input.position ?? null,
      p_phone: input.phone ?? null,
      p_telegram_username: input.telegramUsername ?? null,
      p_max_username: null,
      p_show_contacts_to_members: input.showContactsToMembers,
    })

    if (error) throw fromSupabaseError(error)
  },

  async setOwnEmailNotifications(enabled: boolean): Promise<void> {
    const { error } = await supabaseClient.rpc('set_own_email_notifications', {
      p_enabled: enabled,
    })
    if (error) throw fromSupabaseError(error)
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
    subscription: Subscription
  } {
    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
      // Never log session tokens
      if (import.meta.env.DEV) {
        console.info('[auth]', event, sanitizeForLog({ userId: session?.user?.id ?? null }))
      }
      syncRealtimeAuth(session?.access_token)
      callback(event, session)
    })
    return { subscription: data.subscription }
  },
}
