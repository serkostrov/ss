import {
  materialAccessService,
  queryKeys,
  useSupabaseMutation,
  type BulkMaterialAccessInput,
  type MaterialAccessMode,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

const invalidateMaterials = [queryKeys.materials.all]

export function useSetMaterialSectionLevelsMutation() {
  return useSupabaseMutation(
    (input: { sectionId: string; levelIds: string[] }) =>
      materialAccessService.setSectionLevels(input.sectionId, input.levelIds),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateMaterials,
      onSuccess: () => notify.success('Доступ обновлён'),
      onError: (error) => notify.fromError(error, 'Не удалось обновить доступ'),
    },
  )
}

export function useBulkMaterialAccessMutation() {
  return useSupabaseMutation(
    (input: BulkMaterialAccessInput) => materialAccessService.bulkSetLevels(input),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateMaterials,
      onSuccess: (count, variables) => {
        const modeLabel: Record<MaterialAccessMode, string> = {
          replace: 'заменены',
          add: 'добавлены',
          remove: 'сняты',
        }
        notify.success(
          `Уровни ${modeLabel[variables.mode]} для ${count} ${count === 1 ? 'раздела' : 'разделов'}`,
        )
      },
      onError: (error) => notify.fromError(error, 'Не удалось массово изменить доступ'),
    },
  )
}

export type { MaterialAccessMode, BulkMaterialAccessInput }
