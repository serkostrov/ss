import { Link } from 'react-router-dom'

import { routes } from '@shared/config'
import { Separator } from '@shared/ui'

import { AdminNav } from './admin-nav'
import { AdminUserMenu } from './admin-user-menu'

type AdminSidebarProps = {
  onNavigate?: () => void
  className?: string
}

export function AdminSidebar({ onNavigate, className }: AdminSidebarProps) {
  return (
    <div className={className}>
      <div className="px-4 py-5">
        <Link to={routes.admin.root} onClick={onNavigate} className="block focus-visible:outline-none">
          <p className="mt-1 font-semibold text-sidebar-foreground">Северное сияние</p>
        </Link>
      </div>
      <Separator className="bg-sidebar-border" />
      <div className="flex-1 overflow-y-auto p-3">
        <AdminNav onNavigate={onNavigate} />
      </div>
      <Separator className="bg-sidebar-border" />
      <div className="p-3">
        <AdminUserMenu />
      </div>
    </div>
  )
}
