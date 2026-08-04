import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { z } from 'zod'

import { useOkpd2Codes, useProductNotes } from '@features/product-categories'
import type { CompanyProduct, CompanyProductUpdateInput, Okpd2Code } from '@shared/api'
import { cn } from '@shared/lib/utils'
import {
  Button,
  FormField,
  Input,
  Modal,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@shared/ui'

import {
  useCreateCompanyProductMutation,
  useUpdateCompanyProductMutation,
} from '../model/use-company-products'

const CUSTOM_VALUE = '__custom__'

const productFormSchema = z
  .object({
    proposeOkpd: z.boolean(),
    okpdCodeId: z.string().optional(),
    proposedOkpdCode: z.string().optional(),
    proposedOkpdTitle: z.string().optional(),
    proposeNote: z.boolean(),
    noteId: z.string().optional(),
    proposedNoteName: z.string().optional(),
    url: z.string().trim().max(500, 'Ссылка слишком длинная').optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (value.proposeOkpd) {
      if (!value.proposedOkpdCode?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['proposedOkpdCode'],
          message: 'Укажите код ОКПД 2',
        })
      }
      if (!value.proposedOkpdTitle?.trim() || value.proposedOkpdTitle.trim().length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['proposedOkpdTitle'],
          message: 'Укажите расшифровку',
        })
      }
    } else if (!value.okpdCodeId) {
      ctx.addIssue({
        code: 'custom',
        path: ['okpdCodeId'],
        message: 'Выберите код ОКПД 2',
      })
    }

    if (value.proposeNote) {
      if (!value.proposedNoteName?.trim() || value.proposedNoteName.trim().length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['proposedNoteName'],
          message: 'Укажите примечание',
        })
      }
    } else if (!value.noteId) {
      ctx.addIssue({
        code: 'custom',
        path: ['noteId'],
        message: 'Выберите примечание',
      })
    }
  })

type ProductFormValues = z.infer<typeof productFormSchema>

const emptyValues: ProductFormValues = {
  proposeOkpd: false,
  okpdCodeId: '',
  proposedOkpdCode: '',
  proposedOkpdTitle: '',
  proposeNote: false,
  noteId: '',
  proposedNoteName: '',
  url: '',
}

function valuesFromProduct(product: CompanyProduct | null | undefined): ProductFormValues {
  if (!product) return emptyValues
  const proposeOkpd = Boolean(product.proposed_okpd_code)
  const proposeNote = Boolean(product.proposed_note_name)
  return {
    proposeOkpd,
    okpdCodeId: proposeOkpd ? '' : (product.okpd_code_id ?? ''),
    proposedOkpdCode: product.proposed_okpd_code ?? '',
    proposedOkpdTitle: product.proposed_okpd_title ?? '',
    proposeNote,
    noteId: proposeNote ? '' : (product.note_id ?? ''),
    proposedNoteName: product.proposed_note_name ?? '',
    url: product.url ?? '',
  }
}

function toPayload(values: ProductFormValues): CompanyProductUpdateInput {
  return {
    okpdCodeId: values.proposeOkpd ? null : (values.okpdCodeId || null),
    noteId: values.proposeNote ? null : (values.noteId || null),
    proposedOkpdCode: values.proposeOkpd ? values.proposedOkpdCode?.trim() : null,
    proposedOkpdTitle: values.proposeOkpd ? values.proposedOkpdTitle?.trim() : null,
    proposedNoteName: values.proposeNote ? values.proposedNoteName?.trim() : null,
    url: values.url || null,
  }
}

/** Prefer leaf codes in the picker — parents are grouping only. */
function leafOkpdCodes(codes: Okpd2Code[]): Okpd2Code[] {
  const parentIds = new Set(codes.map((item) => item.parent_id).filter(Boolean))
  const leaves = codes.filter((item) => !parentIds.has(item.id))
  return leaves.length > 0 ? leaves : codes
}

type OkpdCodePickerProps = {
  codes: Okpd2Code[]
  value: string
  custom?: boolean
  onChange: (id: string) => void
  onSelectCustom: () => void
  error?: string
}

function OkpdCodePicker({
  codes,
  value,
  custom = false,
  onChange,
  onSelectCustom,
  error,
}: OkpdCodePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selected = useMemo(
    () => (custom ? null : (codes.find((item) => item.id === value) ?? null)),
    [codes, custom, value],
  )
  const leaves = useMemo(() => leafOkpdCodes(codes), [codes])
  const hasValue = custom || Boolean(selected)

  const options = useMemo(() => {
    const term = search.trim().toLowerCase()
    const source = term ? codes : leaves
    const filtered = term
      ? source.filter((item) => `${item.code} ${item.title}`.toLowerCase().includes(term))
      : source
    return filtered.slice(0, 50)
  }, [codes, leaves, search])

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const displayValue = open
    ? search
    : custom
      ? 'Своё…'
      : selected
        ? `${selected.code} — ${selected.title}`
        : ''

  const pick = (id: string) => {
    onChange(id)
    setSearch('')
    setOpen(false)
  }

  const pickCustom = () => {
    onSelectCustom()
    setSearch('')
    setOpen(false)
  }

  return (
    <FormField label="ОКПД 2" required error={error}>
      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              'border-input flex h-9 w-full items-center rounded-md border bg-transparent shadow-xs transition-shadow',
              open && 'ring-ring ring-2',
              error && 'border-destructive',
            )}
          >
            <input
              ref={inputRef}
              value={displayValue}
              placeholder="Код или название…"
              className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setSearch(event.target.value)
                setOpen(true)
                if (hasValue) onChange('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setOpen(false)
                  inputRef.current?.blur()
                }
                if (event.key === 'ArrowDown') setOpen(true)
              }}
              aria-expanded={open}
              aria-autocomplete="list"
              role="combobox"
            />
            {hasValue && !open ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground mr-0.5 inline-flex size-7 items-center justify-center rounded-md"
                aria-label="Очистить"
                onClick={() => {
                  onChange('')
                  setSearch('')
                  setOpen(true)
                  queueMicrotask(() => inputRef.current?.focus())
                }}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground mr-1 inline-flex size-7 items-center justify-center rounded-md"
              aria-label={open ? 'Скрыть список' : 'Показать список'}
              onClick={() => {
                setOpen((current) => !current)
                if (!open) queueMicrotask(() => inputRef.current?.focus())
              }}
            >
              <ChevronDown
                className={cn('size-4 opacity-50 transition-transform', open && 'rotate-180')}
              />
            </button>
          </div>
        </PopoverAnchor>

        <PopoverContent
          className="p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ul className="max-h-56 overflow-y-auto overscroll-contain py-1" role="listbox">
            {options.length === 0 && search.trim() ? (
              <li className="text-muted-foreground px-3 py-3 text-center text-sm">
                Ничего не найдено
              </li>
            ) : (
              options.map((item) => {
                const active = item.id === value
                return (
                  <li key={item.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      className={cn(
                        'hover:bg-accent flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
                        active && 'bg-accent',
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(item.id)}
                    >
                      <span className="mt-0.5 w-[6.5rem] shrink-0 font-mono text-xs font-medium">
                        {item.code}
                      </span>
                      <span className="text-muted-foreground line-clamp-2 min-w-0 flex-1 text-xs">
                        {item.title}
                      </span>
                      {active ? <Check className="text-primary mt-0.5 size-3.5 shrink-0" /> : null}
                    </button>
                  </li>
                )
              })
            )}
            <li className="border-t">
              <button
                type="button"
                className="hover:bg-accent flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors"
                onMouseDown={(event) => event.preventDefault()}
                onClick={pickCustom}
              >
                Своё…
              </button>
            </li>
          </ul>
        </PopoverContent>
      </Popover>
    </FormField>
  )
}

export type ProductFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: string
  product?: CompanyProduct | null
  onSaved?: () => void
}

export function ProductFormDialog({
  open,
  onOpenChange,
  companyId,
  product = null,
  onSaved,
}: ProductFormDialogProps) {
  const createMutation = useCreateCompanyProductMutation(companyId)
  const updateMutation = useUpdateCompanyProductMutation(companyId)
  const okpdCodes = useOkpd2Codes(true)
  const notes = useProductNotes(true)

  const [values, setValues] = useState<ProductFormValues>(emptyValues)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(valuesFromProduct(product))
    setErrors({})
  }, [open, product])

  const pending = createMutation.isPending || updateMutation.isPending
  const editing = Boolean(product)

  const submit = async () => {
    const parsed = productFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const payload = toPayload(parsed.data)
    if (product) {
      await updateMutation.mutateAsync({ id: product.id, values: payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
    onOpenChange(false)
    onSaved?.()
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Редактировать продукцию' : 'Новая продукция'}
      description="После сохранения — на модерацию."
      className="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner size="sm" className="text-current" /> : null}
            {editing ? 'Сохранить' : 'Добавить'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <OkpdCodePicker
          codes={okpdCodes.data ?? []}
          value={values.okpdCodeId ?? ''}
          custom={values.proposeOkpd}
          error={errors.okpdCodeId}
          onChange={(okpdCodeId) => {
            setValues((prev) => ({
              ...prev,
              proposeOkpd: false,
              okpdCodeId,
              proposedOkpdCode: '',
              proposedOkpdTitle: '',
            }))
            setErrors((prev) => {
              const next = { ...prev }
              delete next.okpdCodeId
              delete next.proposedOkpdCode
              delete next.proposedOkpdTitle
              return next
            })
          }}
          onSelectCustom={() => {
            setValues((prev) => ({
              ...prev,
              proposeOkpd: true,
              okpdCodeId: '',
            }))
            setErrors((prev) => {
              const next = { ...prev }
              delete next.okpdCodeId
              return next
            })
          }}
        />

        {values.proposeOkpd ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Input
                value={values.proposedOkpdCode ?? ''}
                placeholder="Код ОКПД 2"
                className="font-mono"
                aria-label="Код ОКПД 2"
                aria-invalid={Boolean(errors.proposedOkpdCode)}
                onChange={(event) => {
                  setValues((prev) => ({ ...prev, proposedOkpdCode: event.target.value }))
                  setErrors((prev) => {
                    const next = { ...prev }
                    delete next.proposedOkpdCode
                    return next
                  })
                }}
              />
              {errors.proposedOkpdCode ? (
                <p className="text-destructive text-xs">{errors.proposedOkpdCode}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Input
                value={values.proposedOkpdTitle ?? ''}
                placeholder="Расшифровка"
                aria-label="Расшифровка"
                aria-invalid={Boolean(errors.proposedOkpdTitle)}
                onChange={(event) => {
                  setValues((prev) => ({ ...prev, proposedOkpdTitle: event.target.value }))
                  setErrors((prev) => {
                    const next = { ...prev }
                    delete next.proposedOkpdTitle
                    return next
                  })
                }}
              />
              {errors.proposedOkpdTitle ? (
                <p className="text-destructive text-xs">{errors.proposedOkpdTitle}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <FormField label="Примечание" required error={errors.noteId}>
          <Select
            value={values.proposeNote ? CUSTOM_VALUE : values.noteId || undefined}
            onValueChange={(value) => {
              if (value === CUSTOM_VALUE) {
                setValues((prev) => ({
                  ...prev,
                  proposeNote: true,
                  noteId: '',
                }))
              } else {
                setValues((prev) => ({
                  ...prev,
                  proposeNote: false,
                  noteId: value,
                  proposedNoteName: '',
                }))
              }
              setErrors((prev) => {
                const next = { ...prev }
                delete next.noteId
                delete next.proposedNoteName
                return next
              })
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите примечание" />
            </SelectTrigger>
            <SelectContent>
              {(notes.data ?? []).map((note) => (
                <SelectItem key={note.id} value={note.id}>
                  {note.name}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_VALUE}>Своё…</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        {values.proposeNote ? (
          <div className="space-y-1">
            <Input
              value={values.proposedNoteName ?? ''}
              placeholder="Своё примечание"
              aria-label="Своё примечание"
              aria-invalid={Boolean(errors.proposedNoteName)}
              onChange={(event) => {
                setValues((prev) => ({ ...prev, proposedNoteName: event.target.value }))
                setErrors((prev) => {
                  const next = { ...prev }
                  delete next.proposedNoteName
                  return next
                })
              }}
            />
            {errors.proposedNoteName ? (
              <p className="text-destructive text-xs">{errors.proposedNoteName}</p>
            ) : null}
          </div>
        ) : null}

        <FormField label="Ссылка" error={errors.url}>
          <Input
            value={values.url ?? ''}
            onChange={(event) => {
              setValues((prev) => ({ ...prev, url: event.target.value }))
              setErrors((prev) => {
                const next = { ...prev }
                delete next.url
                return next
              })
            }}
            placeholder="https://… (необязательно)"
          />
        </FormField>
      </div>
    </Modal>
  )
}

export function productLabel(product: CompanyProduct): string {
  if (product.proposed_okpd_code && product.proposed_okpd_title) {
    return `${product.proposed_okpd_code} — ${product.proposed_okpd_title}`
  }
  if (product.okpd?.code && product.okpd.title) {
    return `${product.okpd.code} — ${product.okpd.title}`
  }
  return product.name
}
