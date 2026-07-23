import { z } from 'zod'

import type { PollStatus, VoteMode } from '@shared/api'

export const pollStatusFilterSchema = z.enum(['all', 'draft', 'active', 'closed'])
export type PollStatusFilter = z.infer<typeof pollStatusFilterSchema>

export const pollVoteModeFilterSchema = z.enum(['all', 'per_company', 'per_representative'])
export type PollVoteModeFilter = z.infer<typeof pollVoteModeFilterSchema>

const datetimeOptional = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
    message: 'Некорректная дата',
  })

export const pollFormSchema = z
  .object({
    title: z
      .string({ required_error: 'Укажите название' })
      .trim()
      .min(2, 'Название слишком короткое')
      .max(200, 'Название слишком длинное'),
    description: z.string().trim().max(4000, 'Не более 4000 символов').optional().or(z.literal('')),
    voteMode: z.enum(['per_company', 'per_representative'] satisfies [VoteMode, ...VoteMode[]]),
    startsAt: datetimeOptional,
    endsAt: datetimeOptional,
    status: z.enum(['draft', 'active', 'closed'] satisfies [PollStatus, ...PollStatus[]]),
    options: z
      .array(z.string().trim().max(500, 'Вариант слишком длинный'))
      .min(2, 'Нужно минимум два варианта'),
    levelIds: z.array(z.string().uuid()),
  })
  .superRefine((values, ctx) => {
    const options = values.options.map((item) => item.trim()).filter(Boolean)
    if (options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Заполните минимум два варианта ответа',
        path: ['options'],
      })
    }

    if (values.startsAt && values.endsAt) {
      if (new Date(values.endsAt) <= new Date(values.startsAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Окончание должно быть позже начала',
          path: ['endsAt'],
        })
      }
    }

    if (values.status === 'active' && values.levelIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Для активного голосования выберите уровни',
        path: ['levelIds'],
      })
    }
  })

export type PollFormValues = z.infer<typeof pollFormSchema>

export function pollStatusLabel(status: PollStatus | 'all'): string {
  switch (status) {
    case 'draft':
      return 'Черновики'
    case 'active':
      return 'Активные'
    case 'closed':
      return 'Закрытые'
    default:
      return 'Все статусы'
  }
}

export function pollStatusName(status: PollStatus): string {
  switch (status) {
    case 'draft':
      return 'Черновик'
    case 'active':
      return 'Активно'
    case 'closed':
      return 'Закрыто'
  }
}

export function pollStatusActionLabel(status: PollStatus): string {
  switch (status) {
    case 'draft':
      return 'В черновик'
    case 'active':
      return 'Активировать'
    case 'closed':
      return 'Закрыть'
  }
}

export function voteModeLabel(mode: VoteMode | 'all'): string {
  switch (mode) {
    case 'per_company':
      return 'Один голос на компанию'
    case 'per_representative':
      return 'Голос каждого представителя'
    default:
      return 'Все режимы'
  }
}

export function formatPollDate(value: string | null | undefined): string {
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

/** Convert ISO / timestamptz to value for datetime-local input. */
export function toDatetimeLocalValue(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}
