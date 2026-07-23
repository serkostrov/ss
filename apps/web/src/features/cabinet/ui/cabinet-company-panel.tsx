import { useEffect, useState } from 'react'

import { useAuth } from '@app/providers'
import { normalizeInnDigits } from '@shared/api'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  Spinner,
  Textarea,
} from '@shared/ui'

import { memberCompanyFormSchema } from '../model/member-company-schema'
import {
  toMemberCompanyFormValues,
  useOwnCompany,
  useUpdateOwnCompanyMutation,
} from '../model/use-cabinet-company'

export function CabinetCompanyPanel() {
  const { profile } = useAuth()
  const companyId = profile?.membership?.companyId
  const companyQuery = useOwnCompany(companyId)
  const updateMutation = useUpdateOwnCompanyMutation(companyId ?? '')

  const [values, setValues] = useState(() => toMemberCompanyFormValues(null))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (companyQuery.data) {
      setValues(toMemberCompanyFormValues(companyQuery.data))
      setErrors({})
    }
  }, [companyQuery.data])

  if (!companyId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Моя компания" description="Карточка организации в ассоциации." />
        <Alert>
          <AlertTitle>Компания не привязана</AlertTitle>
          <AlertDescription>
            После подтверждения заявки админом здесь можно будет редактировать данные организации.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (companyQuery.isLoading && !companyQuery.data) {
    return <LoadingState label="Загрузка компании…" />
  }

  const patch = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = memberCompanyFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    await updateMutation.mutateAsync(parsed.data)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Моя компания"
        description="Редактируйте публичные сведения об организации. Уровень участия и статус доступа меняет только администратор АПСС."
      />

      <div className="grid max-w-2xl gap-4">
        <FormField label="Название" required error={errors.name}>
          <Input value={values.name} onChange={(event) => patch('name', event.target.value)} />
        </FormField>
        <FormField label="ИНН" error={errors.inn}>
          <Input
            inputMode="numeric"
            value={values.inn ?? ''}
            onChange={(event) => patch('inn', normalizeInnDigits(event.target.value))}
            placeholder="10 или 12 цифр"
          />
        </FormField>
        <FormField label="Описание" error={errors.description}>
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => patch('description', event.target.value)}
            rows={4}
            placeholder="Кратко о компании"
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
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
            />
          </FormField>
        </div>
        <FormField label="Сайт" error={errors.website}>
          <Input
            value={values.website ?? ''}
            onChange={(event) => patch('website', event.target.value)}
            placeholder="example.ru"
          />
        </FormField>
        <FormField label="Адрес" error={errors.address}>
          <Input
            value={values.address ?? ''}
            onChange={(event) => patch('address', event.target.value)}
          />
        </FormField>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={updateMutation.isPending || !companyId}
            onClick={() => void submit()}
          >
            {updateMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}
