import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { messagesService, queryKeys, type MessageSource } from '@shared/api'

type ChatRealtimeInput = {
  workGroupId: string
  source: MessageSource
  externalChatId: string
  enabled?: boolean
}

/**
 * Live-refresh message lists when the bound chat changes in Postgres.
 */
export function useChatMessagesRealtime({
  workGroupId,
  source,
  externalChatId,
  enabled = true,
}: ChatRealtimeInput) {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !workGroupId || !externalChatId) return

    const invalidate = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all })
      }, 120)
    }

    const unsubscribe = messagesService.subscribeChat(
      { workGroupId, source, externalChatId },
      invalidate,
    )

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      unsubscribe()
    }
  }, [workGroupId, source, externalChatId, enabled, queryClient])
}
