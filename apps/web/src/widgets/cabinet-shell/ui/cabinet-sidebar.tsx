import { LayoutDashboard, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { APP_NAME, routes } from '@shared/config'
import { cn } from '@shared/lib/utils'
import { Separator } from '@shared/ui'

import { CabinetNav } from './cabinet-nav'
import { CabinetUserMenu } from './cabinet-user-menu'

type CabinetSidebarProps = {
  showNav: boolean
  onNavigate?: () => void
  className?: string
}

export function CabinetSidebar({ showNav, onNavigate, className }: CabinetSidebarProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="px-4 py-5">
        <Link
          to={routes.cabinet.root}
          onClick={onNavigate}
          className="focus-visible:ring-sidebar-ring flex items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{APP_NAME}</span>
            <span className="text-sidebar-foreground/55 block text-xs">Личный кабинет</span>
          </span>
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      <div className="flex-1 overflow-y-auto p-3">
        {showNav ? (
          <>
            <p className="text-sidebar-foreground/50 mb-2 px-3 text-[11px] font-medium tracking-wide uppercase">
              Навигация
            </p>
            <CabinetNav onNavigate={onNavigate} />
          </>
        ) : (
          <div className="border-sidebar-border bg-sidebar-accent/30 rounded-lg border p-3">
            <LayoutDashboard className="text-sidebar-foreground/60 mb-2 size-4" aria-hidden />
            <p className="text-sidebar-foreground/65 text-xs leading-relaxed">
              Разделы кабинета станут доступны после подтверждения учётной записи.
            </p>
          </div>
        )}
      </div>

      <Separator className="bg-sidebar-border" />
      <div className="p-3">
        <CabinetUserMenu onNavigate={onNavigate} />
      </div>
    </div>
  )
}
