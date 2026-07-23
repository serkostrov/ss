import { z } from 'zod'

const emailSchema = z
  .string({ required_error: 'Укажите email' })
  .trim()
  .min(1, 'Укажите email')
  .email('Некорректный email')
  .transform((value) => value.toLowerCase())

const passwordSchema = z
  .string({ required_error: 'Укажите пароль' })
  .min(8, 'Пароль не менее 8 символов')
  .max(72, 'Пароль слишком длинный')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'Укажите пароль' }).min(1, 'Укажите пароль'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string({ required_error: 'Повторите пароль' }),
    fullName: z
      .string({ required_error: 'Укажите ФИО' })
      .trim()
      .min(2, 'ФИО слишком короткое')
      .max(120, 'ФИО слишком длинное'),
    phone: z
      .string()
      .trim()
      .max(32, 'Телефон слишком длинный')
      .optional()
      .or(z.literal('')),
    companyInnHint: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .refine((value) => !value || /^\d{10}(\d{2})?$/.test(value), {
        message: 'ИНН: 10 или 12 цифр',
      }),
    companyNameHint: z
      .string()
      .trim()
      .max(200, 'Название компании слишком длинное')
      .optional()
      .or(z.literal('')),
    accepted: z.boolean().refine((value) => value === true, {
      message: 'Необходимо принять условия регистрации',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>

export const resetPasswordSchema = z.object({
  email: emailSchema,
})

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string({ required_error: 'Повторите пароль' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

export type UpdatePasswordFormValues = z.infer<typeof updatePasswordSchema>
