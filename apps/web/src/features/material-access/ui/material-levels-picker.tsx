import { Checkbox } from '@shared/ui'
import type { MaterialLevelRef } from '@shared/api'
import { cn } from '@shared/lib/utils'

type MaterialLevelsPickerProps = {
  levels: MaterialLevelRef[]
  value: string[]
  onChange: (levelIds: string[]) => void
  disabled?: boolean
  error?: string
  className?: string
  /** Show inactive levels (default true). */
  showInactive?: boolean
  emptyLabel?: string
}

export function MaterialLevelsPicker({
  levels,
  value,
  onChange,
  disabled,
  error,
  className,
  showInactive = true,
  emptyLabel = 'Нет уровней участия. Создайте их в разделе «Уровни».',
}: MaterialLevelsPickerProps) {
  const visible = showInactive ? levels : levels.filter((level) => level.is_active)
  const selected = new Set(value)

  const toggle = (levelId: string) => {
    const next = new Set(selected)
    if (next.has(levelId)) next.delete(levelId)
    else next.add(levelId)
    onChange([...next])
  }

  const selectAll = () => onChange(visible.map((level) => level.id))
  const clearAll = () => onChange([])

  if (!visible.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={disabled}
          onClick={selectAll}
        >
          Выбрать все
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={disabled || value.length === 0}
          onClick={clearAll}
        >
          Снять все
        </button>
        <span className="text-muted-foreground">
          Выбрано: {value.length} / {visible.length}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((level) => (
          <label
            key={level.id}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              selected.has(level.id) ? 'border-primary/40 bg-accent/30' : 'border-transparent',
              !level.is_active && 'opacity-70',
            )}
          >
            <Checkbox
              checked={selected.has(level.id)}
              disabled={disabled}
              onCheckedChange={() => toggle(level.id)}
            />
            <span>
              {level.name}
              {!level.is_active ? (
                <span className="text-muted-foreground"> (скрыт)</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  )
}
