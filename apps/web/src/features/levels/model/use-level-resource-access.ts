import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  levelResourceAccessService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type LevelResourceAccessRow,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

export function useLevelResourceAccess(levelId: string | null | undefined) {
  return useSupabaseQuery(
    queryKeys.levels.resourceAccess(levelId ?? 'none'),
    () => {
      if (!levelId) return Promise.resolve([] as LevelResourceAccessRow[])
      return levelResourceAccessService.getForLevel(levelId)
    },
    {
      enabled: Boolean(levelId),
      ensureFreshSession: true,
      staleTime: 30_000,
    },
  )
}

export function useSaveLevelResourceAccessMutation(levelId: string) {
  const queryClient = useQueryClient()

  return useSupabaseMutation(
    (rows: LevelResourceAccessRow[]) => levelResourceAccessService.saveForLevel(levelId, rows),
    {
      ensureFreshSession: true,
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.levels.resourceAccess(levelId) })
        notify.success('Доступ к ресурсам сохранён')
      },
      onError: (error) => notify.fromError(error, 'Не удалось сохранить доступ'),
    },
  )
}
