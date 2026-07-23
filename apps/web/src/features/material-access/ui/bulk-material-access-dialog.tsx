import { useEffect, useState } from 'react'

import {
  levelsService,
  queryKeys,
  useSupabaseQuery,
  type MaterialAccessMode,
} from '@shared/api'
import {
  Button,
  FormField,
  Modal,
  Spinner,
} from '@shared/ui'

import { useBulkMaterialAccessMutation } from '../model/use-material-access'
import { MaterialLevelsPicker } from './material-levels-picker'

const MODE_OPTIONS: Array<{ value: MaterialAccessMode; label: string; hint: string }> = [
  {
    value: 'replace',
    label: 'Заменить',
    hint: 'Текущие уровни разделов будут полностью заменены выбранными.',
  },
  {
    value: 'add',
    label: 'Добавить',
    hint: 'Выбранные уровни добавятся к уже назначенным.',
  },
  {
    value: 'remove',
    label: 'Снять',
    hint: 'Выбранные уровни будут убраны у отмеченных разделов.',
  },
]

type BulkMaterialAccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sectionIds: string[]
  onSuccess?: () => void
}

export function BulkMaterialAccessDialog({
  open,
  onOpenChange,
  sectionIds,
  onSuccess,
}: BulkMaterialAccessDialogProps) {
  const levels = useSupabaseQuery(
    queryKeys.levels.list({ search: '', active: 'all' }),
    () => levelsService.list({ active: 'all' }),
    { ensureFreshSession: true, staleTime: 30_000, enabled: open },
  )
  const mutation = useBulkMaterialAccessMutation()
  const [mode, setMode] = useState<MaterialAccessMode>('replace')
  const [levelIds, setLevelIds] = useState<string[]>([])
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!open) return
    setMode('replace')
    setLevelIds([])
    setError(undefined)
  }, [open])

  const submit = async () => {
    setError(undefined)
    if (!sectionIds.length) {
      setError('Не выбраны разделы')
      return
    }
    if (mode !== 'replace' && levelIds.length === 0) {
      setError('Выберите хотя бы один уровень')
      return
    }

    await mutation.mutateAsync({ sectionIds, levelIds, mode })
    onSuccess?.()
    onOpenChange(false)
  }

  const modeMeta = MODE_OPTIONS.find((item) => item.value === mode)

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Массовое изменение доступа"
      description={`Разделов выбрано: ${sectionIds.length}. Один запрос на сервер.`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || sectionIds.length === 0}
            onClick={() => void submit()}
          >
            {mutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Применить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Режим">
          <div className="grid gap-2 sm:grid-cols-3">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={mutation.isPending}
                onClick={() => setMode(option.value)}
                className={
                  mode === option.value
                    ? 'rounded-md border border-primary bg-accent/40 px-3 py-2 text-sm font-medium'
                    : 'rounded-md border px-3 py-2 text-sm'
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          {modeMeta ? (
            <p className="mt-2 text-xs text-muted-foreground">{modeMeta.hint}</p>
          ) : null}
        </FormField>

        <FormField
          label="Уровни участия"
          description={
            mode === 'replace'
              ? 'Можно оставить пустым, чтобы снять весь доступ.'
              : undefined
          }
        >
          <MaterialLevelsPicker
            levels={levels.data ?? []}
            value={levelIds}
            onChange={setLevelIds}
            disabled={mutation.isPending || levels.isLoading}
            error={error}
          />
        </FormField>
      </div>
    </Modal>
  )
}
