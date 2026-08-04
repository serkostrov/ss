import { z } from 'zod'

export const invoiceStatusFilterSchema = z.enum(['all', 'issued', 'paid'])
export type InvoiceStatusFilter = z.infer<typeof invoiceStatusFilterSchema>

export const invoiceFormSchema = z.object({
  companyId: z.string().uuid('Выберите компанию'),
  title: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(2, 'Слишком короткое название')
    .max(200, 'Слишком длинное название'),
  number: z
    .string({ required_error: 'Укажите номер счёта' })
    .trim()
    .min(1, 'Укажите номер счёта')
    .max(80, 'Слишком длинный номер'),
  amount: z
    .string({ required_error: 'Укажите сумму' })
    .trim()
    .min(1, 'Укажите сумму')
    .refine((value) => {
      const normalized = value.replace(/\s/g, '').replace(',', '.')
      const parsed = Number(normalized)
      return Number.isFinite(parsed) && parsed >= 0
    }, 'Некорректная сумма'),
  dueDate: z.string().optional().or(z.literal('')),
  issuedAt: z.string().min(1, 'Укажите дату выставления'),
  file: z.any().optional().nullable(),
})

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>

export function invoiceStatusFilterLabel(value: InvoiceStatusFilter): string {
  switch (value) {
    case 'issued':
      return 'К оплате'
    case 'paid':
      return 'Оплаченные'
    default:
      return 'Все'
  }
}

export function parseInvoiceAmount(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  return Number(normalized)
}

export function formatInvoiceAmount(value: number, currency = 'RUB'): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return String(value)
  }
}

export function formatInvoiceDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(value))
  } catch {
    return value
  }
}

export function toDateInputValue(value: string | Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
