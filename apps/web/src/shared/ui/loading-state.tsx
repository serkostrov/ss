import { cn } from '@shared/lib/utils'
import { Spinner } from './spinner'
import { Skeleton } from './skeleton'

type LoadingStateProps = {
  label?: string
  variant?: 'spinner' | 'skeleton' | 'table'
  rows?: number
  className?: string
}

function LoadingState({
  label = 'Загрузка…',
  variant = 'spinner',
  rows = 5,
  className,
}: LoadingStateProps) {
  if (variant === 'skeleton' || variant === 'table') {
    return (
      <div className={cn('space-y-3', className)} role="status" aria-label={label} aria-busy="true">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton
            key={index}
            className={variant === 'table' ? 'h-10 w-full' : 'h-4 w-full'}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="lg" label={label} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export { LoadingState }
export type { LoadingStateProps }
