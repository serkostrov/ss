import { useEffect, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'

import { CompanyProductsPanel } from '@features/company-products'
import { useAuth } from '@app/providers'
import { normalizeInnDigits } from '@shared/api'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Spinner,
  StatusBadge,
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
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (companyQuery.data && !isEditing) {
      setValues(toMemberCompanyFormValues(companyQuery.data))
      setErrors({})
    }
  }, [companyQuery.data, isEditing])

  if (!companyId) {
    return (
      <Alert>
        <AlertTitle>Компания не привязана</AlertTitle>
        <AlertDescription>
          После подтверждения заявки администратором здесь появится карточка организации.
        </AlertDescription>
      </Alert>
    )
  }

  if (companyQuery.isLoading && !companyQuery.data) {
    return <LoadingState label="Загрузка компании…" />
  }

  if (companyQuery.isError) {
    return <ErrorState error={companyQuery.error} onRetry={() => void companyQuery.refetch()} />
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
    setIsEditing(false)
  }

  const company = companyQuery.data

  if (company && !isEditing) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{company.name}</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Публичная карточка организации в ассоциации.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="size-4" />
              Редактировать
            </Button>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <CompanyField label="ИНН" value={company.inn} />
              <CompanyField label="Статус" value={<StatusBadge status={company.access_status} />} />
              <CompanyField
                label="Уровень участия"
                value={profile?.membership?.participationLevelName}
              />
              <CompanyField label="Телефон" value={company.phone} />
              <CompanyField label="Email" value={company.email} />
              <CompanyField label="Сайт" value={company.website} />
              <CompanyField label="Адрес" value={company.address} />
              <CompanyField
                label="Описание"
                value={company.description}
                className="sm:col-span-2"
              />
            </dl>
          </CardContent>
        </Card>

        <div className="border-t pt-6 empty:hidden">
          <CompanyProductsPanel companyId={companyId} editable={false} />
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Редактирование компании</CardTitle>
        <p className="text-muted-foreground text-sm">
          Уровень участия и статус доступа меняет только администратор АПСС.
        </p>
      </CardHeader>
      <CardContent className="grid w-full gap-4">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Телефон" error={errors.phone} className="min-w-0">
            <Input
              value={values.phone ?? ''}
              onChange={(event) => patch('phone', event.target.value)}
            />
          </FormField>
          <FormField label="Email" error={errors.email} className="min-w-0">
            <Input
              value={values.email ?? ''}
              onChange={(event) => patch('email', event.target.value)}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Сайт" error={errors.website} className="min-w-0">
            <Input
              value={values.website ?? ''}
              onChange={(event) => patch('website', event.target.value)}
              placeholder="example.ru"
            />
          </FormField>
          <FormField label="Адрес" error={errors.address} className="min-w-0">
            <Input
              value={values.address ?? ''}
              onChange={(event) => patch('address', event.target.value)}
            />
          </FormField>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={updateMutation.isPending}
            onClick={() => setIsEditing(false)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            disabled={updateMutation.isPending || !companyId}
            onClick={() => void submit()}
          >
            {updateMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Сохранить
          </Button>
        </div>
        <div className="border-t pt-6">
          <CompanyProductsPanel companyId={companyId} editable />
        </div>
      </CardContent>
    </Card>
  )
}

function CompanyField({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="mt-1 text-sm break-words">{value || 'Не указано'}</dd>
    </div>
  )
}
