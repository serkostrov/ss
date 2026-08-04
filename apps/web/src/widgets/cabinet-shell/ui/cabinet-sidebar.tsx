import { LayoutDashboard } from 'lucide-react'
import { Link } from 'react-router-dom'

import { routes } from '@shared/config'
import { cn } from '@shared/lib/utils'
import { Separator } from '@shared/ui'

import { CabinetNav } from './cabinet-nav'
import { CabinetNotificationsNav } from './cabinet-notifications-nav'
import { CabinetUserMenu } from './cabinet-user-menu'

type CabinetSidebarProps = {
  showNav: boolean
  onNavigate?: () => void
  className?: string
}

export function CabinetSidebar({ showNav, onNavigate, className }: CabinetSidebarProps) {
  return (
    <div className={cn(className)}>
      <div className="px-4 py-5">
        <Link
          to={routes.cabinet.root}
          onClick={onNavigate}
          className="block focus-visible:outline-none"
        >
          <p className="text-sidebar-foreground mt-1 font-semibold">Северное сияние</p>
          <p className="text-sidebar-foreground/55 mt-0.5 text-xs">Личный кабинет</p>
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      <div className="flex-1 overflow-y-auto p-3">
        {showNav ? (
          <CabinetNav onNavigate={onNavigate} />
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
        <CabinetUserMenu onNavigate={onNavigate} />
      </div>
    </div>
  )
}
