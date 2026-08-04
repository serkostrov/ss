import * as React from 'react'
import { FileUp, X } from 'lucide-react'

import { cn } from '@shared/lib/utils'
import { Button } from './button'
import { Label } from './label'

type UploadFieldProps = {
  label?: string
  description?: string
  accept?: string
  multiple?: boolean
  disabled?: boolean
  value?: File[]
  onChange: (files: File[]) => void
  maxSizeMb?: number
  error?: string
  className?: string
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function UploadField({
  label = 'Файл',
  description,
  accept,
  multiple = false,
  disabled,
  value = [],
  onChange,
  maxSizeMb = 20,
  error,
  className,
}: UploadFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const hasFiles = value.length > 0

  const applyFiles = (list: FileList | null) => {
    if (!list) return
    const next = Array.from(list).filter((file) => file.size <= maxSizeMb * 1024 * 1024)
    onChange(multiple ? [...value, ...next] : next.slice(0, 1))
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Label>{label}</Label>

      {hasFiles ? (
        <div
          className={cn(
            'rounded-lg border border-dashed px-3 py-2.5 transition-colors',
            dragOver ? 'border-primary bg-accent/40' : 'border-input',
            disabled && 'opacity-50',
          )}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            if (!disabled) applyFiles(event.dataTransfer.files)
          }}
        >
          <ul className="space-y-2">
            {value.map((file) => (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileUp className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-muted-foreground text-xs">{formatBytes(file.size)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="text-primary text-xs font-medium underline-offset-4 hover:underline"
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                  >
                    {multiple ? 'Добавить' : 'Заменить'}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={disabled}
                    onClick={() => onChange(value.filter((item) => item !== file))}
                    aria-label="Удалить файл"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          className={cn(
            'rounded-lg border border-dashed p-6 transition-colors',
            dragOver ? 'border-primary bg-accent/40' : 'border-input',
            disabled && 'opacity-50',
          )}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            if (!disabled) applyFiles(event.dataTransfer.files)
          }}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <FileUp className="text-muted-foreground size-8" aria-hidden />
            <p className="text-sm">
              Перетащите файл сюда или{' '}
              <button
                type="button"
                className="text-primary font-medium underline-offset-4 hover:underline"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
              >
                выберите на диске
              </button>
            </p>
            {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
            <p className="text-muted-foreground text-xs">Макс. {maxSizeMb} МБ</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          applyFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {error ? <p className="text-destructive text-sm font-medium">{error}</p> : null}
    </div>
  )
}

export { UploadField }
export type { UploadFieldProps }
