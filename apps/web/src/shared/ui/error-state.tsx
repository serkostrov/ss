import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

import { getErrorMessage } from '@shared/lib/errors'
import { cn } from '@shared/lib/utils'
import { Button } from './button'
import { Alert, AlertDescription, AlertTitle } from './alert'

type ErrorStateProps = {
  title?: string
  error?: unknown
  description?: string
  onRetry?: () => void
  retryLabel?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}

function ErrorState({
  title = 'Не удалось загрузить данные',
  error,
  description,
  onRetry,
  retryLabel = 'Повторить',
  action,
  className,
  compact = false,
}: ErrorStateProps) {
  const message = description ?? (error != null ? getErrorMessage(error) : undefined)

  if (compact) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTriangle className="size-4" />
        <AlertTitle>{title}</AlertTitle>
        {message ? <AlertDescription>{message}</AlertDescription> : null}
        {onRetry || action ? (
          <div className="mt-3 flex gap-2">
            {onRetry ? (
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                {retryLabel}
              </Button>
            ) : null}
            {action}
          </div>
        ) : null}
      </Alert>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-12 text-center',
        className,
      )}
      role="alert"
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {message ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p> : null}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <Button type="button" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  )
}

export { ErrorState }
export type { ErrorStateProps }
