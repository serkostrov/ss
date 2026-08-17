import type { ReactNode } from 'react'

import { cn } from '@shared/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@shared/ui'

export type SettingsSubTab = {
  id: string
  label: string
}

type SettingsSectionShellProps = {
  tabLabel: string
  description: string
  subTabs?: SettingsSubTab[]
  activeTab?: string
  onTabChange?: (tabId: string) => void
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function SettingsSectionShell({
  tabLabel,
  description,
  subTabs,
  activeTab,
  onTabChange,
  actions,
  children,
  className,
}: SettingsSectionShellProps) {
  const hasSubTabs = Boolean(subTabs?.length && activeTab && onTabChange)

  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', className)}>
      <header className="border-b bg-muted/25 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">{tabLabel}</h2>
            <p className="text-muted-foreground max-w-3xl text-sm">{description}</p>
          </div>
          {!hasSubTabs && actions ? <div className="shrink-0">{actions}</div> : null}
        </div>

        {hasSubTabs ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={activeTab} onValueChange={onTabChange}>
              <TabsList className="h-9 w-auto">
                {subTabs!.map((item) => (
                  <TabsTrigger key={item.id} value={item.id} className="px-3">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
        ) : null}
      </header>

      <div className="p-5">{children}</div>
    </section>
  )
}
