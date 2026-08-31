import { useEffect, useState, type ReactNode } from 'react'

import { CompanyProductsPanel } from '@features/company-products'
import { companyAccessStatusMemberLabel, companyBalanceClassName, formatCompanyBalance } from '@features/companies'
import { isExitedCompany } from '@features/cabinet/model/company-access'
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

type CabinetCompanyPanelProps = {
  isEditing: boolean
  onEditingChange: (editing: boolean) => void
}

export function CabinetCompanyPanel({ isEditing, onEditingChange }: CabinetCompanyPanelProps) {
  const { profile } = useAuth()
  const companyId = profile?.membership?.companyId
  const companyQuery = useOwnCompany(companyId)
  const updateMutation = useUpdateOwnCompanyMutation(companyId ?? '')

  const [values, setValues] = useState(() => toMemberCompanyFormValues(null))
  const [errors, setErrors] = useState<Record<string, string>>({})

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
    onEditingChange(false)
  }

  const company = companyQuery.data
  const exited = isExitedCompany(profile)

  return (
    <div className="space-y-4">
      {company && !isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle>{company.name}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {exited
                ? 'Компания вышла из ассоциации. Доступна только эта карточка.'
                : 'Публичная карточка организации в ассоциации.'}
            </p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <CompanyField label="ИНН" value={company.inn} />
              <CompanyField
                label="Статус"
                value={
                  <StatusBadge
                    status={company.access_status}
                    label={companyAccessStatusMemberLabel(company.access_status)}
                  />
                }
              />
              <CompanyField
                label="Уровень участия"
                value={profile?.membership?.participationLevelName}
              />
              <CompanyField
                label="Баланс"
                value={
                  <span
                    className={`font-medium tabular-nums ${companyBalanceClassName(company.balance ?? 0)}`}
                  >
                    {formatCompanyBalance(company.balance ?? 0)}
                  </span>
                }
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Редактирование компании</CardTitle>
            <p className="text-muted-foreground text-sm">
              Сохраняются только реквизиты и контакты компании. Продукцию добавляйте в блоке ниже
              — она сохраняется отдельно. Уровень участия и статус доступа меняет администратор.
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

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() => onEditingChange(false)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                disabled={updateMutation.isPending || !companyId}
                onClick={() => void submit()}
              >
                {updateMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
                Сохранить компанию
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!exited ? <CompanyProductsPanel companyId={companyId} editable /> : null}
    </div>
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
