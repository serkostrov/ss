import { useEffect, useState } from 'react'

import type { MaterialCategory } from '@shared/api'
import { Button, Checkbox, FormField, Input, Modal, Spinner } from '@shared/ui'

import { materialCategoryFormSchema, type MaterialCategoryFormValues } from '../model/schemas'
import {
  useCreateMaterialCategoryMutation,
  useUpdateMaterialCategoryMutation,
} from '../model/use-material-categories'

type MaterialCategoryFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: MaterialCategory | null
}

function toFormValues(category?: MaterialCategory | null): MaterialCategoryFormValues {
  return {
    name: category?.name ?? '',
    isActive: category?.is_active ?? true,
  }
}

export function MaterialCategoryFormDialog({
  open,
  onOpenChange,
  category,
}: MaterialCategoryFormDialogProps) {
  const isEdit = Boolean(category)
  const createMutation = useCreateMaterialCategoryMutation()
  const updateMutation = useUpdateMaterialCategoryMutation()
  const [values, setValues] = useState<MaterialCategoryFormValues>(() => toFormValues(category))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(category))
    setErrors({})
  }, [open, category])

  const pending = createMutation.isPending || updateMutation.isPending

  const patch = <K extends keyof MaterialCategoryFormValues>(
    key: K,
    value: MaterialCategoryFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = materialCategoryFormSchema.safeParse(values)
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

    if (isEdit && category) {
      await updateMutation.mutateAsync({ id: category.id, values: payload })
    } else {
      await createMutation.mutateAsync(payload)
    }

    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать категорию' : 'Новая категория материалов'}
      description="Категории используются для группировки разделов материалов."
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
            placeholder="Например, Письма МПТ"
            autoFocus
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.isActive}
            onCheckedChange={(checked) => patch('isActive', checked === true)}
          />
          Активна (видна при выборе в материалах)
        </label>
      </div>
    </Modal>
  )
}
