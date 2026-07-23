/**
 * Dev-only Vite middleware: proxy INN → company name via FNS EGRUL.
 * Mirrors supabase/functions/lookup-company-by-inn for local `npm run dev`.
 */

function normalizeInn(value) {
  if (value == null) return null
  const digits = String(value).replace(/\D/g, '')
  if (!/^\d{10}(\d{2})?$/.test(digits)) return null
  return digits
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function lookupByInn(inn) {
  const startRes = await fetch('https://egrul.nalog.ru/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `query=${encodeURIComponent(inn)}&vyp3CaptchaToken=`,
  })

  if (!startRes.ok) {
    throw new Error(`fns_start_${startRes.status}`)
  }

  const start = await startRes.json()
  if (start.captchaRequired) throw new Error('captcha_required')
  if (!start.t) throw new Error('fns_no_token')

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(700)
    const resultRes = await fetch(`https://egrul.nalog.ru/search-result/${start.t}`)
    if (!resultRes.ok) throw new Error(`fns_result_${resultRes.status}`)

    const result = await resultRes.json()
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

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * @param {import('vite').Connect.Server} middlewares
 */
export function attachInnLookupMiddleware(middlewares) {
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
      let innRaw = url.searchParams.get('inn')
      if (!innRaw && req.method === 'POST') {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const raw = Buffer.concat(chunks).toString('utf8')
        if (raw) {
          try {
            innRaw = JSON.parse(raw)?.inn ?? null
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
