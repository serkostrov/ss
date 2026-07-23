import { Spinner } from './spinner'

type FullPageLoaderProps = {
  label?: string
}

export function FullPageLoader({ label = 'Загрузка…' }: FullPageLoaderProps) {
  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="lg" label={label} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export function InlineLoader({ label = 'Загрузка…' }: FullPageLoaderProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-10" role="status" aria-live="polite">
      <Spinner size="md" label={label} />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
