import { ApiError } from '@shared/lib/errors'
import { env } from '@shared/config'
import { supabaseClient } from '../lib/client'
import type { MessengerPlatform } from '../types/database'

export type MessengerOutboundInput = {
  platform: MessengerPlatform
  chatId: string
  workGroupId: string
  text: string
  files?: File[]
  authorName?: string | null
}

export type MessengerOutboundResult = {
  ok: true
  externalMessageId: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Не удалось прочитать файл'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })
}

function outboundUrl(): string {
  // Production (separate messenger domain): VITE_MESSENGER_API_URL=https://messenger.example.com
  // Local / same-origin proxy: /api/messenger → worker :8787
  const base = env.messengerApiUrl
  if (base) return `${base}/v1/outbound`
  return '/api/messenger/v1/outbound'
}

/**
 * Sends a message via messenger worker (`POST /v1/outbound`).
 */
export const messengerOutboundService = {
  async send(input: MessengerOutboundInput): Promise<MessengerOutboundResult> {
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.access_token) {
      throw new ApiError('Нужна авторизация', { code: 'unauthorized' })
    }

    const files = await Promise.all(
      (input.files ?? []).map(async (file) => ({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        dataBase64: await fileToBase64(file),
      })),
    )

    let response: Response
    try {
      response = await fetch(outboundUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: input.platform,
          chatId: input.chatId,
          workGroupId: input.workGroupId,
          text: input.text,
          authorName: input.authorName ?? 'АПСС',
          files,
        }),
      })
    } catch {
      throw new ApiError(
        'Messenger недоступен. Запустите worker или задайте VITE_MESSENGER_API_URL.',
        { code: 'unknown' },
      )
    }

    const json = (await response.json().catch(() => null)) as {
      ok?: boolean
      error?: string
      externalMessageId?: string
    } | null

    if (!response.ok || !json?.ok || !json.externalMessageId) {
      const message =
        json?.error === 'max_attachments_unsupported'
          ? 'Для Max пока можно отправлять только текст'
          : json?.error === 'telegram_not_configured'
            ? 'Telegram-бот не настроен на messenger'
            : json?.error === 'max_not_configured'
              ? 'Max-бот не настроен на messenger'
              : json?.error === 'chat_not_bound'
                ? 'Чат не привязан к группе'
                : json?.error === 'file_too_large'
                  ? 'Файл слишком большой (макс. 8 МБ)'
                  : json?.error === 'messenger_api_unavailable'
                    ? 'Messenger API не проксируется. Задайте VITE_MESSENGER_API_URL на домен worker.'
                    : response.status === 405
                      ? 'Messenger API не настроен (405). Задайте VITE_MESSENGER_API_URL на HTTPS-домен messenger.'
                      : json?.error ?? `Не удалось отправить (${response.status})`
      throw new ApiError(message, {
        code: response.status === 401 || response.status === 403 ? 'unauthorized' : 'unknown',
      })
    }

    return { ok: true, externalMessageId: json.externalMessageId }
  },
}
