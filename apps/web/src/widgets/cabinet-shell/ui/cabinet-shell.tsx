import { Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { useAuth } from '@app/providers'
import { isExitedCompany } from '@features/cabinet/model/company-access'
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@shared/ui'

import { CabinetSidebar } from './cabinet-sidebar'

type CabinetShellProps = {
  children: ReactNode
}

export function CabinetShell({ children }: CabinetShellProps) {
  const { profile } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const exited = isExitedCompany(profile)
  const showNav = profile?.status === 'confirmed' && !exited
  const companyOnly = exited

  return (
    <div className="bg-background flex min-h-svh">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r lg:flex">
        <CabinetSidebar
          showNav={showNav}
          companyOnly={companyOnly}
          className="flex h-full flex-col"
        />
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
                  className="bg-sidebar text-sidebar-foreground w-[min(100%,18rem)] p-0"
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Навигация</SheetTitle>
                  </SheetHeader>
                  <CabinetSidebar
                    showNav={showNav}
                    companyOnly={companyOnly}
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
  )
}
