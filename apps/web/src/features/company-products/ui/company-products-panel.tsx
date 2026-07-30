import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'

import type { CompanyProduct } from '@shared/api'
import {
  Button,
  DeleteDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Spinner,
} from '@shared/ui'

import {
  useCompanyProducts,
  useCreateCompanyProductMutation,
  useDeleteCompanyProductMutation,
  useMoveCompanyProductMutation,
  useUpdateCompanyProductMutation,
} from '../model/use-company-products'

const productFormSchema = z.object({
  name: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(2, 'Название слишком короткое')
    .max(200, 'Название слишком длинное'),
  url: z.string().trim().max(500, 'Ссылка слишком длинная').optional().or(z.literal('')),
})

type ProductFormValues = z.infer<typeof productFormSchema>

type CompanyProductsPanelProps = {
  companyId: string
  title?: string
  editable?: boolean
}

export function CompanyProductsPanel({
  companyId,
  title = 'Продукция',
  editable = true,
}: CompanyProductsPanelProps) {
  const query = useCompanyProducts(companyId)
  const createMutation = useCreateCompanyProductMutation(companyId)
  const updateMutation = useUpdateCompanyProductMutation(companyId)
  const deleteMutation = useDeleteCompanyProductMutation(companyId)
  const moveMutation = useMoveCompanyProductMutation(companyId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CompanyProduct | null>(null)
  const [deleting, setDeleting] = useState<CompanyProduct | null>(null)
  const [values, setValues] = useState<ProductFormValues>({ name: '', url: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!formOpen) return
    setValues({
      name: editing?.name ?? '',
      url: editing?.url ?? '',
    })
    setErrors({})
  }, [formOpen, editing])

  const pending = createMutation.isPending || updateMutation.isPending
  const products = query.data ?? []

  if (!editable && !query.isLoading && !query.isError && products.length === 0) {
    return null
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

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

    const payload = {
      name: parsed.data.name,
      url: parsed.data.url || null,
    }

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, values: payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
    setFormOpen(false)
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {title ? <h3 className="text-base font-medium">{title}</h3> : <span />}
        {editable ? (
          <Button type="button" size="sm" className="shrink-0" onClick={openCreate}>
            <Plus className="size-4" />
            Добавить
          </Button>
        ) : null}
      </div>

      {query.isLoading && !query.data ? <LoadingState label="Загрузка продукции…" /> : null}

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {!query.isLoading && !query.isError && products.length === 0 ? (
        <EmptyState
          title="Продукции пока нет"
          description={
            editable
              ? 'Добавьте товары или услуги, чтобы другие участники могли найти вас как партнёра.'
              : 'Компания пока не добавила товары или услуги.'
          }
        />
      ) : null}

      {products.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {products.map((product, index) => (
            <li
              key={product.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{product.name}</p>
                {product.url ? (
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 truncate text-xs underline-offset-4 hover:underline"
                  >
                    {product.url}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  <p className="text-muted-foreground text-xs">Без ссылки</p>
                )}
              </div>
              {editable ? (
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={index === 0 || moveMutation.isPending}
                    aria-label="Выше"
                    onClick={() => moveMutation.mutate({ id: product.id, direction: 'up' })}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={index >= products.length - 1 || moveMutation.isPending}
                    aria-label="Ниже"
                    onClick={() => moveMutation.mutate({ id: product.id, direction: 'down' })}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Редактировать"
                    onClick={() => {
                      setEditing(product)
                      setFormOpen(true)
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive size-7"
                    aria-label="Удалить"
                    onClick={() => setDeleting(product)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editable ? (
        <Modal
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open)
            if (!open) setEditing(null)
          }}
          title={editing ? 'Редактировать продукцию' : 'Новая продукция'}
          description="Укажите название и ссылку на страницу товара или услуги на сайте компании."
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Отмена
              </Button>
              <Button type="button" disabled={pending} onClick={() => void submit()}>
                {pending ? <Spinner size="sm" className="text-current" /> : null}
                {editing ? 'Сохранить' : 'Добавить'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <FormField label="Название" required error={errors.name}>
              <Input
                value={values.name}
                onChange={(event) => {
                  setValues((prev) => ({ ...prev, name: event.target.value }))
                  setErrors((prev) => {
                    const next = { ...prev }
                    delete next.name
                    return next
                  })
                }}
                placeholder="Например, Школьный светильник"
                autoFocus
              />
            </FormField>
            <FormField label="Ссылка" error={errors.url} description="Необязательно">
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
                placeholder="https://example.ru/product"
              />
            </FormField>
          </div>
        </Modal>
      ) : null}

      {editable ? (
        <DeleteDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          entityName={deleting?.name}
          title="Удалить продукцию?"
          description="Запись будет удалена из карточки компании и справочника."
          loading={deleteMutation.isPending}
          onConfirm={async () => {
            if (!deleting) return
            await deleteMutation.mutateAsync(deleting.id)
            setDeleting(null)
          }}
        />
      ) : null}
    </div>
  )
}
