import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { handleMaxUpdate, type MaxUpdate } from '../adapters/max.js'
import { handleTelegramUpdate, type TelegramUpdate } from '../adapters/telegram.js'
import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { log } from '../types.js'

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return null
  return JSON.parse(raw) as unknown
}

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export function startHttpServer(config: MessengerConfig, db: DbClient) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      const path = url.pathname

      if (req.method === 'GET' && path === '/health') {
        send(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && path === '/webhooks/telegram') {
        if (config.telegramWebhookSecret) {
          const header = req.headers['x-telegram-bot-api-secret-token']
          const provided = Array.isArray(header) ? header[0] : header
          if (!provided || !timingSafeEqual(provided, config.telegramWebhookSecret)) {
            log('warn', 'Telegram webhook unauthorized (secret mismatch)')
            send(res, 401, { ok: false, error: 'unauthorized' })
            return
          }
        }

        const body = (await readJson(req)) as TelegramUpdate
        const kinds = [
          body.message ? 'message' : null,
          body.edited_message ? 'edited_message' : null,
          body.channel_post ? 'channel_post' : null,
          body.edited_channel_post ? 'edited_channel_post' : null,
          body.my_chat_member ? 'my_chat_member' : null,
        ].filter(Boolean)
        log('info', 'Telegram webhook received', {
          updateId: body.update_id,
          kinds: kinds.length ? kinds : ['other'],
        })
        await handleTelegramUpdate(db, body)
        send(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && path === '/webhooks/max') {
        if (config.maxWebhookSecret) {
          const header = req.headers['x-max-bot-api-secret']
          const provided = Array.isArray(header) ? header[0] : header
          if (!provided || !timingSafeEqual(provided, config.maxWebhookSecret)) {
            log('warn', 'Max webhook unauthorized (secret mismatch)')
            send(res, 401, { ok: false, error: 'unauthorized' })
            return
          }
        }

        const body = await readJson(req)
        const updateType =
          body && typeof body === 'object' && 'update_type' in body
            ? String((body as { update_type?: string }).update_type ?? 'unknown')
            : Array.isArray(body)
              ? `batch:${body.length}`
              : 'unknown'
        log('info', 'Max webhook received', { updateType })

        // Max may send a single update or wrap it.
        if (Array.isArray(body)) {
          for (const item of body) {
            await handleMaxUpdate(db, item as MaxUpdate)
          }
        } else if (body && typeof body === 'object' && 'updates' in body) {
          const updates = (body as { updates?: MaxUpdate[] }).updates ?? []
          for (const item of updates) {
            await handleMaxUpdate(db, item)
          }
        } else {
          await handleMaxUpdate(db, body as MaxUpdate)
        }

        send(res, 200, { ok: true })
        return
      }

      send(res, 404, { ok: false, error: 'not_found' })
    } catch (error) {
      log('error', 'HTTP handler failed', {
        message: error instanceof Error ? error.message : String(error),
      })
      send(res, 500, { ok: false, error: 'internal_error' })
    }
  })

  server.listen(config.port, () => {
    log('info', `HTTP listening on :${config.port}`)
  })

  return server
}
