import { z } from 'zod'

import type { WorkGroupStatus } from '@shared/api'

export const workGroupStatusFilterSchema = z.enum(['all', 'active', 'paused', 'archived'])
export type WorkGroupStatusFilter = z.infer<typeof workGroupStatusFilterSchema>

export const workGroupFormSchema = z.object({
  name: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(2, 'Название слишком короткое')
    .max(200, 'Название слишком длинное'),
  description: z
    .string()
    .trim()
    .max(4000, 'Не более 4000 символов')
    .optional()
    .or(z.literal('')),
  responsibleRepresentativeId: z.string().uuid().optional().or(z.literal('')),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  status: z.enum(['active', 'paused', 'archived'] satisfies [
    WorkGroupStatus,
    ...WorkGroupStatus[],
  ]),
})

export type WorkGroupFormValues = z.infer<typeof workGroupFormSchema>

export function workGroupStatusLabel(status: WorkGroupStatus | 'all'): string {
  switch (status) {
    case 'active':
      return 'Активные'
    case 'paused':
      return 'На паузе'
    case 'archived':
      return 'Завершённые'
    default:
      return 'Все статусы'
  }
}

export function workGroupStatusActionLabel(status: WorkGroupStatus): string {
  switch (status) {
    case 'active':
      return 'Активировать'
    case 'paused':
      return 'Пауза'
    case 'archived':
      return 'Завершить'
  }
}

export function formatWorkGroupDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}
