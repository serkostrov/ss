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

export const companyBalanceFilterSchema = z.enum(['all', 'positive', 'zero', 'negative'])
export type CompanyBalanceFilterValue = z.infer<typeof companyBalanceFilterSchema>

export const companySortBySchema = z.enum(['name', 'balance_asc', 'balance_desc', 'auto_id'])
export type CompanySortByValue = z.infer<typeof companySortBySchema>

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
  balance: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((value) => {
      if (!value) return true
      const normalized = value.replace(/\s/g, '').replace(',', '.')
      return /^-?\d+(\.\d{1,2})?$/.test(normalized)
    }, { message: 'Баланс: число с не более чем 2 знаками после запятой' }),
})

export type CompanyFormValues = z.infer<typeof companyFormSchema>

export const companyCommentSchema = z.object({
  body: z
    .string({ required_error: 'Введите комментарий' })
    .trim()
    .min(1, 'Введите комментарий')
    .max(4000, 'Не более 4000 символов'),
})

export type CompanyCommentFormValues = z.infer<typeof companyCommentSchema>

export function accessStatusLabel(status: CompanyAccessStatus | 'all'): string {
  switch (status) {
    case 'active':
      return 'Активные'
    case 'suspended':
      return 'Приостановленные'
    case 'archived':
      return 'Вышедшие'
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

export function formatCompanyBalance(value: number): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return String(value)
  }
}

export function parseCompanyBalance(value: string | undefined): number {
  if (!value?.trim()) return 0
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function balanceFilterLabel(value: CompanyBalanceFilterValue): string {
  switch (value) {
    case 'positive':
      return 'Положительный'
    case 'zero':
      return 'Нулевой'
    case 'negative':
      return 'Отрицательный'
    default:
      return 'Любой баланс'
  }
}

export function sortByLabel(value: CompanySortByValue): string {
  switch (value) {
    case 'balance_asc':
      return 'Баланс ↑'
    case 'balance_desc':
      return 'Баланс ↓'
    case 'auto_id':
      return 'По ID'
    default:
      return 'По названию'
  }
}
