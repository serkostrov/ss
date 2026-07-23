import { useEffect, useState } from 'react'

import type { ParticipationLevel } from '@shared/api'
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Spinner,
  Textarea,
} from '@shared/ui'

import {
  participationLevelFormSchema,
  type ParticipationLevelFormValues,
} from '../model/schemas'
import { useCreateLevelMutation, useUpdateLevelMutation } from '../model/use-levels'

type LevelFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  level?: ParticipationLevel | null
}

function toFormValues(level?: ParticipationLevel | null): ParticipationLevelFormValues {
  return {
    name: level?.name ?? '',
    description: level?.description ?? '',
    isActive: level?.is_active ?? true,
  }
}

export function LevelFormDialog({ open, onOpenChange, level }: LevelFormDialogProps) {
  const isEdit = Boolean(level)
  const createMutation = useCreateLevelMutation()
  const updateMutation = useUpdateLevelMutation()
  const [values, setValues] = useState<ParticipationLevelFormValues>(() => toFormValues(level))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(level))
    setErrors({})
  }, [open, level])

  const pending = createMutation.isPending || updateMutation.isPending

  const patch = <K extends keyof ParticipationLevelFormValues>(
    key: K,
    value: ParticipationLevelFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = participationLevelFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const payload = {
      name: parsed.data.name,
      description: parsed.data.description || null,
      is_active: parsed.data.isActive,
    }

    if (isEdit && level) {
      await updateMutation.mutateAsync({ id: level.id, values: payload })
    } else {
      await createMutation.mutateAsync(payload)
    }

    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать уровень' : 'Новый уровень участия'}
      description="Уровни определяют доступ компаний к материалам и голосованиям."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner size="sm" className="text-current" /> : null}
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Название" required error={errors.name}>
          <Input
            value={values.name}
            onChange={(event) => patch('name', event.target.value)}
            placeholder="Например, Партнёр"
            autoFocus
          />
        </FormField>
        <FormField label="Описание" error={errors.description}>
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => patch('description', event.target.value)}
            placeholder="Краткое описание уровня"
            rows={4}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.isActive}
            onCheckedChange={(checked) => patch('isActive', checked === true)}
          />
          Активен (виден при назначении компаниям)
        </label>
      </div>
    </Modal>
  )
}
