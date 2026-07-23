import { useEffect, useState } from 'react'

import type { WorkGroup } from '@shared/api'
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
} from '@shared/ui'

import { workGroupFormSchema, type WorkGroupFormValues } from '../model/schemas'
import {
  toWorkGroupInput,
  useCreateWorkGroupMutation,
  useRepresentativesForWorkGroupSelect,
  useUpdateWorkGroupMutation,
  useWorkGroupCategories,
} from '../model/use-work-groups'

type WorkGroupFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workGroup?: WorkGroup | null
  onCreated?: (group: WorkGroup) => void
}

function toFormValues(workGroup?: WorkGroup | null): WorkGroupFormValues {
  return {
    name: workGroup?.name ?? '',
    description: workGroup?.description ?? '',
    responsibleRepresentativeId: workGroup?.responsible_representative_id ?? '',
    categoryId: workGroup?.category_id ?? '',
    status: workGroup?.status ?? 'active',
  }
}

export function WorkGroupFormDialog({
  open,
  onOpenChange,
  workGroup,
  onCreated,
}: WorkGroupFormDialogProps) {
  const isEdit = Boolean(workGroup)
  const representatives = useRepresentativesForWorkGroupSelect()
  const categories = useWorkGroupCategories()
  const createMutation = useCreateWorkGroupMutation()
  const updateMutation = useUpdateWorkGroupMutation()
  const [values, setValues] = useState<WorkGroupFormValues>(() => toFormValues(workGroup))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(workGroup))
    setErrors({})
  }, [open, workGroup])

  const pending = createMutation.isPending || updateMutation.isPending

  const patch = <K extends keyof WorkGroupFormValues>(key: K, value: WorkGroupFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = workGroupFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const payload = toWorkGroupInput(parsed.data)

    if (isEdit && workGroup) {
      await updateMutation.mutateAsync({ id: workGroup.id, values: payload })
      onOpenChange(false)
      return
    }

    const created = await createMutation.mutateAsync(payload)
    onOpenChange(false)
    onCreated?.(created)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать группу' : 'Новая рабочая группа'}
      description="Направление (категория), ответственный и статус. Каналы Telegram/Max подключаются отдельно."
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
            autoFocus
          />
        </FormField>
        <FormField label="Описание" error={errors.description}>
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => patch('description', event.target.value)}
            rows={3}
          />
        </FormField>
        <FormField label="Направление" error={errors.categoryId}>
          <Select
            value={values.categoryId || 'none'}
            onValueChange={(value) => patch('categoryId', value === 'none' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите направление" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Не указано</SelectItem>
              {(categories.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Ответственный представитель" error={errors.responsibleRepresentativeId}>
          <Select
            value={values.responsibleRepresentativeId || 'none'}
            onValueChange={(value) =>
              patch('responsibleRepresentativeId', value === 'none' ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Не назначен" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Не назначен</SelectItem>
              {(representatives.data ?? []).map((rep) => (
                <SelectItem key={rep.id} value={rep.id}>
                  {rep.full_name}
                  {rep.company ? ` · ${rep.company.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Статус" error={errors.status}>
          <Select
            value={values.status}
            onValueChange={(value) =>
              patch('status', value as WorkGroupFormValues['status'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Активна</SelectItem>
              <SelectItem value="paused">На паузе</SelectItem>
              <SelectItem value="archived">Завершена</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </Modal>
  )
}
