import { useEffect, useState } from 'react'

import type { WorkGroupCategory } from '@shared/api'
import { Button, Checkbox, FormField, Input, Modal, Spinner } from '@shared/ui'

import { directionFormSchema, type DirectionFormValues } from '../model/schemas'
import { useCreateDirectionMutation, useUpdateDirectionMutation } from '../model/use-directions'

type DirectionFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  direction?: WorkGroupCategory | null
}

function toFormValues(direction?: WorkGroupCategory | null): DirectionFormValues {
  return {
    name: direction?.name ?? '',
    isActive: direction?.is_active ?? true,
  }
}

export function DirectionFormDialog({
  open,
  onOpenChange,
  direction,
}: DirectionFormDialogProps) {
  const isEdit = Boolean(direction)
  const createMutation = useCreateDirectionMutation()
  const updateMutation = useUpdateDirectionMutation()
  const [values, setValues] = useState<DirectionFormValues>(() => toFormValues(direction))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(direction))
    setErrors({})
  }, [open, direction])

  const pending = createMutation.isPending || updateMutation.isPending

  const patch = <K extends keyof DirectionFormValues>(
    key: K,
    value: DirectionFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = directionFormSchema.safeParse(values)
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
      is_active: parsed.data.isActive,
    }

    if (isEdit && direction) {
      await updateMutation.mutateAsync({ id: direction.id, values: payload })
    } else {
      await createMutation.mutateAsync(payload)
    }

    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать направление' : 'Новое направление'}
      description="Направления используются для группировки рабочих групп."
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
            placeholder="Например, Технические"
            autoFocus
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.isActive}
            onCheckedChange={(checked) => patch('isActive', checked === true)}
          />
          Активно (видно при выборе в группах)
        </label>
      </div>
    </Modal>
  )
}
