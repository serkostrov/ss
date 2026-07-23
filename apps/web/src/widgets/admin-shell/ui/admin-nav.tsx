import { NavLink } from 'react-router-dom'

import { usePermissions } from '@features/auth/model/use-permissions'
import { cn } from '@shared/lib/utils'

import { adminNavGroups, adminNavItems, type AdminNavItem } from '../model/nav'

type AdminNavProps = {
  onNavigate?: () => void
  className?: string
  compact?: boolean
}

function filterNavItems(can: (permission: AdminNavItem['permission']) => boolean) {
  return adminNavItems.filter((item) => can(item.permission))
}

export function AdminNav({ onNavigate, className, compact = false }: AdminNavProps) {
  const { can } = usePermissions()
  const items = filterNavItems(can)

  if (compact) {
    return (
      <nav className={cn('flex flex-col gap-1', className)} aria-label="Меню админки">
        {items.map((item) => (
          <NavItem key={item.id} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
    )
  }

  return (
    <nav className={cn('flex flex-col gap-4', className)} aria-label="Меню админки">
      {adminNavGroups.map((group) => {
        const groupItems = items.filter((item) => item.group === group.id)
        if (!groupItems.length) return null

        return (
          <div key={group.id}>
            <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-sidebar-foreground/60 uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {groupItems.map((item) => (
                <NavItem key={item.id} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function NavItem({ item, onNavigate }: { item: AdminNavItem; onNavigate?: () => void }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/78 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}
