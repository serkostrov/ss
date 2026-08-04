import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { routes } from '@shared/config'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  Input,
  Spinner,
  StatusBadge,
} from '@shared/ui'

import { memberProfileFormSchema } from '../model/member-profile-schema'
import {
  toMemberProfileFormValues,
  useUpdateOwnMemberProfileMutation,
} from '../model/use-cabinet-profile'

type CabinetProfilePanelProps = {
  isEditing: boolean
  onEditingChange: (editing: boolean) => void
}

function ProfileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="mt-1 text-sm break-words">{value || 'Не указано'}</dd>
    </div>
  )
}

export function CabinetProfilePanel({ isEditing, onEditingChange }: CabinetProfilePanelProps) {
  const { profile, refreshProfile } = useAuth()
  const updateMutation = useUpdateOwnMemberProfileMutation()
  const [values, setValues] = useState(() => toMemberProfileFormValues(profile))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isEditing) {
      setValues(toMemberProfileFormValues(profile))
      setErrors({})
    }
  }, [isEditing, profile])

  const patch = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = memberProfileFormSchema.safeParse(values)
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
    await refreshProfile()
    onEditingChange(false)
  }

  if (isEditing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Редактирование профиля</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Сохраняются только личные данные ниже. Email, статус и уровень участия меняет
            администратор.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ФИО" required error={errors.fullName} className="sm:col-span-2">
              <Input
                value={values.fullName}
                onChange={(event) => patch('fullName', event.target.value)}
              />
            </FormField>
            <FormField label="Должность" error={errors.position}>
              <Input
                value={values.position}
                onChange={(event) => patch('position', event.target.value)}
              />
            </FormField>
            <FormField label="Телефон" error={errors.phone}>
              <Input
                value={values.phone}
                onChange={(event) => patch('phone', event.target.value)}
              />
            </FormField>
            <FormField label="Telegram" error={errors.telegramUsername}>
              <Input
                value={values.telegramUsername}
                onChange={(event) => patch('telegramUsername', event.target.value)}
                placeholder="username"
              />
            </FormField>
            <FormField label="Max" error={errors.maxUsername}>
              <Input
                value={values.maxUsername}
                onChange={(event) => patch('maxUsername', event.target.value)}
                placeholder="username"
              />
            </FormField>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox
              checked={values.showContactsToMembers}
              onCheckedChange={(checked) => patch('showContactsToMembers', checked === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">Показывать контакты участникам</span>
              <span className="text-muted-foreground mt-0.5 block text-xs">
                Телефон и мессенджеры видны в справочнике.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={updateMutation.isPending}
              onClick={() => onEditingChange(false)}
            >
              Отмена
            </Button>
            <Button type="button" disabled={updateMutation.isPending} onClick={() => void submit()}>
              {updateMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
              Сохранить профиль
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Личные данные</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">
          Контактные данные представителя компании.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <ProfileField label="ФИО" value={profile?.fullName} />
          <ProfileField label="Должность" value={profile?.position} />
          <ProfileField label="Email для входа" value={profile?.email} />
          <ProfileField label="Телефон" value={profile?.phone} />
          <ProfileField
            label="Telegram"
            value={profile?.telegramUsername ? `@${profile.telegramUsername}` : null}
          />
          <ProfileField
            label="Max"
            value={profile?.maxUsername ? `@${profile.maxUsername}` : null}
          />
          <ProfileField
            label="Статус учётной записи"
            value={profile?.status ? <StatusBadge status={profile.status} /> : null}
          />
          <ProfileField
            label="Уровень участия"
            value={profile?.membership?.participationLevelName}
          />
          <ProfileField
            label="Видимость контактов"
            value={profile?.showContactsToMembers ? 'Видны участникам' : 'Скрыты'}
          />
        </dl>

        <div className="border-t pt-4">
          <Button asChild type="button" variant="ghost" size="sm">
            <Link to={routes.updatePassword}>Изменить пароль</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
