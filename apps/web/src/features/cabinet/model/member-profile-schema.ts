import { z } from 'zod'

const messengerUsername = z
  .string()
  .trim()
  .max(64, 'Имя пользователя слишком длинное')
  .refine(
    (value) => !value || /^[A-Za-z0-9_.]{2,64}$/.test(value.replace(/^@+/, '')),
    'Латиница, цифры, _ и точка (от 2 символов)',
  )

export const memberProfileFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Укажите ФИО').max(120, 'ФИО слишком длинное'),
  position: z.string().trim().max(120, 'Должность слишком длинная'),
  phone: z.string().trim().max(32, 'Телефон слишком длинный'),
  telegramUsername: messengerUsername,
  maxUsername: messengerUsername,
  showContactsToMembers: z.boolean(),
})

export type MemberProfileFormValues = z.infer<typeof memberProfileFormSchema>
