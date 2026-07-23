/**
 * Public company lookup by INN via FNS EGRUL (egrul.nalog.ru).
 * No third-party API key required.
 */

import { corsHeaders } from '../_shared/cors.ts'

type FnsSearchStart = {
  t?: string
  captchaRequired?: boolean
}

type FnsRow = {
  i?: string
  n?: string
  c?: string
  o?: string
  p?: string
  k?: string
}

type FnsSearchResult = {
  rows?: FnsRow[]
  status?: string
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function normalizeInn(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const digits = String(value).replace(/\D/g, '')
  if (!/^\d{10}(\d{2})?$/.test(digits)) return null
  return digits
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function lookupByInn(inn: string): Promise<{
  inn: string
  name: string
  fullName: string | null
  ogrn: string | null
  kpp: string | null
  kind: string | null
}> {
  const startRes = await fetch('https://egrul.nalog.ru/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `query=${encodeURIComponent(inn)}&vyp3CaptchaToken=`,
  })

  if (!startRes.ok) {
    throw new Error(`fns_start_${startRes.status}`)
  }

  const start = (await startRes.json()) as FnsSearchStart
  if (start.captchaRequired) {
    throw new Error('captcha_required')
  }
  if (!start.t) {
    throw new Error('fns_no_token')
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(700)
    const resultRes = await fetch(`https://egrul.nalog.ru/search-result/${start.t}`)
    if (!resultRes.ok) {
      throw new Error(`fns_result_${resultRes.status}`)
    }

    const result = (await resultRes.json()) as FnsSearchResult
    if (result.status === 'wait') continue

    const row = result.rows?.[0]
    if (!row) {
      throw new Error('not_found')
    }

    const fullName = typeof row.n === 'string' ? row.n.trim() : ''
    const shortName = typeof row.c === 'string' ? row.c.trim() : ''
    const name = shortName || fullName
    if (!name) {
      throw new Error('not_found')
    }

    return {
      inn: typeof row.i === 'string' && row.i ? row.i : inn,
      name,
      fullName: fullName || null,
      ogrn: typeof row.o === 'string' ? row.o : null,
      kpp: typeof row.p === 'string' ? row.p : null,
      kind: typeof row.k === 'string' ? row.k : null,
    }
  }

  throw new Error('timeout')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    let innRaw: unknown
    if (req.method === 'GET') {
      innRaw = new URL(req.url).searchParams.get('inn')
    } else {
      const contentType = req.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const body = (await req.json()) as { inn?: unknown }
        innRaw = body.inn
      } else {
        innRaw = new URL(req.url).searchParams.get('inn')
      }
    }

    const inn = normalizeInn(innRaw)
    if (!inn) {
      return jsonResponse({ error: 'invalid_inn', message: 'ИНН: 10 или 12 цифр' }, 400)
    }

    const company = await lookupByInn(inn)
    return jsonResponse(company)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'lookup_failed'
    if (code === 'not_found') {
      return jsonResponse({ error: 'not_found', message: 'Организация по ИНН не найдена' }, 404)
    }
    if (code === 'captcha_required') {
      return jsonResponse(
        { error: 'captcha_required', message: 'Сервис ФНС временно требует проверку. Введите название вручную.' },
        503,
      )
    }
    if (code === 'timeout') {
      return jsonResponse(
        { error: 'timeout', message: 'Не удалось получить ответ ФНС. Попробуйте ещё раз.' },
        504,
      )
    }
    console.error('[lookup-company-by-inn]', error)
    return jsonResponse({ error: 'lookup_failed', message: 'Не удалось найти организацию' }, 502)
  }
})
