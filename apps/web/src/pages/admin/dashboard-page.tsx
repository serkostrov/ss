import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { CanAccess } from '@features/auth/ui/can-access'
import { usePermissions } from '@features/auth/model/use-permissions'
import { adminNavItems } from '@widgets/admin-shell'
import { PageHeader } from '@shared/ui'

export function AdminDashboardPage() {
  const { can } = usePermissions()

  const sections = adminNavItems.filter(
    (item) => item.id !== 'dashboard' && can(item.permission),
  )

  return (
    <div className="space-y-8">
      <PageHeader title="Обзор" />

      <section>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((item) => {
            const Icon = item.icon
            return (
              <CanAccess key={item.id} permission={item.permission}>
                <Link
                  to={item.to}
                  className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
                      <Icon className="size-4" aria-hidden />
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </div>
                  <p className="mt-3 text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </Link>
              </CanAccess>
            )
          })}
        </div>
      </section>
    </div>
  )
}
