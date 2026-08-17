import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'

import type { CompanyAccessStatusRecord } from '@shared/api'
import {
  Button,
  Checkbox,
  DeleteDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Spinner,
  StatusBadge,
  Textarea,
} from '@shared/ui'

import {
  accessStatusFormSchema,
  suggestAccessStatusSlug,
  type AccessStatusFormValues,
} from '../model/schemas'
import {
  useCompanyAccessStatusUsage,
  useCreateCompanyAccessStatusMutation,
  useDeleteCompanyAccessStatusMutation,
  useMoveCompanyAccessStatusMutation,
  useUpdateCompanyAccessStatusMutation,
  useCompanyAccessStatuses,
} from '../model/use-company-access-statuses'

export type AccessStatusesPanelHandle = {
  openCreate: () => void
}

function toFormValues(item?: CompanyAccessStatusRecord | null): AccessStatusFormValues {
  return {
    slug: item?.slug ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    excludesFromProgram: item?.excludes_from_program ?? false,
    isActive: item?.is_active ?? true,
  }
}

export const AccessStatusesPanel = forwardRef<AccessStatusesPanelHandle>(
  function AccessStatusesPanel(_props, ref) {
    const query = useCompanyAccessStatuses(true)
    const createMutation = useCreateCompanyAccessStatusMutation()
    const updateMutation = useUpdateCompanyAccessStatusMutation()
    const deleteMutation = useDeleteCompanyAccessStatusMutation()
    const moveMutation = useMoveCompanyAccessStatusMutation()

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<CompanyAccessStatusRecord | null>(null)
    const [deleting, setDeleting] = useState<CompanyAccessStatusRecord | null>(null)
    const [values, setValues] = useState<AccessStatusFormValues>(() => toFormValues())
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [slugTouched, setSlugTouched] = useState(false)

    const usageQuery = useCompanyAccessStatusUsage(deleting?.slug ?? null)

    const openCreate = () => {
      setEditing(null)
      setValues(toFormValues())
      setErrors({})
      setSlugTouched(false)
      setFormOpen(true)
    }

    useImperativeHandle(ref, () => ({ openCreate }))

    const openEdit = (item: CompanyAccessStatusRecord) => {
      setEditing(item)
      setValues(toFormValues(item))
      setErrors({})
      setSlugTouched(true)
      setFormOpen(true)
    }

    useEffect(() => {
      if (!formOpen || editing || slugTouched) return
      const suggested = suggestAccessStatusSlug(values.name)
      if (suggested) {
        setValues((prev) => ({ ...prev, slug: suggested }))
      }
    }, [formOpen, editing, slugTouched, values.name])

    const patch = <K extends keyof AccessStatusFormValues>(
      key: K,
      value: AccessStatusFormValues[K],
    ) => {
      setValues((prev) => ({ ...prev, [key]: value }))
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }

    const submit = async () => {
      const parsed = accessStatusFormSchema.safeParse(values)
      if (!parsed.success) {
        const next: Record<string, string> = {}
        for (const issue of parsed.error.issues) {
          const key = issue.path[0]
          if (typeof key === 'string' && !next[key]) next[key] = issue.message
        }
        setErrors(next)
        return
      }

      if (editing) {
        await updateMutation.mutateAsync({
          slug: editing.slug,
          values: {
            name: parsed.data.name,
            description: parsed.data.description || null,
            excludesFromProgram: parsed.data.excludesFromProgram,
            isActive: parsed.data.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          slug: parsed.data.slug,
          name: parsed.data.name,
          description: parsed.data.description || null,
          excludesFromProgram: parsed.data.excludesFromProgram,
          isActive: parsed.data.isActive,
        })
      }

      setFormOpen(false)
    }

    const move = async (slug: string, direction: 'up' | 'down') => {
      const rows = query.data ?? []
      const index = rows.findIndex((item) => item.slug === slug)
      if (index < 0) return
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= rows.length) return
      const next = [...rows]
      ;[next[index], next[target]] = [next[target], next[index]]
      await moveMutation.mutateAsync(next.map((item) => item.slug))
    }

    const pending =
      createMutation.isPending || updateMutation.isPending || moveMutation.isPending
    const statuses = query.data ?? []

    if (query.isLoading && !query.data) {
      return <LoadingState label="Загрузка статусов…" />
    }

    if (query.isError) {
      return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    }

    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Статусы компании используются в карточке участника и в настройках доступа к ресурсам
          кабинета по уровням участия (видимость раздела и доступ к содержимому).
        </p>

        {statuses.length === 0 ? (
          <EmptyState
            title="Статусов пока нет"
            description="Добавьте первый статус доступа для компаний."
          />
        ) : (
          <div className="divide-y rounded-lg border">
            {statuses.map((item, index) => (
              <div key={item.slug} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.name}</p>
                    <code className="text-muted-foreground text-xs">{item.slug}</code>
                    {item.is_default ? (
                      <StatusBadge status="active" label="По умолчанию" />
                    ) : null}
                    {!item.is_active ? (
                      <StatusBadge status="archived" label="Скрыт" />
                    ) : null}
                    {item.excludes_from_program ? (
                      <StatusBadge status="blocked" label="Вне программы" />
                    ) : null}
                    {item.is_system ? (
                      <StatusBadge status="pending" label="Системный" />
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="text-muted-foreground mt-1 text-sm">{item.description}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Выше"
                    disabled={index === 0 || moveMutation.isPending}
                    onClick={() => void move(item.slug, 'up')}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Ниже"
                    disabled={index === statuses.length - 1 || moveMutation.isPending}
                    onClick={() => void move(item.slug, 'down')}
                  >
                    <ArrowDown className="size-4" />
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
                    disabled={item.is_system}
                    title={item.is_system ? 'Системный статус нельзя удалить' : undefined}
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Modal
          open={formOpen}
          onOpenChange={setFormOpen}
          title={editing ? 'Редактировать статус' : 'Новый статус доступа'}
          description="Код статуса используется в системе и не меняется после создания."
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
          <div className="space-y-3">
            <FormField label="Название" required error={errors.name}>
              <Input
                value={values.name}
                onChange={(event) => patch('name', event.target.value)}
                placeholder="Например, На паузе"
                autoFocus
              />
            </FormField>

            <FormField
              label="Код"
              required
              description="Латиница, цифры и _ — для импорта и API"
              error={errors.slug}
            >
              <Input
                value={values.slug}
                disabled={Boolean(editing)}
                onChange={(event) => {
                  setSlugTouched(true)
                  patch('slug', event.target.value.toLowerCase())
                }}
                placeholder="on_pause"
              />
            </FormField>

            <FormField label="Описание" error={errors.description}>
              <Textarea
                value={values.description}
                onChange={(event) => patch('description', event.target.value)}
                placeholder="Когда применять этот статус"
                rows={3}
              />
            </FormField>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.excludesFromProgram}
                onCheckedChange={(checked) => patch('excludesFromProgram', checked === true)}
              />
              Компания вне программы (как «Вышедшая»)
            </label>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.isActive}
                onCheckedChange={(checked) => patch('isActive', checked === true)}
              />
              Доступен для выбора
            </label>
          </div>
        </Modal>

        <DeleteDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Удалить статус?"
          description={
            deleting
              ? `«${deleting.name}» будет удалён.${
                  usageQuery.data?.companies
                    ? ` Сейчас используется в ${usageQuery.data.companies} компаниях — удаление невозможно.`
                    : ''
                }`
              : undefined
          }
          loading={deleteMutation.isPending}
          onConfirm={async () => {
            if (!deleting) return
            await deleteMutation.mutateAsync(deleting.slug)
            setDeleting(null)
          }}
        />
      </div>
    )
  },
)
