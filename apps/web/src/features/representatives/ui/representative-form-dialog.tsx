import { useEffect, useState } from 'react'

import type { Representative } from '@shared/api'
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@shared/ui'

import {
  representativeFormSchema,
  type RepresentativeFormValues,
} from '../model/schemas'
import {
  toRepresentativeInput,
  useCompanyOptionsForReps,
  useUpsertRepresentativeMutation,
} from '../model/use-representatives'

type RepresentativeFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  representative?: Representative | null
  defaultCompanyId?: string
  onCreated?: (representative: Representative) => void
}

function toFormValues(
  representative?: Representative | null,
  defaultCompanyId?: string,
): RepresentativeFormValues {
  return {
    companyId: representative?.company_id ?? defaultCompanyId ?? '',
    fullName: representative?.full_name ?? '',
    position: representative?.position ?? '',
    phone: representative?.phone ?? '',
    email: representative?.email ?? '',
    isPrimary: representative?.is_primary ?? false,
    isActive: representative?.is_active ?? true,
  }
}

export function RepresentativeFormDialog({
  open,
  onOpenChange,
  representative,
  defaultCompanyId,
  onCreated,
}: RepresentativeFormDialogProps) {
  const isEdit = Boolean(representative)
  const companies = useCompanyOptionsForReps()
  const upsertMutation = useUpsertRepresentativeMutation()
  const [values, setValues] = useState<RepresentativeFormValues>(() =>
    toFormValues(representative, defaultCompanyId),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(representative, defaultCompanyId))
    setErrors({})
  }, [open, representative, defaultCompanyId])

  const patch = <K extends keyof RepresentativeFormValues>(
    key: K,
    value: RepresentativeFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = representativeFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const saved = await upsertMutation.mutateAsync(
      toRepresentativeInput(parsed.data, representative?.id),
    )
    onOpenChange(false)
    if (!isEdit) {
      onCreated?.(saved)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать представителя' : 'Новый представитель'}
      description="Связь с компанией, должность и роль представителя."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={upsertMutation.isPending}
            onClick={() => void submit()}
          >
            {upsertMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Компания" required error={errors.companyId} className="sm:col-span-2">
          <Select
            value={values.companyId || undefined}
            onValueChange={(value) => patch('companyId', value)}
            disabled={Boolean(defaultCompanyId) && !isEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите компанию" />
            </SelectTrigger>
            <SelectContent>
              {(companies.data ?? []).map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="ФИО" required error={errors.fullName} className="sm:col-span-2">
          <Input
            value={values.fullName}
            onChange={(event) => patch('fullName', event.target.value)}
            autoFocus
          />
        </FormField>

        <FormField label="Должность" error={errors.position}>
          <Input
            value={values.position ?? ''}
            onChange={(event) => patch('position', event.target.value)}
          />
        </FormField>

        <FormField label="Телефон" error={errors.phone}>
          <Input
            value={values.phone ?? ''}
            onChange={(event) => patch('phone', event.target.value)}
          />
        </FormField>

        <FormField label="Email" error={errors.email} className="sm:col-span-2">
          <Input
            type="email"
            value={values.email ?? ''}
            onChange={(event) => patch('email', event.target.value)}
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={values.isActive}
            onCheckedChange={(checked) => {
              const active = checked === true
              patch('isActive', active)
              if (!active) patch('isPrimary', false)
            }}
          />
          Активен
        </label>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={values.isPrimary}
            disabled={!values.isActive}
            onCheckedChange={(checked) => patch('isPrimary', checked === true)}
          />
          Основной представитель компании
        </label>
        {errors.isPrimary ? (
          <p className="text-sm font-medium text-destructive sm:col-span-2">{errors.isPrimary}</p>
        ) : null}
      </div>
    </Modal>
  )
}
