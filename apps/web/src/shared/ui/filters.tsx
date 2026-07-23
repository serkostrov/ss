import type { ReactNode } from 'react'

import { cn } from '@shared/lib/utils'
import { Label } from './label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import { SearchInput } from './search-input'
import { Button } from './button'

export type FilterOption = {
  label: string
  value: string
}

export type FilterFieldConfig = {
  id: string
  label: string
  type: 'select' | 'search'
  placeholder?: string
  options?: FilterOption[]
  value: string
  onChange: (value: string) => void
}

type FiltersProps = {
  fields: FilterFieldConfig[]
  onReset?: () => void
  resetLabel?: string
  actions?: ReactNode
  className?: string
}

function Filters({
  fields,
  onReset,
  resetLabel = 'Сбросить',
  actions,
  className,
}: FiltersProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {fields.map((field) => (
        <div key={field.id} className="grid w-full gap-1.5 sm:w-auto sm:min-w-[180px]">
          <Label htmlFor={field.id}>{field.label}</Label>
          {field.type === 'search' ? (
            <SearchInput
              id={field.id}
              value={field.value}
              onValueChange={field.onChange}
              placeholder={field.placeholder}
            />
          ) : (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id={field.id}>
                <SelectValue placeholder={field.placeholder ?? 'Все'} />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}

      <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
        {onReset ? (
          <Button type="button" variant="outline" onClick={onReset}>
            {resetLabel}
          </Button>
        ) : null}
        {actions}
      </div>
    </div>
  )
}

export { Filters }
export type { FiltersProps }
