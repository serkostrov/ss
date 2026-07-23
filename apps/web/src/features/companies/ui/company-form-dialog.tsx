import { useEffect, useMemo, useState } from 'react'

import type { Company } from '@shared/api'
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

import { companyFormSchema, type CompanyFormValues } from '../model/schemas'
import {
  toCompanyInput,
  useActiveLevelsForSelect,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
} from '../model/use-companies'

type CompanyFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  company?: Company | null
  onCreated?: (company: Company) => void
}

function toFormValues(company?: Company | null): CompanyFormValues {
  return {
    name: company?.name ?? '',
    inn: company?.inn ?? '',
    description: company?.description ?? '',
    phone: company?.phone ?? '',
    email: company?.email ?? '',
    website: company?.website ?? '',
    address: company?.address ?? '',
    participationLevelId: company?.participation_level_id ?? '',
    accessStatus: company?.access_status ?? 'active',
    notes: company?.notes ?? '',
  }
}

export function CompanyFormDialog({
  open,
  onOpenChange,
  company,
  onCreated,
}: CompanyFormDialogProps) {
  const isEdit = Boolean(company)
  const levels = useActiveLevelsForSelect()
  const createMutation = useCreateCompanyMutation()
  const updateMutation = useUpdateCompanyMutation()
  const [values, setValues] = useState<CompanyFormValues>(() => toFormValues(company))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(company))
    setErrors({})
  }, [open, company])

  const pending = createMutation.isPending || updateMutation.isPending

  const patch = <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = companyFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const payload = toCompanyInput(parsed.data)

    if (isEdit && company) {
      await updateMutation.mutateAsync({ id: company.id, values: payload })
      onOpenChange(false)
      return
    }

    const created = await createMutation.mutateAsync(payload)
    onOpenChange(false)
    onCreated?.(created)
  }

  const levelOptions = useMemo(() => {
    const options = [...(levels.data ?? [])]
    if (
      company?.participation_level &&
      !options.some((item) => item.id === company.participation_level_id)
    ) {
      options.push({
        id: company.participation_level.id,
        name: `${company.participation_level.name} (скрыт)`,
        description: null,
        sort_order: company.participation_level.sort_order,
        is_active: company.participation_level.is_active,
        created_at: '',
      })
    }
    return options
  }, [levels.data, company])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать компанию' : 'Новая компания'}
      description="Карточка организации — участника ассоциации."
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
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Название" required error={errors.name} className="sm:col-span-2">
          <Input
            value={values.name}
            onChange={(event) => patch('name', event.target.value)}
            placeholder="ООО «Пример»"
            autoFocus
          />
        </FormField>

        <FormField label="ИНН" error={errors.inn}>
          <Input
            value={values.inn ?? ''}
            onChange={(event) => patch('inn', event.target.value.replace(/\D/g, '').slice(0, 12))}
            inputMode="numeric"
            placeholder="10 или 12 цифр"
          />
        </FormField>

        <FormField label="Статус доступа" error={errors.accessStatus}>
          <Select
            value={values.accessStatus}
            onValueChange={(value) =>
              patch('accessStatus', value as CompanyFormValues['accessStatus'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Активна</SelectItem>
              <SelectItem value="suspended">Приостановлена</SelectItem>
              <SelectItem value="archived">Вышедшая</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Уровень участия"
          error={errors.participationLevelId}
          className="sm:col-span-2"
        >
          <Select
            value={values.participationLevelId || '__none__'}
            onValueChange={(value) =>
              patch('participationLevelId', value === '__none__' ? '' : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Не назначен" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Не назначен</SelectItem>
              {levelOptions.map((level) => (
                <SelectItem key={level.id} value={level.id}>
                  {level.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Телефон" error={errors.phone}>
          <Input
            value={values.phone ?? ''}
            onChange={(event) => patch('phone', event.target.value)}
          />
        </FormField>

        <FormField label="Email" error={errors.email}>
          <Input
            value={values.email ?? ''}
            onChange={(event) => patch('email', event.target.value)}
            type="email"
          />
        </FormField>

        <FormField label="Сайт" error={errors.website} className="sm:col-span-2">
          <Input
            value={values.website ?? ''}
            onChange={(event) => patch('website', event.target.value)}
            placeholder="example.ru"
          />
        </FormField>

        <FormField label="Адрес" error={errors.address} className="sm:col-span-2">
          <Input
            value={values.address ?? ''}
            onChange={(event) => patch('address', event.target.value)}
          />
        </FormField>

        <FormField label="Описание" error={errors.description} className="sm:col-span-2">
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => patch('description', event.target.value)}
            rows={3}
          />
        </FormField>

        <FormField
          label="Внутренние заметки"
          description="Видны только админу"
          error={errors.notes}
          className="sm:col-span-2"
        >
          <Textarea
            value={values.notes ?? ''}
            onChange={(event) => patch('notes', event.target.value)}
            rows={3}
            placeholder="Служебные комментарии…"
          />
        </FormField>
      </div>
    </Modal>
  )
}
