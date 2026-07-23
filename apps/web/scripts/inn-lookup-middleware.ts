/**
 * Dev-only Vite middleware: proxy INN → company name via FNS EGRUL.
 * Mirrors supabase/functions/lookup-company-by-inn for local `npm run dev`.
 */

import type { Connect } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

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

function normalizeInn(value: unknown): string | null {
  if (value == null) return null
  const digits = String(value).replace(/\D/g, '')
  if (!/^\d{10}(\d{2})?$/.test(digits)) return null
  return digits
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function lookupByInn(inn: string) {
  const startRes = await fetch('https://egrul.nalog.ru/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `query=${encodeURIComponent(inn)}&vyp3CaptchaToken=`,
  })

  if (!startRes.ok) {
    throw new Error(`fns_start_${startRes.status}`)
  }

  const start = (await startRes.json()) as FnsSearchStart
  if (start.captchaRequired) throw new Error('captcha_required')
  if (!start.t) throw new Error('fns_no_token')

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(700)
    const resultRes = await fetch(`https://egrul.nalog.ru/search-result/${start.t}`)
    if (!resultRes.ok) throw new Error(`fns_result_${resultRes.status}`)

    const result = (await resultRes.json()) as FnsSearchResult
    if (result.status === 'wait') continue

    const row = result.rows?.[0]
    if (!row) throw new Error('not_found')

    const fullName = typeof row.n === 'string' ? row.n.trim() : ''
    const shortName = typeof row.c === 'string' ? row.c.trim() : ''
    const name = shortName || fullName
    if (!name) throw new Error('not_found')

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

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function attachInnLookupMiddleware(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const url = req.url ? new URL(req.url, 'http://localhost') : null
    if (!url || url.pathname !== '/api/company-by-inn') {
      next()
      return
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' })
      return
    }

    try {
      let innRaw: unknown = url.searchParams.get('inn')
      if (!innRaw && req.method === 'POST') {
        const raw = await readRequestBody(req)
        if (raw) {
          try {
            innRaw = (JSON.parse(raw) as { inn?: unknown }).inn ?? null
          } catch {
            innRaw = null
          }
        }
      }

      const inn = normalizeInn(innRaw)
      if (!inn) {
        sendJson(res, 400, { error: 'invalid_inn', message: 'ИНН: 10 или 12 цифр' })
        return
      }

      const company = await lookupByInn(inn)
      sendJson(res, 200, company)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'lookup_failed'
      if (code === 'not_found') {
        sendJson(res, 404, { error: 'not_found', message: 'Организация по ИНН не найдена' })
        return
      }
      if (code === 'captcha_required') {
        sendJson(res, 503, {
          error: 'captcha_required',
          message: 'Сервис ФНС временно требует проверку. Введите название вручную.',
        })
        return
      }
      if (code === 'timeout') {
        sendJson(res, 504, {
          error: 'timeout',
          message: 'Не удалось получить ответ ФНС. Попробуйте ещё раз.',
        })
        return
      }
      console.error('[inn-lookup]', error)
      sendJson(res, 502, { error: 'lookup_failed', message: 'Не удалось найти организацию' })
    }
  })
}
