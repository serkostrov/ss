import { z } from 'zod'

export const directionActiveFilterSchema = z.enum(['all', 'active', 'hidden'])
export type DirectionActiveFilter = z.infer<typeof directionActiveFilterSchema>

export const directionFormSchema = z.object({
  name: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(2, 'Название слишком короткое')
    .max(120, 'Название слишком длинное'),
  isActive: z.boolean(),
})

export type DirectionFormValues = z.infer<typeof directionFormSchema>

export function activeFilterLabel(value: DirectionActiveFilter): string {
  switch (value) {
    case 'active':
      return 'Активные'
    case 'hidden':
      return 'Скрытые'
    default:
      return 'Все'
  }
}
