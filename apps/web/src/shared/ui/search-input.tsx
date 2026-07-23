import * as React from 'react'
import { Search, X } from 'lucide-react'

import { cn } from '@shared/lib/utils'
import { Button } from './button'
import { Input } from './input'

type SearchInputProps = Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> & {
  value: string
  onValueChange: (value: string) => void
  onSubmitSearch?: (value: string) => void
  clearable?: boolean
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onValueChange,
      onSubmitSearch,
      clearable = true,
      className,
      placeholder = 'Поиск…',
      ...props
    },
    ref,
  ) => {
    return (
      <div className={cn('relative', className)}>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          value={value}
          placeholder={placeholder}
          className="pr-9 pl-9"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onSubmitSearch?.(value)
            }
          }}
          {...props}
        />
        {clearable && value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0 h-9 w-9 text-muted-foreground"
            onClick={() => onValueChange('')}
            aria-label="Очистить поиск"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    )
  },
)
SearchInput.displayName = 'SearchInput'

export { SearchInput }
export type { SearchInputProps }
