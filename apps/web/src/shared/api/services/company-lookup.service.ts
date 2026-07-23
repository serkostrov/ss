import { ApiError, type ApiErrorCode } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'

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

  if (!body || typeof body !== 'object' || !('name' in body) || typeof body.name !== 'string') {
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

async function lookupViaDevProxy(inn: string): Promise<CompanyByInn> {
  const response = await fetch(`/api/company-by-inn?inn=${encodeURIComponent(inn)}`)
  return parseLookupResponse(response)
}

async function lookupViaEdgeFunction(inn: string): Promise<CompanyByInn> {
  const { data, error } = await supabaseClient.functions.invoke<CompanyByInn | LookupErrorBody>(
    'lookup-company-by-inn',
    { body: { inn } },
  )

  if (error) {
    let message = error.message || 'Не удалось найти организацию'
    let rawCode: string | undefined

    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as LookupErrorBody
        if (body?.message) message = body.message
        if (body?.error) rawCode = body.error
      } catch {
        // ignore parse errors from error context
      }
    }

    throw new ApiError(message, { code: toLookupErrorCode(rawCode), cause: error })
  }

  if (!data || typeof data !== 'object' || !('name' in data) || typeof data.name !== 'string') {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : 'Организация по ИНН не найдена'
    const rawCode =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'not_found'
    throw new ApiError(message, {
      code: toLookupErrorCode(rawCode),
      details: data,
    })
  }

  return {
    inn: typeof data.inn === 'string' ? data.inn : inn,
    name: data.name,
    fullName: typeof data.fullName === 'string' ? data.fullName : null,
    ogrn: typeof data.ogrn === 'string' ? data.ogrn : null,
    kpp: typeof data.kpp === 'string' ? data.kpp : null,
    kind: typeof data.kind === 'string' ? data.kind : null,
  }
}

/**
 * Resolve organization name by INN (FNS EGRUL).
 * Dev: Vite middleware. Prod: Supabase Edge Function `lookup-company-by-inn`.
 */
export const companyLookupService = {
  isCompleteInn,

  async lookupByInn(innInput: string): Promise<CompanyByInn> {
    const inn = normalizeInnDigits(innInput)
    if (!isCompleteInn(inn)) {
      throw new ApiError('ИНН: 10 или 12 цифр', { code: 'validation' })
    }

    if (import.meta.env.DEV) {
      return lookupViaDevProxy(inn)
    }

    return lookupViaEdgeFunction(inn)
  },
}
