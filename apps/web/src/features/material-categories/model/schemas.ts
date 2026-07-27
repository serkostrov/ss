import { z } from 'zod'

export const materialCategoryActiveFilterSchema = z.enum(['all', 'active', 'hidden'])
export type MaterialCategoryActiveFilter = z.infer<typeof materialCategoryActiveFilterSchema>

export const materialCategoryFormSchema = z.object({
  name: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(2, 'Название слишком короткое')
    .max(120, 'Название слишком длинное'),
  isActive: z.boolean(),
})

export type MaterialCategoryFormValues = z.infer<typeof materialCategoryFormSchema>

export function activeFilterLabel(value: MaterialCategoryActiveFilter): string {
  switch (value) {
    case 'active':
      return 'Активные'
    case 'hidden':
      return 'Скрытые'
    default:
      return 'Все'
  }
}
