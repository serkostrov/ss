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

  const applyFiles = (list: FileList | null) => {
    if (!list) return
    const next = Array.from(list).filter((file) => file.size <= maxSizeMb * 1024 * 1024)
    onChange(multiple ? [...value, ...next] : next.slice(0, 1))
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Label>{label}</Label>
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
          <FileUp className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm">
            Перетащите файл сюда или{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              выберите на диске
            </button>
          </p>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          <p className="text-xs text-muted-foreground">Макс. {maxSizeMb} МБ</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => applyFiles(event.target.files)}
        />
      </div>

      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((file) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={disabled}
                onClick={() => onChange(value.filter((item) => item !== file))}
                aria-label="Удалить файл"
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  )
}

export { UploadField }
export type { UploadFieldProps }
