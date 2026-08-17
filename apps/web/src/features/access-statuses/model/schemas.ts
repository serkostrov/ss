import { z } from 'zod'

export const accessStatusSlugSchema = z
  .string({ required_error: 'Укажите код' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]*$/, 'Код: латиница, цифры и _ (начинается с буквы)')

export const accessStatusFormSchema = z.object({
  slug: accessStatusSlugSchema,
  name: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(2, 'Название слишком короткое')
    .max(120, 'Название слишком длинное'),
  description: z.string().trim().max(500, 'Слишком длинное описание').optional().or(z.literal('')),
  excludesFromProgram: z.boolean(),
  isActive: z.boolean(),
})

export type AccessStatusFormValues = z.infer<typeof accessStatusFormSchema>

export function suggestAccessStatusSlug(name: string): string {
  const map: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  }

  const transliterated = name
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')

  if (/^[a-z]/.test(transliterated)) return transliterated.slice(0, 48)
  if (transliterated) return `status_${transliterated}`.slice(0, 48)
  return ''
}
