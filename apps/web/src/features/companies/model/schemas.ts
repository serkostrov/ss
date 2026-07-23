import { z } from 'zod'

import type { CompanyAccessStatus } from '@shared/api'

export const companyAccessFilterSchema = z.enum(['all', 'active', 'suspended', 'archived'])
export type CompanyAccessFilter = z.infer<typeof companyAccessFilterSchema>

const optionalText = (max: number) =>
  z.string().trim().max(max, `Не более ${max} символов`).optional().or(z.literal(''))

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: 'Некорректный email',
  })

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((value) => {
    if (!value) return true
    try {
      // allow without protocol
      const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`
      new URL(normalized)
      return true
    } catch {
      return false
    }
  }, { message: 'Некорректный сайт' })

export const companyFormSchema = z.object({
  name: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(2, 'Название слишком короткое')
    .max(200, 'Название слишком длинное'),
  inn: optionalText(12).refine((value) => !value || /^\d{10}(\d{2})?$/.test(value), {
    message: 'ИНН: 10 или 12 цифр',
  }),
  description: optionalText(2000),
  phone: optionalText(32),
  email: optionalEmail,
  website: optionalUrl,
  address: optionalText(500),
  participationLevelId: z.string().uuid().optional().or(z.literal('')),
  accessStatus: z.enum(['active', 'suspended', 'archived'] satisfies [
    CompanyAccessStatus,
    ...CompanyAccessStatus[],
  ]),
  notes: optionalText(4000),
})

export type CompanyFormValues = z.infer<typeof companyFormSchema>

export function accessStatusLabel(status: CompanyAccessStatus | 'all'): string {
  switch (status) {
    case 'active':
      return 'Активные'
    case 'suspended':
      return 'Приостановленные'
    case 'archived':
      return 'В архиве'
    default:
      return 'Все статусы'
  }
}

export function formatCompanyDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}
