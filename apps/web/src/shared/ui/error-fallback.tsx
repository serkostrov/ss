import { AlertTriangle } from 'lucide-react'

import { APP_NAME } from '@shared/config'
import { Button } from './button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card'

type ErrorFallbackProps = {
  title?: string
  description?: string
  error?: Error | null
  onReset?: () => void
  resetLabel?: string
}

export function ErrorFallback({
  title = 'Что-то пошло не так',
  description = 'Произошла непредвиденная ошибка. Попробуйте обновить страницу.',
  error,
  onReset,
  resetLabel = 'Попробовать снова',
}: ErrorFallbackProps) {
  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {import.meta.env.DEV && error?.message ? (
            <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs text-muted-foreground">
              {error.message}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {onReset ? (
              <Button type="button" onClick={onReset}>
                {resetLabel}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => window.location.assign('/')}>
              На главную
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{APP_NAME}</p>
        </CardContent>
      </Card>
    </div>
  )
}
