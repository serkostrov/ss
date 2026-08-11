import { Link } from 'react-router-dom'

import { routes } from '@shared/config'
import { Separator } from '@shared/ui'

import { AdminNav } from './admin-nav'
import { AdminNotificationsNav } from './admin-notifications-nav'
import { AdminUserMenu } from './admin-user-menu'

type AdminSidebarProps = {
  onNavigate?: () => void
  className?: string
}

export function AdminSidebar({ onNavigate, className }: AdminSidebarProps) {
  return (
    <div className={className}>
      <div className="px-4 py-5">
        <Link
          to={routes.admin.root}
          onClick={onNavigate}
          className="block focus-visible:outline-none"
        >
          <p className="text-sidebar-foreground mt-1 font-semibold">АПСС(ЭР)</p>
          <p className="text-sidebar-foreground/55 mt-0.5 text-xs">Админ-панель</p>
        </Link>
      </div>
      <Separator className="bg-sidebar-border" />
      <div className="flex-1 overflow-y-auto p-3">
        <AdminNav onNavigate={onNavigate} />
      </div>
      <Separator className="bg-sidebar-border" />
      <div className="space-y-1 p-3">
        <AdminNotificationsNav onNavigate={onNavigate} />
        <AdminUserMenu />
      </div>
    </div>
  )
}
