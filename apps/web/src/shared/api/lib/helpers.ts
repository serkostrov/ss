import type { PostgrestError, AuthError as SupabaseAuthError } from '@supabase/supabase-js'

import { ApiError, toApiError, type ApiErrorCode } from '@shared/lib/errors'

import { redactSecrets, sanitizeForLog } from './security'

type SupabaseLikeError = {
  message: string
  code?: string
  details?: string
  hint?: string
  status?: number
  name?: string
}

const POSTGREST_CODE_MAP: Record<string, ApiErrorCode> = {
  PGRST116: 'not_found',
  '42501': 'forbidden',
  '23505': 'conflict',
  '23503': 'validation',
  '23514': 'validation',
  '22P02': 'validation',
  '28000': 'unauthorized',
  '28P01': 'unauthorized',
}

export function mapPostgrestCode(code?: string): ApiErrorCode {
  if (!code) return 'unknown'
  return POSTGREST_CODE_MAP[code] ?? 'unknown'
}

export function fromSupabaseError(error: PostgrestError | SupabaseAuthError | SupabaseLikeError): ApiError {
  const pgCode = 'code' in error ? error.code : undefined
  const mapped = mapPostgrestCode(pgCode)
  const status = 'status' in error ? error.status : undefined
  const code: ApiErrorCode =
    mapped !== 'unknown'
      ? mapped
      : status === 401
        ? 'unauthorized'
        : status === 403
          ? 'forbidden'
          : status === 404
            ? 'not_found'
            : status === 429
              ? 'rate_limited'
              : status !== undefined && status >= 500
                ? 'server'
                : 'unknown'

  return new ApiError(redactSecrets(error.message), {
    code,
    status,
    details: sanitizeForLog({
      code: pgCode,
      details: 'details' in error ? error.details : undefined,
      hint: 'hint' in error ? error.hint : undefined,
    }),
    cause: error,
    isRetryable: status === 429 || (typeof status === 'number' && status >= 500),
  })
}

/**
 * Unwrap Supabase `{ data, error }` and throw ApiError on failure.
 */
export function unwrap<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) {
    throw fromSupabaseError(result.error)
  }
  return result.data
}

export function unwrapMaybe<T>(result: {
  data: T | null
  error: PostgrestError | null
}): T | null {
  if (result.error) {
    throw fromSupabaseError(result.error)
  }
  return result.data
}

export async function runSupabase<T>(operation: () => PromiseLike<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
}

export type { PostgrestError }
