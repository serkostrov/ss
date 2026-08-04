import { forwardRef, useImperativeHandle, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

import type { ProductNote } from '@shared/api'
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
  useCreateProductNoteMutation,
  useDeleteProductNoteMutation,
  useProductNotes,
  useUpdateProductNoteMutation,
} from '../model/use-product-notes'

export type ProductNotesPanelHandle = {
  openCreate: () => void
}

export const ProductNotesPanel = forwardRef<ProductNotesPanelHandle>(function ProductNotesPanel(
  _props,
  ref,
) {
  const query = useProductNotes()
  const createMutation = useCreateProductNoteMutation()
  const updateMutation = useUpdateProductNoteMutation()
  const deleteMutation = useDeleteProductNoteMutation()
  const [editing, setEditing] = useState<ProductNote | null>(null)
  const [deleting, setDeleting] = useState<ProductNote | null>(null)
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

  const openEdit = (note: ProductNote) => {
    setEditing(note)
    setName(note.name)
    setError('')
    setFormOpen(true)
  }

  const submit = async () => {
    const cleanName = name.trim()
    if (cleanName.length < 2) {
      setError('Укажите примечание')
      return
    }
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, name: cleanName })
    } else {
      await createMutation.mutateAsync(cleanName)
    }
    setFormOpen(false)
  }

  const notes = query.data ?? []
  const pending = createMutation.isPending || updateMutation.isPending

  if (query.isLoading && !query.data) {
    return <LoadingState label="Загрузка примечаний…" />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <EmptyState
          title="Примечаний пока нет"
          description="Добавьте варианты примечаний для продукции (например, для школ или парков)."
        />
      ) : (
        <div className="divide-y rounded-lg border">
          {notes.map((note) => (
            <div key={note.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{note.name}</p>
                <StatusBadge
                  status={note.is_active ? 'active' : 'archived'}
                  label={note.is_active ? 'Доступно' : 'Скрыто'}
                  className="mt-1"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateMutation.mutate({ id: note.id, isActive: !note.is_active })
                }
              >
                {note.is_active ? 'Скрыть' : 'Показать'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Редактировать"
                onClick={() => openEdit(note)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Удалить"
                onClick={() => setDeleting(note)}
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
        title={editing ? 'Изменить примечание' : 'Новое примечание'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
            <Button type="button" disabled={pending} onClick={() => void submit()}>
              {editing ? 'Сохранить' : 'Добавить'}
            </Button>
          </>
        }
      >
        <FormField label="Примечание" required error={error}>
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
            placeholder="для общеобразовательных учреждений"
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
        title="Удалить примечание?"
        description="Удаление возможно, только если продукция не использует это примечание."
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!deleting) return
          await deleteMutation.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
})
