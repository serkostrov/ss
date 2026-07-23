import { z } from 'zod'

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
      const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`
      new URL(normalized)
      return true
    } catch {
      return false
    }
  }, { message: 'Некорректный сайт' })

export const memberCompanyFormSchema = z.object({
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
})

export type MemberCompanyFormValues = z.infer<typeof memberCompanyFormSchema>
