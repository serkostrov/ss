import { Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { useAuth } from '@app/providers'
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@shared/ui'

import { CabinetSidebar } from './cabinet-sidebar'

type CabinetShellProps = {
  children: ReactNode
}

export function CabinetShell({ children }: CabinetShellProps) {
  const { profile } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const showNav = profile?.status === 'confirmed'

  return (
    <div className="bg-background flex min-h-svh">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-64 shrink-0 border-r lg:block">
        <CabinetSidebar showNav={showNav} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 flex h-14 items-center border-b px-4 backdrop-blur lg:hidden">
          <span className="text-sm font-semibold">Личный кабинет</span>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="ml-auto shrink-0"
                aria-label="Открыть меню"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="border-sidebar-border bg-sidebar text-sidebar-foreground w-[min(88vw,18rem)] p-0"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Навигация личного кабинета</SheetTitle>
              </SheetHeader>
              <CabinetSidebar showNav={showNav} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="w-full flex-1 px-4 py-5 sm:px-6 sm:py-6 xl:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
