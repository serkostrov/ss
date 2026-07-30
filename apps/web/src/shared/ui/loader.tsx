import { Spinner } from './spinner'

type FullPageLoaderProps = {
  label?: string
}

export function FullPageLoader({ label = 'Загрузка…' }: FullPageLoaderProps) {
  return (
    <div
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-3 px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="lg" label={label} />
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  )
}

export function InlineLoader({ label = 'Загрузка…' }: FullPageLoaderProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-10" role="status" aria-live="polite">
      <Spinner size="md" label={label} />
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
  )
}
