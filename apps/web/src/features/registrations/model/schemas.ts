import { z } from 'zod'

import type { UserStatus } from '@shared/types'

export const registrationStatusFilterSchema = z.enum([
  'all',
  'pending',
  'confirmed',
  'blocked',
])

export type RegistrationStatusFilter = z.infer<typeof registrationStatusFilterSchema>

export const confirmModeSchema = z.enum(['link', 'create'])

export const confirmRegistrationSchema = z
  .object({
    mode: confirmModeSchema,
    representativeId: z.string().optional(),
    companyMode: z.enum(['existing', 'new']),
    companyId: z.string().optional(),
    companyName: z.string().trim().max(200).optional(),
    companyInn: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .refine((value) => !value || /^\d{10}(\d{2})?$/.test(value), {
        message: 'ИНН: 10 или 12 цифр',
      }),
    fullName: z.string().trim().max(120).optional(),
    position: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().optional(),
    isPrimary: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'link') {
      if (!values.representativeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Выберите представителя',
          path: ['representativeId'],
        })
      }
      return
    }

    if (!values.fullName || values.fullName.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Укажите ФИО представителя',
        path: ['fullName'],
      })
    }

    if (values.companyMode === 'existing' && !values.companyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Выберите компанию',
        path: ['companyId'],
      })
    }

    if (values.companyMode === 'new' && !values.companyName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Укажите название компании',
        path: ['companyName'],
      })
    }

    if (values.email && values.email.length > 0) {
      const parsed = z.string().email().safeParse(values.email)
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Некорректный email',
          path: ['email'],
        })
      }
    }
  })

export type ConfirmRegistrationFormValues = z.infer<typeof confirmRegistrationSchema>

export function formatRegistrationDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function statusFilterLabel(status: RegistrationStatusFilter): string {
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

export function isPendingStatus(status: UserStatus): boolean {
  return status === 'pending'
}
