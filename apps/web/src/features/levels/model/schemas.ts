import { z } from 'zod'

export const levelActiveFilterSchema = z.enum(['all', 'active', 'hidden'])
export type LevelActiveFilter = z.infer<typeof levelActiveFilterSchema>

export const participationLevelFormSchema = z.object({
  name: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(2, 'Название слишком короткое')
    .max(120, 'Название слишком длинное'),
  description: z
    .string()
    .trim()
    .max(1000, 'Описание слишком длинное')
    .optional()
    .or(z.literal('')),
  isActive: z.boolean(),
})

export type ParticipationLevelFormValues = z.infer<typeof participationLevelFormSchema>

export function activeFilterLabel(value: LevelActiveFilter): string {
  switch (value) {
    case 'active':
      return 'Активные'
    case 'hidden':
      return 'Скрытые'
    default:
      return 'Все'
  }
}
