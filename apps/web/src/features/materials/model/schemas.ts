import { z } from 'zod'

export const materialStatusFilterSchema = z.enum(['all', 'draft', 'published'])
export type MaterialStatusFilter = z.infer<typeof materialStatusFilterSchema>

export const materialSectionFormSchema = z
  .object({
    title: z
      .string({ required_error: 'Укажите название' })
      .trim()
      .min(2, 'Название слишком короткое')
      .max(200, 'Название слишком длинное'),
    slug: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Только латиница, цифры и дефис')
      .optional()
      .or(z.literal('')),
    description: z.string().trim().max(1000).optional().or(z.literal('')),
    content: z.string().max(100_000).optional().or(z.literal('')),
    isPublished: z.boolean(),
    levelIds: z.array(z.string().uuid()),
  })
  .superRefine((values, ctx) => {
    if (values.isPublished && values.levelIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Для публикации укажите хотя бы один уровень доступа',
        path: ['levelIds'],
      })
    }
  })

export type MaterialSectionFormValues = z.infer<typeof materialSectionFormSchema>

export function materialStatusFilterLabel(value: MaterialStatusFilter): string {
  switch (value) {
    case 'draft':
      return 'Черновики'
    case 'published':
      return 'Опубликованные'
    default:
      return 'Все'
  }
}

export function formatMaterialDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}
