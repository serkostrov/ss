import { Eye, FileText } from 'lucide-react'

import { cabinetResourceLabel } from '@features/levels'
import { cn } from '@shared/lib/utils'
import { Button, Switch } from '@shared/ui'

import type { AccessStatusResourceAccessRow } from '../model/status-resource-access'
import { ACCESS_STATUS_RESOURCES } from '../model/status-resource-access'

type AccessStatusCapabilitiesEditorProps = {
  rows: AccessStatusResourceAccessRow[]
  disabled?: boolean
  onChange: (rows: AccessStatusResourceAccessRow[]) => void
}

function patchRows(
  rows: AccessStatusResourceAccessRow[],
  resource: AccessStatusResourceAccessRow['resource'],
  patch: Partial<Pick<AccessStatusResourceAccessRow, 'allowsVisibility' | 'allowsContent'>>,
): AccessStatusResourceAccessRow[] {
  return rows.map((row) => {
    if (row.resource !== resource) return row
    const allowsVisibility = patch.allowsVisibility ?? row.allowsVisibility
    const allowsContent =
      patch.allowsContent ?? (patch.allowsVisibility === false ? false : row.allowsContent)
    return {
      ...row,
      ...patch,
      allowsVisibility,
      allowsContent: allowsVisibility ? allowsContent : false,
    }
  })
}

function setAll(
  rows: AccessStatusResourceAccessRow[],
  field: 'allowsVisibility' | 'allowsContent',
  value: boolean,
): AccessStatusResourceAccessRow[] {
  return rows.map((row) => {
    if (field === 'allowsVisibility') {
      return {
        ...row,
        allowsVisibility: value,
        allowsContent: value ? row.allowsContent : false,
      }
    }
    return {
      ...row,
      allowsContent: row.allowsVisibility ? value : false,
    }
  })
}

export function AccessStatusCapabilitiesEditor({
  rows,
  disabled,
  onChange,
}: AccessStatusCapabilitiesEditorProps) {
  const patchRow = (
    resource: AccessStatusResourceAccessRow['resource'],
    patch: Partial<Pick<AccessStatusResourceAccessRow, 'allowsVisibility' | 'allowsContent'>>,
  ) => {
    onChange(patchRows(rows, resource, patch))
  }

  const allVisible = rows.every((row) => row.allowsVisibility)
  const allContent = rows.every((row) => row.allowsContent)
  const someVisible = rows.some((row) => row.allowsVisibility)
  const someContent = rows.some((row) => row.allowsContent)

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/50 grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-end gap-x-3 border-b px-4 py-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Раздел кабинета
        </p>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium">
            <Eye className="size-3.5" />
            В меню
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-6 px-2 text-[11px]"
            disabled={disabled}
            onClick={() => onChange(setAll(rows, 'allowsVisibility', !allVisible))}
          >
            {allVisible ? 'Снять все' : someVisible ? 'Все' : 'Включить все'}
          </Button>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium">
            <FileText className="size-3.5" />
            Данные
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-6 px-2 text-[11px]"
            disabled={disabled || !someVisible}
            onClick={() => onChange(setAll(rows, 'allowsContent', !allContent))}
          >
            {allContent ? 'Снять все' : someContent ? 'Все' : 'Включить все'}
          </Button>
        </div>
      </div>

      <ul className="divide-y">
        {ACCESS_STATUS_RESOURCES.map((resource) => {
          const row = rows.find((item) => item.resource === resource)
          if (!row) return null

          const active = row.allowsVisibility && row.allowsContent
          const visibleOnly = row.allowsVisibility && !row.allowsContent

          return (
            <li
              key={resource}
              className={cn(
                'grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-center gap-x-3 px-4 py-3 transition-colors',
                active && 'bg-primary/5',
                visibleOnly && 'bg-muted/20',
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{cabinetResourceLabel(resource)}</p>
                <p className="text-muted-foreground text-xs">
                  {!row.allowsVisibility
                    ? 'Раздел скрыт'
                    : row.allowsContent
                      ? 'Полный доступ'
                      : 'Только пункт меню'}
                </p>
              </div>

              <div className="flex justify-center">
                <Switch
                  checked={row.allowsVisibility}
                  disabled={disabled}
                  aria-label={`${cabinetResourceLabel(resource)}: показывать в меню`}
                  onCheckedChange={(checked) => patchRow(resource, { allowsVisibility: checked })}
                />
              </div>

              <div className="flex justify-center">
                <Switch
                  checked={row.allowsContent}
                  disabled={disabled || !row.allowsVisibility}
                  aria-label={`${cabinetResourceLabel(resource)}: доступ к содержимому`}
                  onCheckedChange={(checked) => patchRow(resource, { allowsContent: checked })}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
