import { ApiError, toApiError, type ApiErrorCode } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import { env } from '@shared/config'

export type CompanyByInn = {
  inn: string
  name: string
  fullName: string | null
  ogrn: string | null
  kpp: string | null
  kind: string | null
}

function isCompleteInn(digits: string): boolean {
  return /^\d{10}(\d{2})?$/.test(digits)
}

export function normalizeInnDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12)
}

type LookupErrorBody = {
  error?: string
  message?: string
}

function toLookupErrorCode(raw?: string): ApiErrorCode {
  switch (raw) {
    case 'not_found':
      return 'not_found'
    case 'invalid_inn':
      return 'validation'
    case 'timeout':
    case 'captcha_required':
    case 'lookup_failed':
      return 'server'
    default:
      return 'unknown'
  }
}

function isCompanyPayload(value: unknown): value is CompanyByInn {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'name' in value &&
      typeof (value as { name: unknown }).name === 'string' &&
      (value as { name: string }).name.trim().length > 0,
  )
}

function friendlyLookupFailure(error: unknown, fallbackMessage?: string): ApiError {
  const api = toApiError(error)
  const blob = `${api.message} ${String(api.cause ?? '')}`

  if (api.code === 'not_found' || /не найден/i.test(api.message)) {
    return new ApiError(api.message || 'Организация по ИНН не найдена', {
      code: 'not_found',
      cause: error,
      details: api.details,
    })
  }

  if (
    /edge function|non-2xx|FunctionsHttpError|FunctionsFetchError|Failed to send a request|404|502|503|504/i.test(
      blob,
    )
  ) {
    return new ApiError(
      'Автозаполнение по ИНН временно недоступно. Укажите название компании вручную.',
      { code: 'server', cause: error, details: api.details },
    )
  }

  return new ApiError(
    fallbackMessage || api.message || 'Не удалось найти организацию. Укажите название вручную.',
    { code: api.code === 'unknown' ? 'server' : api.code, cause: error, details: api.details },
  )
}

async function parseLookupResponse(response: Response): Promise<CompanyByInn> {
  const body = (await response.json().catch(() => null)) as
    | (CompanyByInn & LookupErrorBody)
    | LookupErrorBody
    | null

  if (!response.ok) {
    throw new ApiError(body?.message || 'Не удалось найти организацию', {
      code: toLookupErrorCode(body?.error),
      details: body,
    })
  }

  if (!isCompanyPayload(body)) {
    throw new ApiError('Некорректный ответ сервиса поиска', { code: 'server' })
  }

  return {
    inn: typeof body.inn === 'string' ? body.inn : '',
    name: body.name,
    fullName: typeof body.fullName === 'string' ? body.fullName : null,
    ogrn: typeof body.ogrn === 'string' ? body.ogrn : null,
    kpp: typeof body.kpp === 'string' ? body.kpp : null,
    kind: typeof body.kind === 'string' ? body.kind : null,
  }
}

/** Same-origin proxy: Vite middleware in DEV, nginx→Node in production image. */
async function lookupViaSameOriginProxy(inn: string): Promise<CompanyByInn> {
  const response = await fetch(`/api/company-by-inn?inn=${encodeURIComponent(inn)}`)
  return parseLookupResponse(response)
}

function isMissingProxyError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  // Structured JSON from our proxy (or edge) — treat as final answer
  const details = error.details as LookupErrorBody | null | undefined
  if (details && typeof details === 'object' && typeof details.error === 'string') {
    return false
  }
  if (error.code === 'not_found' || error.code === 'validation') return false
  // Missing route / HTML SPA fallback / network → try Edge Function
  return true
}

async function lookupViaEdgeFunction(inn: string): Promise<CompanyByInn> {
  const { data, error } = await supabaseClient.functions.invoke<CompanyByInn | LookupErrorBody>(
    'lookup-company-by-inn',
    { body: { inn } },
  )

  // Supabase often puts JSON body into `data` even when status is non-2xx.
  if (isCompanyPayload(data)) {
    return {
      inn: typeof data.inn === 'string' ? data.inn : inn,
      name: data.name,
      fullName: typeof data.fullName === 'string' ? data.fullName : null,
      ogrn: typeof data.ogrn === 'string' ? data.ogrn : null,
      kpp: typeof data.kpp === 'string' ? data.kpp : null,
      kind: typeof data.kind === 'string' ? data.kind : null,
    }
  }

  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    throw new ApiError(data.message, {
      code: toLookupErrorCode('error' in data && typeof data.error === 'string' ? data.error : undefined),
      details: data,
    })
  }

  if (error) {
    let message = error.message || 'Не удалось найти организацию'
    let rawCode: string | undefined

    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const cloned = context.clone?.() ?? context
        const body = (await cloned.json()) as LookupErrorBody
        if (body?.message) message = body.message
        if (body?.error) rawCode = body.error
      } catch {
        // ignore parse errors from error context
      }
    }

    throw new ApiError(message, { code: toLookupErrorCode(rawCode), cause: error })
  }

  throw new ApiError('Организация по ИНН не найдена', { code: 'not_found' })
}

/**
 * Direct HTTP call to the edge function (works for guests on registration).
 * Prefer when Functions SDK wraps errors poorly on some self-hosted setups.
 */
async function lookupViaFunctionsHttp(inn: string): Promise<CompanyByInn> {
  const url = `${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/lookup-company-by-inn`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
    },
    body: JSON.stringify({ inn }),
  })
  return parseLookupResponse(response)
}

/**
 * Resolve organization name by INN (FNS EGRUL).
 * Primary: same-origin `/api/company-by-inn` (dev middleware / prod Node sidecar).
 * Fallback: Edge Function `lookup-company-by-inn`.
 */
export const companyLookupService = {
  isCompleteInn,

  async lookupByInn(innInput: string): Promise<CompanyByInn> {
    const inn = normalizeInnDigits(innInput)
    if (!isCompleteInn(inn)) {
      throw new ApiError('ИНН: 10 или 12 цифр', { code: 'validation' })
    }

    try {
      try {
        return await lookupViaSameOriginProxy(inn)
      } catch (proxyError) {
        if (!isMissingProxyError(proxyError)) {
          throw proxyError
        }
      }

      try {
        return await lookupViaEdgeFunction(inn)
      } catch (primaryError) {
        try {
          return await lookupViaFunctionsHttp(inn)
        } catch {
          throw friendlyLookupFailure(primaryError)
        }
      }
    } catch (error) {
      throw friendlyLookupFailure(error)
    }
  },
}
