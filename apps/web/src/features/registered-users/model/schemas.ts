import { z } from 'zod'

import type { UserRole, UserStatus } from '@shared/types'

export const registeredUserStatusFilterSchema = z.enum([
  'all',
  'pending',
  'confirmed',
  'blocked',
])

export type RegisteredUserStatusFilter = z.infer<typeof registeredUserStatusFilterSchema>

export const registeredUserRoleFilterSchema = z.enum(['all', 'admin', 'member'])

export type RegisteredUserRoleFilter = z.infer<typeof registeredUserRoleFilterSchema>

export function registeredUserStatusFilterLabel(status: RegisteredUserStatusFilter): string {
  switch (status) {
    case 'pending':
      return 'На рассмотрении'
    case 'confirmed':
      return 'Подтверждённые'
    case 'blocked':
      return 'Заблокированные'
    default:
      return 'Все статусы'
  }
}

export function registeredUserRoleFilterLabel(role: RegisteredUserRoleFilter): string {
  switch (role) {
    case 'admin':
      return 'Сотрудники АПСС'
    case 'member':
      return 'Представители'
    default:
      return 'Все роли'
  }
}

export function registeredUserRoleLabel(role: UserRole): string {
  return role === 'admin' ? 'Сотрудник АПСС' : 'Представитель'
}

export function formatRegisteredUserDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function registeredUserCompanyLabel(user: {
  company_name_hint: string | null
  representative: { company: { name: string } | null } | null
}): string {
  return user.representative?.company?.name ?? user.company_name_hint ?? '—'
}

export function isRegisteredUserStatus(value: string): value is UserStatus {
  return value === 'pending' || value === 'confirmed' || value === 'blocked'
}
