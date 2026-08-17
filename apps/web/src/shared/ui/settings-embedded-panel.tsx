import type { ReactNode } from 'react'

type SettingsEmbeddedPanelProps = {
  filters?: ReactNode
  children: ReactNode
}

/** Единая оболочка списка внутри карточки раздела настроек. */
export function SettingsEmbeddedPanel({ filters, children }: SettingsEmbeddedPanelProps) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      {filters}
      {children}
    </div>
  )
}

export const settingsEmbeddedFiltersClassName =
  'rounded-none border-0 border-b bg-muted/20 shadow-none'

export const settingsEmbeddedTableClassName =
  '[&>div:first-child]:rounded-none [&>div:first-child]:border-0'
