import { z } from 'zod'

export const representativeActiveFilterSchema = z.enum(['all', 'active', 'inactive'])
export const representativePrimaryFilterSchema = z.enum(['all', 'primary', 'secondary'])

export type RepresentativeActiveFilter = z.infer<typeof representativeActiveFilterSchema>
export type RepresentativePrimaryFilter = z.infer<typeof representativePrimaryFilterSchema>

const optionalText = (max: number) =>
  z.string().trim().max(max, `Не более ${max} символов`).optional().or(z.literal(''))

export const representativeFormSchema = z
  .object({
    companyId: z.string().uuid('Выберите компанию'),
    fullName: z
      .string({ required_error: 'Укажите ФИО' })
      .trim()
      .min(2, 'ФИО слишком короткое')
      .max(120, 'ФИО слишком длинное'),
    position: optionalText(120),
    phone: optionalText(32),
    email: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .refine((value) => !value || z.string().email().safeParse(value).success, {
        message: 'Некорректный email',
      }),
    isPrimary: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.isPrimary && !values.isActive) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Основной представитель должен быть активен',
        path: ['isPrimary'],
      })
    }
  })

export type RepresentativeFormValues = z.infer<typeof representativeFormSchema>

export function representativeActiveFilterLabel(value: RepresentativeActiveFilter): string {
  switch (value) {
    case 'active':
      return 'Активные'
    case 'inactive':
      return 'Неактивные'
    default:
      return 'Все'
  }
}

export function representativePrimaryFilterLabel(value: RepresentativePrimaryFilter): string {
  switch (value) {
    case 'primary':
      return 'Основные'
    case 'secondary':
      return 'Дополнительные'
    default:
      return 'Все роли'
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}
