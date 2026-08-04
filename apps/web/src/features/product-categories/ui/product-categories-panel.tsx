import { forwardRef, useImperativeHandle, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

import type { ProductCategory } from '@shared/api'
import {
  Button,
  DeleteDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  StatusBadge,
} from '@shared/ui'

import {
  useCreateProductCategoryMutation,
  useDeleteProductCategoryMutation,
  useProductCategories,
  useUpdateProductCategoryMutation,
} from '../model/use-product-categories'

export type ProductCategoriesPanelHandle = {
  openCreate: () => void
}

export const ProductCategoriesPanel = forwardRef<ProductCategoriesPanelHandle>(
  function ProductCategoriesPanel(_props, ref) {
    const query = useProductCategories()
    const createMutation = useCreateProductCategoryMutation()
    const updateMutation = useUpdateProductCategoryMutation()
    const deleteMutation = useDeleteProductCategoryMutation()
    const [editing, setEditing] = useState<ProductCategory | null>(null)
    const [deleting, setDeleting] = useState<ProductCategory | null>(null)
    const [formOpen, setFormOpen] = useState(false)
    const [name, setName] = useState('')
    const [error, setError] = useState('')

    const openCreate = () => {
      setEditing(null)
      setName('')
      setError('')
      setFormOpen(true)
    }

    useImperativeHandle(ref, () => ({ openCreate }))

    const openEdit = (category: ProductCategory) => {
      setEditing(category)
      setName(category.name)
      setError('')
      setFormOpen(true)
    }

    const submit = async () => {
      const cleanName = name.trim()
      if (cleanName.length < 2) {
        setError('Укажите название категории')
        return
      }
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, name: cleanName })
      } else {
        await createMutation.mutateAsync(cleanName)
      }
      setFormOpen(false)
    }

    const categories = query.data ?? []
    const pending = createMutation.isPending || updateMutation.isPending

    if (query.isLoading && !query.data) {
      return <LoadingState label="Загрузка категорий…" />
    }
    if (query.isError) {
      return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    }

    return (
      <div className="space-y-4">
        {categories.length === 0 ? (
          <EmptyState
            title="Категорий пока нет"
            description="Добавьте категории, доступные участникам при создании продукции."
          />
        ) : (
          <div className="divide-y rounded-lg border">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{category.name}</p>
                  <StatusBadge
                    status={category.is_active ? 'active' : 'archived'}
                    label={category.is_active ? 'Доступна' : 'Скрыта'}
                    className="mt-1"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate({
                      id: category.id,
                      isActive: !category.is_active,
                    })
                  }
                >
                  {category.is_active ? 'Скрыть' : 'Показать'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Редактировать"
                  onClick={() => openEdit(category)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  aria-label="Удалить"
                  onClick={() => setDeleting(category)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Modal
          open={formOpen}
          onOpenChange={setFormOpen}
          title={editing ? 'Редактировать категорию' : 'Новая категория продукции'}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Отмена
              </Button>
              <Button type="button" disabled={pending} onClick={() => void submit()}>
                Сохранить
              </Button>
            </>
          }
        >
          <FormField label="Название" required error={error}>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
              }}
              autoFocus
            />
          </FormField>
        </Modal>

        <DeleteDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          entityName={deleting?.name}
          title="Удалить категорию?"
          description="Категорию можно удалить, только если она не используется продукцией."
          loading={deleteMutation.isPending}
          onConfirm={async () => {
            if (!deleting) return
            await deleteMutation.mutateAsync(deleting.id)
            setDeleting(null)
          }}
        />
      </div>
    )
  },
)
