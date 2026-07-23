import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'

import { companiesService, queryKeys, useSupabaseMutation } from '@shared/api'
import { downloadCompaniesImportTemplate, parseSpreadsheetFile } from '@shared/lib/xlsx'
import { notify } from '@shared/lib/notify'
import {
  Button,
  Modal,
  Spinner,
} from '@shared/ui'

import {
  mapSpreadsheetRowsToCompanyImport,
  type CompanyImportResult,
  type CompanyImportRow,
} from '../model/import-companies'

type CompanyImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CompanyImportDialog({ open, onOpenChange }: CompanyImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewCount, setPreviewCount] = useState(0)
  const [rows, setRows] = useState<CompanyImportRow[]>([])
  const [lastResult, setLastResult] = useState<CompanyImportResult | null>(null)

  const importMutation = useSupabaseMutation(
    async () => companiesService.importRows(rows as unknown as Array<Record<string, unknown>>),
    {
      ensureFreshSession: true,
      invalidateKeys: [queryKeys.companies.all],
      onSuccess: (result) => {
        setLastResult(result)
        notify.success(
          `Импорт: создано ${result.created}, обновлено ${result.updated}, пропущено ${result.skipped}`,
        )
      },
      onError: (error) => notify.fromError(error, 'Не удалось импортировать компании'),
    },
  )

  const reset = () => {
    setFileName(null)
    setPreviewCount(0)
    setRows([])
    setLastResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onFile = async (file: File | null) => {
    setLastResult(null)
    if (!file) {
      reset()
      return
    }
    try {
      const parsed = await parseSpreadsheetFile(file)
      const mapped = mapSpreadsheetRowsToCompanyImport(parsed.rows)
      setFileName(file.name)
      setRows(mapped)
      setPreviewCount(mapped.length)
      if (mapped.length === 0) {
        notify.error('В файле нет строк с названием компании')
      }
    } catch (error) {
      notify.fromError(error, 'Не удалось прочитать файл')
      reset()
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Импорт компаний из Excel"
      description="Загрузите таблицу от бухгалтера (.xlsx / .xls / .csv). По ИНН обновляем существующие, без ИНН — создаём новые. Статусы: active/активна, suspended/приостановлена, archived/вышедшие."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button
            type="button"
            disabled={rows.length === 0 || importMutation.isPending}
            onClick={() => void importMutation.mutateAsync()}
          >
            {importMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
            Импортировать ({rows.length})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCompaniesImportTemplate()}
          >
            <FileSpreadsheet className="size-4" />
            Скачать шаблон
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" />
            Выбрать файл
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          />
        </div>

        {fileName ? (
          <p className="text-sm text-muted-foreground">
            Файл: <span className="text-foreground">{fileName}</span> · строк к импорту:{' '}
            <span className="text-foreground">{previewCount}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Колонки: название, ИНН, статус, уровень участия, телефон, email, сайт, адрес, описание,
            заметки. Заголовки могут быть на русском.
          </p>
        )}

        {lastResult ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p>
              Создано: {lastResult.created}, обновлено: {lastResult.updated}, пропущено:{' '}
              {lastResult.skipped}
            </p>
            {lastResult.errors.length > 0 ? (
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-muted-foreground">
                {lastResult.errors.slice(0, 20).map((item, index) => (
                  <li key={`${item.row ?? index}-${item.error ?? 'err'}`}>
                    Строка {item.row ?? '?'}: {item.message || item.error || 'ошибка'}
                    {item.inn ? ` (ИНН ${item.inn})` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
