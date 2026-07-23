import { ZodError } from 'zod'

export type ApiErrorCode =
  | 'unknown'
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'aborted'

export type ApiErrorOptions = {
  code?: ApiErrorCode
  status?: number
  cause?: unknown
  details?: unknown
  isRetryable?: boolean
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status?: number
  readonly details?: unknown
  readonly isRetryable: boolean
  override readonly cause?: unknown

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? 'unknown'
    this.status = options.status
    this.details = options.details
    this.cause = options.cause
    this.isRetryable = options.isRetryable ?? isRetryableCode(options.code ?? 'unknown')
  }
}

function isRetryableCode(code: ApiErrorCode): boolean {
  return code === 'network' || code === 'server' || code === 'rate_limited'
}

const SUPABASE_AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Неверный email или пароль',
  email_not_confirmed: 'Подтвердите email перед входом',
  user_already_exists: 'Пользователь с таким email уже зарегистрирован',
  weak_password: 'Пароль слишком простой',
  over_request_rate_limit: 'Слишком много запросов. Попробуйте позже',
  session_not_found: 'Сессия истекла. Войдите снова',
}

function mapHttpStatusMessage(status?: number): string | undefined {
  if (!status) return undefined
  if (status === 401) return 'Требуется авторизация'
  if (status === 403) return 'Недостаточно прав'
  if (status === 404) return 'Ресурс не найден'
  if (status === 409) return 'Конфликт данных'
  if (status === 422) return 'Ошибка валидации данных'
  if (status === 429) return 'Слишком много запросов. Попробуйте позже'
  if (status >= 500) return 'Ошибка сервера. Попробуйте позже'
  return undefined
}

function codeFromStatus(status?: number): ApiErrorCode {
  if (!status) return 'unknown'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server'
  return 'unknown'
}

function isAuthLikeError(
  error: unknown,
): error is Error & { status?: number; code?: string; name: string } {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'AuthError' ||
    error.name === 'AuthApiError' ||
    error.name === 'AuthRetryableFetchError' ||
    error.name === 'AuthSessionMissingError'
  )
}

function messageFromAuthLike(error: Error & { status?: number; code?: string }): string {
  const key = error.code ?? error.message
  return SUPABASE_AUTH_MESSAGES[key] ?? mapHttpStatusMessage(error.status) ?? error.message
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error
  }

  if (error instanceof ZodError) {
    return new ApiError('Ошибка валидации данных', {
      code: 'validation',
      details: error.flatten(),
      cause: error,
      isRetryable: false,
    })
  }

  if (isAuthLikeError(error)) {
    return new ApiError(messageFromAuthLike(error), {
      code: codeFromStatus(error.status) === 'unknown' ? 'unauthorized' : codeFromStatus(error.status),
      status: error.status,
      cause: error,
      details: { code: error.code, name: error.name },
      isRetryable: error.status === 429 || (error.status !== undefined && error.status >= 500),
    })
  }

  if (typeof error === 'object' && error !== null) {
    const maybe = error as {
      message?: string
      code?: string
      status?: number
      details?: unknown
      hint?: string
      name?: string
    }

    if (typeof maybe.message === 'string' && (maybe.code || maybe.details || maybe.hint)) {
      const status = maybe.status
      const mapped =
        maybe.code === 'PGRST116'
          ? 'not_found'
          : maybe.code === '42501'
            ? 'forbidden'
            : maybe.code === '23505'
              ? 'conflict'
              : codeFromStatus(status)

      return new ApiError(maybe.message, {
        code: mapped,
        status,
        details: maybe,
        cause: error,
      })
    }

    if (maybe.name === 'AbortError') {
      return new ApiError('Запрос отменён', {
        code: 'aborted',
        cause: error,
        isRetryable: false,
      })
    }
  }

  if (error instanceof TypeError && /fetch|network|Failed to fetch/i.test(error.message)) {
    return new ApiError(
      'Нет соединения с Supabase. Проверьте VITE_SUPABASE_URL и что API (/auth/v1, /rest/v1) доступен.',
      {
        code: 'network',
        cause: error,
        isRetryable: true,
      },
    )
  }

  if (error instanceof Error) {
    return new ApiError(error.message || 'Неизвестная ошибка', {
      code: 'unknown',
      cause: error,
    })
  }

  return new ApiError('Неизвестная ошибка', {
    code: 'unknown',
    details: error,
  })
}

export function getErrorMessage(error: unknown, fallback = 'Произошла ошибка'): string {
  const apiError = toApiError(error)
  return apiError.message || fallback
}

export function isUnauthorizedError(error: unknown): boolean {
  return toApiError(error).code === 'unauthorized'
}
