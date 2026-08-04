import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

import type { Okpd2Code } from '@shared/api'
import {
  Button,
  DeleteDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
} from '@shared/ui'

import {
  useCreateOkpd2CodeMutation,
  useDeleteOkpd2CodeMutation,
  useOkpd2Codes,
  useUpdateOkpd2CodeMutation,
} from '../model/use-okpd2-codes'

export type Okpd2CodesPanelHandle = {
  openCreate: () => void
}

function indentForLevel(level: number): number {
  return Math.max(0, level - 3) * 12
}

export const Okpd2CodesPanel = forwardRef<Okpd2CodesPanelHandle>(function Okpd2CodesPanel(
  _props,
  ref,
) {
  const query = useOkpd2Codes()
  const createMutation = useCreateOkpd2CodeMutation()
  const updateMutation = useUpdateOkpd2CodeMutation()
  const deleteMutation = useDeleteOkpd2CodeMutation()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Okpd2Code | null>(null)
  const [deleting, setDeleting] = useState<Okpd2Code | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [parentId, setParentId] = useState('none')
  const [error, setError] = useState('')

  const openCreate = () => {
    setEditing(null)
    setCode('')
    setTitle('')
    setParentId('none')
    setError('')
    setFormOpen(true)
  }

  useImperativeHandle(ref, () => ({ openCreate }))

  const openEdit = (item: Okpd2Code) => {
    setEditing(item)
    setCode(item.code)
    setTitle(item.title)
    setParentId(item.parent_id ?? 'none')
    setError('')
    setFormOpen(true)
  }

  const codes = query.data ?? []
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return codes
    return codes.filter((item) => {
      const haystack = `${item.code} ${item.title}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [codes, search])

  const submit = async () => {
    const cleanCode = code.trim()
    const cleanTitle = title.trim()
    if (!cleanCode) {
      setError('Укажите код ОКПД 2')
      return
    }
    if (cleanTitle.length < 2) {
      setError('Укажите расшифровку')
      return
    }
    if (editing) {
      await updateMutation.mutateAsync({
        id: editing.id,
        code: cleanCode,
        title: cleanTitle,
      })
    } else {
      await createMutation.mutateAsync({
        code: cleanCode,
        title: cleanTitle,
        parentId: parentId === 'none' ? null : parentId,
      })
    }
    setFormOpen(false)
  }

  const pending = createMutation.isPending || updateMutation.isPending

  if (query.isLoading && !query.data) {
    return <LoadingState label="Загрузка классификатора ОКПД 2…" />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Поиск по коду или расшифровке…"
        aria-label="Поиск ОКПД 2"
        className="max-w-md"
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={codes.length === 0 ? 'Классификатор пуст' : 'Ничего не найдено'}
          description={
            codes.length === 0
              ? 'Добавьте коды ОКПД 2 — они будут доступны при создании продукции.'
              : 'Измените поисковый запрос.'
          }
        />
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1" style={{ paddingLeft: indentForLevel(item.level) }}>
                <p className="font-mono text-sm font-medium">{item.code}</p>
                <p className="text-sm text-muted-foreground">{item.title}</p>
                <StatusBadge
                  status={item.is_active ? 'active' : 'archived'}
                  label={item.is_active ? 'Доступен' : 'Скрыт'}
                  className="mt-1"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateMutation.mutate({ id: item.id, isActive: !item.is_active })
                }
              >
                {item.is_active ? 'Скрыть' : 'Показать'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Редактировать"
                onClick={() => openEdit(item)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Удалить"
                onClick={() => setDeleting(item)}
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
        title={editing ? 'Изменить код ОКПД 2' : 'Новый код ОКПД 2'}
        description="Код и расшифровка связаны: расшифровка подставляется по выбранному коду."
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
        <div className="space-y-4">
          <FormField label="Код ОКПД 2" required error={error}>
            <Input
              value={code}
              onChange={(event) => {
                setCode(event.target.value)
                setError('')
              }}
              placeholder="27.40.15.150"
              className="font-mono"
              autoFocus
            />
          </FormField>
          <FormField label="Расшифровка" required>
            <Textarea
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                setError('')
              }}
              placeholder="Официальное наименование по классификатору"
              rows={3}
            />
          </FormField>
          {!editing ? (
            <FormField label="Родительский код" description="Необязательно — определится по коду.">
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Автоматически" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Автоматически</SelectItem>
                  {codes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.code} — {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}
        </div>
      </Modal>

      <DeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        entityName={deleting ? `${deleting.code} — ${deleting.title}` : undefined}
        title="Удалить код ОКПД 2?"
        description="Удаление возможно, только если нет дочерних кодов и продукция не использует этот код."
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
