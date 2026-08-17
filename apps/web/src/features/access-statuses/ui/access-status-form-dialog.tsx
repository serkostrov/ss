import { useEffect, useState } from 'react'

import type { CompanyAccessStatusRecord } from '@shared/api'
import { companyAccessStatusResourceAccessService } from '@shared/api'
import { Button, Checkbox, FormField, Input, Modal, Spinner, Textarea } from '@shared/ui'

import {
  accessStatusFormSchema,
  suggestAccessStatusSlug,
  type AccessStatusFormValues,
} from '../model/schemas'
import {
  applyExcludesFromProgramToResourceRows,
  defaultAccessStatusResourceRows,
} from '../model/status-resource-access'
import {
  useCreateCompanyAccessStatusMutation,
  useUpdateCompanyAccessStatusMutation,
} from '../model/use-company-access-statuses'

type AccessStatusFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status?: CompanyAccessStatusRecord | null
}

function toFormValues(item?: CompanyAccessStatusRecord | null): AccessStatusFormValues {
  return {
    slug: item?.slug ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    excludesFromProgram: item?.excludes_from_program ?? false,
    isActive: item?.is_active ?? true,
  }
}

export function AccessStatusFormDialog({ open, onOpenChange, status }: AccessStatusFormDialogProps) {
  const isEdit = Boolean(status)
  const createMutation = useCreateCompanyAccessStatusMutation()
  const updateMutation = useUpdateCompanyAccessStatusMutation()
  const [values, setValues] = useState<AccessStatusFormValues>(() => toFormValues(status))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(status))
    setErrors({})
  }, [open, status])

  useEffect(() => {
    if (!open || isEdit) return
    const suggested = suggestAccessStatusSlug(values.name)
    setValues((prev) => (prev.slug === suggested ? prev : { ...prev, slug: suggested }))
  }, [open, isEdit, values.name])

  const pending = createMutation.isPending || updateMutation.isPending

  const patch = <K extends keyof AccessStatusFormValues>(
    key: K,
    value: AccessStatusFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = accessStatusFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key !== 'string') continue
        const field = key === 'slug' ? 'name' : key
        if (!next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }

    if (isEdit && status) {
      await updateMutation.mutateAsync({
        slug: status.slug,
        values: {
          name: parsed.data.name,
          description: parsed.data.description || null,
          excludesFromProgram: parsed.data.excludesFromProgram,
          isActive: parsed.data.isActive,
        },
      })
      if (parsed.data.excludesFromProgram) {
        await companyAccessStatusResourceAccessService.saveForStatus(
          status.slug,
          applyExcludesFromProgramToResourceRows(
            defaultAccessStatusResourceRows({ excludesFromProgram: true }),
            true,
          ),
        )
      }
    } else {
      await createMutation.mutateAsync({
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description || null,
        excludesFromProgram: parsed.data.excludesFromProgram,
        isActive: parsed.data.isActive,
      })
    }

    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать статус' : 'Новый статус доступа'}
      description="Название и параметры статуса. Доступ к разделам кабинета настраивается отдельно — иконка щита в списке."
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
            placeholder="Например, На паузе"
            autoFocus
          />
        </FormField>

        <FormField label="Описание" error={errors.description}>
          <Textarea
            value={values.description}
            onChange={(event) => patch('description', event.target.value)}
            placeholder="Когда назначать этот статус"
            rows={3}
          />
        </FormField>

        <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={values.excludesFromProgram}
              onCheckedChange={(checked) => patch('excludesFromProgram', checked === true)}
            />
            <span>
              <span className="font-medium">Компания вне программы ассоциации</span>
              <span className="text-muted-foreground mt-0.5 block text-xs">
                Закрывает кабинет и рабочие группы независимо от настроек доступа.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={values.isActive}
              onCheckedChange={(checked) => patch('isActive', checked === true)}
            />
            <span>
              <span className="font-medium">Доступен для выбора</span>
              <span className="text-muted-foreground mt-0.5 block text-xs">
                Статус можно назначить компании в карточке участника.
              </span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  )
}
