import { Building2, LayoutDashboard } from 'lucide-react'
import { Link } from 'react-router-dom'

import { routes } from '@shared/config'
import { cn } from '@shared/lib/utils'
import { Separator } from '@shared/ui'

import { CabinetNav } from './cabinet-nav'
import { CabinetNotificationsNav } from './cabinet-notifications-nav'
import { CabinetUserMenu } from './cabinet-user-menu'

type CabinetSidebarProps = {
  showNav: boolean
  /** Exited («Вышедшая») company — only company card is available. */
  companyOnly?: boolean
  onNavigate?: () => void
  className?: string
}

export function CabinetSidebar({
  showNav,
  companyOnly = false,
  onNavigate,
  className,
}: CabinetSidebarProps) {
  const homeTo = companyOnly ? `${routes.cabinet.account}?tab=company` : routes.cabinet.root

  return (
    <div className={cn(className)}>
      <div className="px-4 py-5">
        <Link to={homeTo} onClick={onNavigate} className="block focus-visible:outline-none">
          <p className="text-sidebar-foreground mt-1 font-semibold">АПСС(ЭР)</p>
          <p className="text-sidebar-foreground/55 mt-0.5 text-xs">Личный кабинет</p>
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      <div className="flex-1 overflow-y-auto p-3">
        {showNav ? (
          <CabinetNav onNavigate={onNavigate} />
        ) : companyOnly ? (
          <div className="space-y-2">
            <Link
              to={`${routes.cabinet.account}?tab=company`}
              onClick={onNavigate}
              className="bg-sidebar-accent text-sidebar-accent-foreground flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium"
            >
              <Building2 className="size-4 shrink-0" aria-hidden />
              Компания
            </Link>
            <p className="text-sidebar-foreground/65 px-1 text-xs leading-relaxed">
              Компания вышла из ассоциации. Доступен только просмотр карточки компании.
            </p>
          </div>
        ) : (
          <div className="border-sidebar-border bg-sidebar-accent/30 rounded-md border p-3">
            <LayoutDashboard className="text-sidebar-foreground/60 mb-2 size-4" aria-hidden />
            <p className="text-sidebar-foreground/65 text-xs leading-relaxed">
              Разделы кабинета станут доступны после подтверждения учётной записи.
            </p>
          </div>
        )}
      </div>

      <Separator className="bg-sidebar-border" />
      <div className="space-y-0.5 p-3">
        {showNav ? <CabinetNotificationsNav onNavigate={onNavigate} /> : null}
        <CabinetUserMenu onNavigate={onNavigate} companyOnly={companyOnly} />
      </div>
    </div>
  )
}
