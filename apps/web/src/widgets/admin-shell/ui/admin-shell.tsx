import { useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'

import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import {
  Button,
  ErrorState,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@shared/ui'

import { AdminSidebar } from './admin-sidebar'

type AdminShellProps = {
  children: ReactNode
}

export function AdminShell({ children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <CanAccess
      permission={permissions['admin.access']}
      fallback={
        <div className="flex min-h-full items-center justify-center p-6">
          <ErrorState
            title="Нет доступа"
            description="У вашей учётной записи нет прав для панели админа."
          />
        </div>
      }
    >
      <div className="flex min-h-svh bg-background">
        <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
          <AdminSidebar className="flex h-full flex-col" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main>
            <div className="max-w-full px-4 py-4 sm:px-6 sm:py-6">
              <div className="mb-3 flex justify-end lg:hidden">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Открыть меню"
                    >
                      <Menu className="size-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    className="w-[min(100%,18rem)] bg-sidebar p-0 text-sidebar-foreground"
                  >
                    <SheetHeader className="sr-only">
                      <SheetTitle>Навигация</SheetTitle>
                    </SheetHeader>
                    <AdminSidebar
                      className="flex h-full flex-col"
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
              </div>

              {children}
            </div>
          </main>
        </div>
      </div>
    </CanAccess>
  )
}
