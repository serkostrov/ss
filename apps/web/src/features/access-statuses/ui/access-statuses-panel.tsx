import { forwardRef, useImperativeHandle, useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, ShieldCheck, Trash2 } from 'lucide-react'

import { cabinetResourceLabel } from '@features/levels'
import type { CompanyAccessStatusRecord } from '@shared/api'
import {
  Button,
  DeleteDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '@shared/ui'

import {
  applyExcludesFromProgramToResourceRows,
  formatAccessStatusCapabilitiesSummary,
  normalizeAccessStatusResourceRows,
} from '../model/status-resource-access'
import { useAllAccessStatusResourceAccess } from '../model/use-access-status-resource-access'
import {
  useCompanyAccessStatusUsage,
  useDeleteCompanyAccessStatusMutation,
  useMoveCompanyAccessStatusMutation,
  useCompanyAccessStatuses,
} from '../model/use-company-access-statuses'
import { AccessStatusCapabilitiesDialog } from './access-status-capabilities-dialog'
import { AccessStatusFormDialog } from './access-status-form-dialog'

export type AccessStatusesPanelHandle = {
  openCreate: () => void
}

type AccessStatusesPanelProps = {
  embedded?: boolean
}

export const AccessStatusesPanel = forwardRef<AccessStatusesPanelHandle, AccessStatusesPanelProps>(
  function AccessStatusesPanel({ embedded = false }, ref) {
    const query = useCompanyAccessStatuses(true)
    const capabilitiesQuery = useAllAccessStatusResourceAccess()
    const deleteMutation = useDeleteCompanyAccessStatusMutation()
    const moveMutation = useMoveCompanyAccessStatusMutation()

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<CompanyAccessStatusRecord | null>(null)
    const [capabilitiesStatus, setCapabilitiesStatus] = useState<CompanyAccessStatusRecord | null>(
      null,
    )
    const [deleting, setDeleting] = useState<CompanyAccessStatusRecord | null>(null)

    const usageQuery = useCompanyAccessStatusUsage(deleting?.slug ?? null)

    const openCreate = () => {
      setEditing(null)
      setFormOpen(true)
    }

    useImperativeHandle(ref, () => ({ openCreate }))

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

    const statuses = query.data ?? []
    const capabilitiesBySlug = capabilitiesQuery.data ?? {}

    if ((query.isLoading && !query.data) || (capabilitiesQuery.isLoading && !capabilitiesQuery.data)) {
      return <LoadingState label="Загрузка статусов…" />
    }

    if (query.isError) {
      return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    }

    return (
      <div className="space-y-4">
        {embedded ? null : (
          <p className="text-muted-foreground text-sm">
            Для каждого статуса задайте, какие разделы кабинета компания видит и где доступно
            содержимое (иконка щита). Уровень участия может дополнительно сужать доступ.
          </p>
        )}

        {statuses.length === 0 ? (
          <EmptyState
            title="Статусов пока нет"
            description="Добавьте первый статус доступа для компаний."
          />
        ) : (
          <div className="divide-y rounded-lg border bg-background">
            {statuses.map((item, index) => {
              const capabilityRows = applyExcludesFromProgramToResourceRows(
                normalizeAccessStatusResourceRows(capabilitiesBySlug[item.slug], {
                  excludesFromProgram: item.excludes_from_program,
                  isDefault: item.is_default,
                }),
                item.excludes_from_program,
              )
              const summary = formatAccessStatusCapabilitiesSummary(
                capabilityRows,
                cabinetResourceLabel,
              )

              return (
                <div key={item.slug} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.name}</p>
                      {item.is_default ? (
                        <StatusBadge status="active" label="По умолчанию" />
                      ) : null}
                      {!item.is_active ? (
                        <StatusBadge status="archived" label="Скрыт" />
                      ) : null}
                      {item.excludes_from_program ? (
                        <StatusBadge status="blocked" label="Вне программы" />
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">{summary}</p>
                    {item.description ? (
                      <p className="text-muted-foreground mt-1 text-xs">{item.description}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Доступ в кабинете"
                      onClick={() => setCapabilitiesStatus(item)}
                    >
                      <ShieldCheck className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Выше"
                      disabled={index === 0 || moveMutation.isPending}
                      onClick={() => void move(item.slug, 'up')}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Ниже"
                      disabled={index === statuses.length - 1 || moveMutation.isPending}
                      onClick={() => void move(item.slug, 'down')}
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
                        setEditing(item)
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
                      disabled={item.is_system}
                      title={item.is_system ? 'Системный статус нельзя удалить' : undefined}
                      onClick={() => setDeleting(item)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <AccessStatusFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open)
            if (!open) setEditing(null)
          }}
          status={editing}
        />

        <AccessStatusCapabilitiesDialog
          open={Boolean(capabilitiesStatus)}
          onOpenChange={(open) => {
            if (!open) setCapabilitiesStatus(null)
          }}
          status={capabilitiesStatus}
        />

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
