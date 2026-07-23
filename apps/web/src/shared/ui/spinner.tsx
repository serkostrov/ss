import { Loader2 } from 'lucide-react'

import { cn } from '@shared/lib/utils'

type SpinnerProps = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const sizeClass = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
} as const

export function Spinner({ className, size = 'md', label = 'Загрузка' }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-muted-foreground', sizeClass[size], className)}
      aria-label={label}
      role="status"
    />
  )
}
