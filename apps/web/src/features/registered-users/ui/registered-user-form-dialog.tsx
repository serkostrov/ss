import { useEffect, useState } from 'react'

import { useAuth } from '@app/providers'
import type { RegisteredUser } from '@shared/api'
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
  registeredUserFormSchema,
  registeredUserRoleLabel,
  type RegisteredUserFormValues,
} from '../model/schemas'
import { useUpdateRegisteredUserMutation } from '../model/use-registered-users'

type RegisteredUserFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: RegisteredUser | null
}

function toFormValues(user: RegisteredUser | null): RegisteredUserFormValues {
  return {
    email: user?.email ?? '',
    fullName: user?.full_name ?? '',
    phone: user?.phone ?? '',
    role: user?.role ?? 'member',
    status: user?.status ?? 'pending',
    password: '',
    staffPosition: user?.staff_position ?? '',
    isCeo: user?.is_ceo ?? false,
    canManageWorkGroups: user?.can_manage_work_groups ?? true,
    companyNameHint: user?.company_name_hint ?? '',
    companyInnHint: user?.company_inn_hint ?? '',
  }
}

export function RegisteredUserFormDialog({
  open,
  onOpenChange,
  user,
}: RegisteredUserFormDialogProps) {
  const { profile } = useAuth()
  const updateMutation = useUpdateRegisteredUserMutation()
  const [values, setValues] = useState<RegisteredUserFormValues>(() => toFormValues(user))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const actorIsCeo = profile?.isCeo ?? false
  const isSelf = profile?.id === user?.id

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(user))
    setErrors({})
  }, [open, user])

  if (!user) return null

  const patch = <K extends keyof RegisteredUserFormValues>(
    key: K,
    value: RegisteredUserFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const submit = async () => {
    const parsed = registeredUserFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !next[key]) {
          next[key] = issue.message
        }
      }
      setErrors(next)
      return
    }

    const password = parsed.data.password.trim()

    await updateMutation.mutateAsync({
      userId: user.id,
      email: parsed.data.email,
      fullName: parsed.data.fullName || null,
      phone: parsed.data.phone || null,
      role: parsed.data.role,
      status: isSelf ? undefined : parsed.data.status,
      password: password || null,
      staffPosition: parsed.data.role === 'admin' ? parsed.data.staffPosition || null : null,
      isCeo: parsed.data.role === 'admin' && actorIsCeo ? parsed.data.isCeo : undefined,
      canManageWorkGroups:
        parsed.data.role === 'admin' ? parsed.data.canManageWorkGroups : undefined,
      companyNameHint:
        parsed.data.role === 'member' ? parsed.data.companyNameHint || null : undefined,
      companyInnHint: parsed.data.role === 'member' ? parsed.data.companyInnHint || null : undefined,
    })

    onOpenChange(false)
  }

  const pending = updateMutation.isPending
  const isAdmin = values.role === 'admin'

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Редактирование пользователя"
      description={user.email}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner size="sm" className="text-current" /> : null}
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Email" required error={errors.email}>
          <Input
            type="email"
            value={values.email}
            onChange={(event) => patch('email', event.target.value)}
            autoComplete="off"
          />
        </FormField>

        <FormField label="ФИО" error={errors.fullName}>
          <Input
            value={values.fullName}
            onChange={(event) => patch('fullName', event.target.value)}
          />
        </FormField>

        <FormField label="Телефон" error={errors.phone}>
          <Input
            value={values.phone}
            onChange={(event) => patch('phone', event.target.value)}
          />
        </FormField>

        <FormField label="Роль">
          <Select
            value={values.role}
            onValueChange={(value) => patch('role', value as RegisteredUserFormValues['role'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">{registeredUserRoleLabel('member')}</SelectItem>
              <SelectItem value="admin">{registeredUserRoleLabel('admin')}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Статус">
          <Select
            value={values.status}
            disabled={isSelf}
            onValueChange={(value) => patch('status', value as RegisteredUserFormValues['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">На рассмотрении</SelectItem>
              <SelectItem value="confirmed">Подтверждён</SelectItem>
              <SelectItem value="blocked">Заблокирован</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        {isAdmin ? (
          <>
            <FormField label="Должность в АПСС" error={errors.staffPosition}>
              <Input
                value={values.staffPosition}
                onChange={(event) => patch('staffPosition', event.target.value)}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.canManageWorkGroups}
                onCheckedChange={(checked) => patch('canManageWorkGroups', checked === true)}
              />
              Курирует рабочие группы
            </label>
            {actorIsCeo ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.isCeo}
                  onCheckedChange={(checked) => patch('isCeo', checked === true)}
                />
                Генеральный директор
              </label>
            ) : null}
          </>
        ) : (
          <>
            <FormField label="Компания (подсказка при регистрации)" error={errors.companyNameHint}>
              <Input
                value={values.companyNameHint}
                onChange={(event) => patch('companyNameHint', event.target.value)}
              />
            </FormField>
            <FormField label="ИНН (подсказка при регистрации)" error={errors.companyInnHint}>
              <Input
                value={values.companyInnHint}
                onChange={(event) => patch('companyInnHint', event.target.value)}
              />
            </FormField>
          </>
        )}

        <FormField
          label="Новый пароль"
          description="Оставьте пустым, если менять пароль не нужно"
          error={errors.password}
        >
          <Input
            type="password"
            value={values.password}
            onChange={(event) => patch('password', event.target.value)}
            autoComplete="new-password"
            placeholder="Минимум 8 символов"
          />
        </FormField>
      </div>
    </Modal>
  )
}
