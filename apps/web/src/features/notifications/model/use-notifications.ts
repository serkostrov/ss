import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { notificationsService, queryKeys } from '@shared/api'
import { notify } from '@shared/lib/notify'

import {
  countNotificationNavBadges,
  NOTIFICATION_TYPES_BY_NAV,
} from './nav-badges'

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: queryKeys.notifications.list({ unreadOnly }),
    queryFn: () => notificationsService.list({ unreadOnly }),
    refetchInterval: 60_000,
  })
}

export function useUnreadNotifications(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications.list({ unreadOnly: true }),
    queryFn: () => notificationsService.list({ unreadOnly: true }),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useUnreadNotificationsCount(enabled = true) {
  const query = useUnreadNotifications(enabled)
  return {
    ...query,
    data: query.data?.length ?? 0,
  }
}

export function useNotificationNavBadges(enabled = true) {
  const query = useUnreadNotifications(enabled)
  const badges = useMemo(
    () => countNotificationNavBadges(query.data ?? []),
    [query.data],
  )
  return { ...query, badges }
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationsService.markRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
    onError: (error) => notify.fromError(error, 'Не удалось отметить уведомление'),
  })
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsService.markAllRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
      notify.success('Все уведомления прочитаны')
    },
    onError: (error) => notify.fromError(error, 'Не удалось отметить уведомления'),
  })
}

export function useSetEmailNotificationsMutation(onSuccess?: () => void | Promise<void>) {
  return useMutation({
    mutationFn: (enabled: boolean) => notificationsService.setEmailNotificationsEnabled(enabled),
    onSuccess: async (_data, enabled) => {
      await onSuccess?.()
      notify.success(enabled ? 'Уведомления на email включены' : 'Уведомления на email выключены')
    },
    onError: (error) => notify.fromError(error, 'Не удалось сохранить настройку'),
  })
}

/** Clears nav badges for a section when the related cabinet tab is opened. */
export function useClearNavNotificationBadges(navId: string, enabled = true) {
  const queryClient = useQueryClient()
  const { badges } = useNotificationNavBadges(enabled)
  const pendingRef = useRef<string | null>(null)
  const count = badges[navId] ?? 0
  const types = NOTIFICATION_TYPES_BY_NAV[navId]

  useEffect(() => {
    if (!enabled || !types?.length || count <= 0) return
    const key = `${navId}:${count}`
    if (pendingRef.current === key) return
    pendingRef.current = key

    void notificationsService
      .markReadByTypes(types)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }))
      .catch(() => {
        pendingRef.current = null
      })
  }, [count, enabled, navId, queryClient, types])
}
