import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

import type { CompanyAccessStatusRecord } from '@shared/api'
import { Button, ErrorState, LoadingState, Modal, Spinner } from '@shared/ui'

import {
  applyExcludesFromProgramToResourceRows,
  defaultAccessStatusResourceRows,
  normalizeAccessStatusResourceRows,
  type AccessStatusResourceAccessRow,
} from '../model/status-resource-access'
import {
  useAccessStatusResourceAccess,
  useSaveAccessStatusResourceAccessMutation,
} from '../model/use-access-status-resource-access'
import { AccessStatusCapabilitiesEditor } from './access-status-capabilities-editor'

type AccessStatusCapabilitiesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: CompanyAccessStatusRecord | null
}

export function AccessStatusCapabilitiesDialog({
  open,
  onOpenChange,
  status,
}: AccessStatusCapabilitiesDialogProps) {
  const slug = status?.slug ?? null
  const query = useAccessStatusResourceAccess(open ? slug : null)
  const saveMutation = useSaveAccessStatusResourceAccessMutation(slug ?? '')
  const [rows, setRows] = useState<AccessStatusResourceAccessRow[]>(() =>
    defaultAccessStatusResourceRows(),
  )

  useEffect(() => {
    if (!open || !status) return
    setRows(
      normalizeAccessStatusResourceRows(query.data, {
        excludesFromProgram: status.excludes_from_program,
        isDefault: status.is_default,
      }),
    )
  }, [open, status, query.data])

  const submit = async () => {
    if (!slug || !status) return
    await saveMutation.mutateAsync({
      rows: applyExcludesFromProgramToResourceRows(rows, status.excludes_from_program),
    })
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Доступ в кабинете"
      description={
        status
          ? `Статус «${status.name}»: какие разделы видны в меню и где доступно содержимое.`
          : undefined
      }
      className="max-w-4xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || !slug || status?.excludes_from_program}
            onClick={() => void submit()}
          >
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

      {!query.isLoading && !query.isError && status ? (
        <div className="space-y-4">
          {status.excludes_from_program ? (
            <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
              Статус «вне программы» — кабинет полностью закрыт. Снимите флаг в карточке статуса,
              чтобы настроить доступ по разделам.
            </div>
          ) : (
            <>
              <div className="bg-muted/40 flex items-start gap-2 rounded-lg border p-3 text-sm">
                <ShieldCheck className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <p className="text-muted-foreground">
                  <span className="text-foreground font-medium">В меню</span> — раздел появляется в
                  навигации кабинета.{' '}
                  <span className="text-foreground font-medium">Данные</span> — доступ к содержимому
                  внутри раздела. Итоговый доступ также зависит от уровня участия компании.
                </p>
              </div>

              <AccessStatusCapabilitiesEditor
                rows={rows}
                disabled={saveMutation.isPending}
                onChange={setRows}
              />
            </>
          )}
        </div>
      ) : null}
    </Modal>
  )
}
