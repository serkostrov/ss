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

export type MessengerOutboundDeleteInput = {
  platform: MessengerPlatform
  chatId: string
  workGroupId: string
  externalMessageId: string
  messageId?: string | null
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

function outboundUrl(path = ''): string {
  // Production (separate messenger domain): VITE_MESSENGER_API_URL=https://messenger.example.com
  // Local / same-origin proxy: /api/messenger → worker :8787
  const base = env.messengerApiUrl
  if (base) return `${base}/v1/outbound${path}`
  return `/api/messenger/v1/outbound${path}`
}

function mapOutboundError(error: string | undefined, status: number): string {
  if (error?.startsWith('invalid_max_chat_id')) {
    return 'Некорректный чат Max (часто id 0). Удалите привязку, напишите боту в ЛС и выберите чат «Личные».'
  }
  return error === 'max_attachments_unsupported'
    ? 'Для Max пока можно отправлять только текст'
    : error === 'telegram_not_configured'
      ? 'Telegram-бот не настроен на messenger'
      : error === 'max_not_configured'
        ? 'Max-бот не настроен на messenger'
        : error === 'chat_not_bound'
          ? 'Чат не привязан к группе'
          : error === 'file_too_large'
            ? 'Файл слишком большой (макс. 8 МБ)'
            : error === 'invalid_external_message_id'
              ? 'Некорректный идентификатор сообщения в мессенджере'
              : error === 'messenger_api_unavailable'
                ? 'Messenger API не проксируется. Задайте VITE_MESSENGER_API_URL на домен worker.'
                : status === 405
                  ? 'Messenger API не настроен (405). Задайте VITE_MESSENGER_API_URL на HTTPS-домен messenger.'
                  : (error ?? `Не удалось выполнить запрос (${status})`)
}

type MaxOutboundTarget = {
  chatId: string
  chatKind: string | null
}

/**
 * Max DMs must use user_id. Legacy binds stored dialog chat_id "0".
 * Heal connection + thread id before calling the worker.
 */
async function resolveMaxOutboundTarget(
  workGroupId: string,
  chatId: string,
): Promise<MaxOutboundTarget> {
  let id = chatId.trim()
  let chatKind: string | null = null

  if (id !== '0') {
    const { data: catalog } = await supabaseClient
      .from('messenger_bot_channels')
      .select('chat_kind')
      .eq('platform', 'max')
      .eq('external_chat_id', id)
      .maybeSingle()
    chatKind = (catalog?.chat_kind as string | null) ?? null
  }

  if (id === '0') {
    const { data: msg, error: msgError } = await supabaseClient
      .from('messages')
      .select('author_external_id')
      .eq('work_group_id', workGroupId)
      .eq('source', 'max')
      .eq('external_chat_id', '0')
      .not('author_external_id', 'is', null)
      .neq('author_external_id', '0')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (msgError) throw msgError

    const userId = msg?.author_external_id?.trim()
    if (!userId) {
      throw new ApiError(
        'Привязка Max с id 0. Удалите привязку, напишите боту в ЛС и выберите чат «Личные».',
        { code: 'validation' },
      )
    }

    await supabaseClient
      .from('messenger_connections')
      .update({ chat_id: userId, last_error: null, bot_status: 'connected' })
      .eq('work_group_id', workGroupId)
      .eq('platform', 'max')
      .eq('chat_id', '0')

    await supabaseClient
      .from('messages')
      .update({ external_chat_id: userId })
      .eq('work_group_id', workGroupId)
      .eq('source', 'max')
      .eq('external_chat_id', '0')

    id = userId
    chatKind = 'private'
  }

  if (chatKind === 'private') {
    return { chatId: id, chatKind: 'private' }
  }

  const { data: privateRow } = await supabaseClient
    .from('messenger_bot_channels')
    .select('chat_kind')
    .eq('platform', 'max')
    .eq('external_chat_id', id)
    .eq('chat_kind', 'private')
    .eq('is_active', true)
    .maybeSingle()

  if (privateRow) {
    return { chatId: id, chatKind: 'private' }
  }

  return { chatId: id, chatKind }
}

/**
 * Sends / deletes messages via messenger worker (`POST /v1/outbound`).
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

    let chatId = input.chatId
    let chatKind: string | null = null
    if (input.platform === 'max') {
      const target = await resolveMaxOutboundTarget(input.workGroupId, input.chatId)
      chatId = target.chatId
      chatKind = target.chatKind
    }

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
          chatId,
          workGroupId: input.workGroupId,
          text: input.text,
          authorName: input.authorName ?? 'АПСС',
          chatKind,
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
      throw new ApiError(mapOutboundError(json?.error, response.status), {
        code: response.status === 401 || response.status === 403 ? 'unauthorized' : 'unknown',
      })
    }

    return { ok: true, externalMessageId: json.externalMessageId }
  },

  async delete(input: MessengerOutboundDeleteInput): Promise<{ ok: true }> {
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.access_token) {
      throw new ApiError('Нужна авторизация', { code: 'unauthorized' })
    }

    let response: Response
    try {
      response = await fetch(outboundUrl('/delete'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: input.platform,
          chatId: input.chatId,
          workGroupId: input.workGroupId,
          externalMessageId: input.externalMessageId,
          messageId: input.messageId ?? null,
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
    } | null

    if (!response.ok || !json?.ok) {
      throw new ApiError(mapOutboundError(json?.error, response.status), {
        code: response.status === 401 || response.status === 403 ? 'unauthorized' : 'unknown',
      })
    }

    return { ok: true }
  },
}
