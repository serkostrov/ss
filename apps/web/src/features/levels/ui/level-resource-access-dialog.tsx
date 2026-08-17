import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

import type { ParticipationLevel } from '@shared/api'
import type { CompanyAccessStatus } from '@shared/api'
import {
  Button,
  Checkbox,
  ErrorState,
  LoadingState,
  Modal,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shared/ui'

import {
  CABINET_RESOURCES,
  buildAccessStatusDefaults,
  cabinetResourceLabel,
  defaultLevelResourceAccessRows,
  normalizeLevelResourceAccessRows,
  toggleStatus,
  type LevelResourceAccessRow,
} from '../model/resource-access'
import { useCompanyAccessStatuses } from '@features/access-statuses'
import {
  useLevelResourceAccess,
  useSaveLevelResourceAccessMutation,
} from '../model/use-level-resource-access'

type LevelResourceAccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  level: ParticipationLevel | null
}

function StatusCheckboxes({
  selected,
  onChange,
  disabled,
  options,
  emptyLabel = 'Никому на этом уровне',
}: {
  selected: CompanyAccessStatus[]
  onChange: (next: CompanyAccessStatus[]) => void
  disabled?: boolean
  options: Array<{ slug: string; name: string }>
  emptyLabel?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((status) => (
          <label key={status.slug} className="inline-flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={selected.includes(status.slug)}
              disabled={disabled}
              onCheckedChange={() => onChange(toggleStatus(selected, status.slug))}
            />
            {status.name}
          </label>
        ))}
      </div>
      {selected.length === 0 ? (
        <p className="text-muted-foreground text-xs italic">{emptyLabel}</p>
      ) : null}
    </div>
  )
}

export function LevelResourceAccessDialog({
  open,
  onOpenChange,
  level,
}: LevelResourceAccessDialogProps) {
  const levelId = level?.id ?? null
  const query = useLevelResourceAccess(open ? levelId : null)
  const statusesQuery = useCompanyAccessStatuses(false)
  const saveMutation = useSaveLevelResourceAccessMutation(levelId ?? '')
  const statusOptions = (statusesQuery.data ?? []).filter((item) => item.is_active)
  const statusDefaults = useMemo(() => buildAccessStatusDefaults(statusOptions), [statusOptions])
  const [rows, setRows] = useState<LevelResourceAccessRow[]>(() =>
    defaultLevelResourceAccessRows(statusDefaults),
  )

  useEffect(() => {
    if (!open) return
    setRows(normalizeLevelResourceAccessRows(query.data, statusDefaults))
  }, [open, query.data, statusDefaults])

  const patchRow = (
    resource: LevelResourceAccessRow['resource'],
    patch: Partial<Pick<LevelResourceAccessRow, 'visibility_statuses' | 'content_statuses'>>,
  ) => {
    setRows((current) =>
      current.map((row) => (row.resource === resource ? { ...row, ...patch } : row)),
    )
  }

  const submit = async () => {
    if (!levelId) return
    await saveMutation.mutateAsync(rows)
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Доступ к ресурсам кабинета"
      description={
        level
          ? `Уровень «${level.name}»: при каком статусе компании виден раздел и доступно содержимое.`
          : undefined
      }
      className="max-w-4xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={saveMutation.isPending || !levelId} onClick={() => void submit()}>
            {saveMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Сохранить
          </Button>
        </>
      }
    >
      {query.isLoading ? <LoadingState label="Загрузка настроек…" /> : null}
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
      ) : null}

      {!query.isLoading && !query.isError ? (
        <div className="space-y-4">
          <div className="bg-muted/40 flex items-start gap-2 rounded-md border p-3 text-sm">
            <ShieldCheck className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <p className="text-muted-foreground">
              <span className="text-foreground font-medium">Видимость</span> — раздел показывается в
              меню кабинета.{' '}
              <span className="text-foreground font-medium">Содержание</span> — доступ к данным внутри
              раздела. Можно снять все галочки в «Содержание», чтобы на этом уровне разделы были видны,
              но данные недоступны ни при одном статусе компании. Итоговый доступ также зависит от
              настроек статуса компании.
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[10rem]">Ресурс</TableHead>
                  <TableHead>Видимость (статус компании)</TableHead>
                  <TableHead>Содержание (статус компании)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CABINET_RESOURCES.map((resource) => {
                  const row = rows.find((item) => item.resource === resource)
                  if (!row) return null
                  return (
                    <TableRow key={resource}>
                      <TableCell className="align-top font-medium">
                        {cabinetResourceLabel(resource)}
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusCheckboxes
                          selected={row.visibility_statuses}
                          disabled={saveMutation.isPending}
                          options={statusOptions}
                          onChange={(visibility_statuses) =>
                            patchRow(resource, { visibility_statuses })
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusCheckboxes
                          selected={row.content_statuses}
                          disabled={saveMutation.isPending}
                          options={statusOptions}
                          onChange={(content_statuses) => patchRow(resource, { content_statuses })}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
