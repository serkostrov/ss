import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { usePermissions } from '@features/auth/model/use-permissions'
import { useNotificationNavBadges } from '@features/notifications'
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

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="bg-primary text-primary-foreground ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function AdminNav({ onNavigate, className, compact = false }: AdminNavProps) {
  const { can } = usePermissions()
  const { profile } = useAuth()
  const { badges } = useNotificationNavBadges(
    profile?.role === 'admin' && profile.status !== 'blocked',
  )
  const items = filterNavItems(can)

  if (compact) {
    return (
      <nav className={cn('flex flex-col gap-1', className)} aria-label="Меню админки">
        {items.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            onNavigate={onNavigate}
            badgeCount={badges[item.id] ?? 0}
          />
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
            <p className="text-sidebar-foreground/60 mb-1.5 px-3 text-[11px] font-medium tracking-wide uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {groupItems.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  onNavigate={onNavigate}
                  badgeCount={badges[item.id] ?? 0}
                />
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function NavItem({
  item,
  onNavigate,
  badgeCount,
}: {
  item: AdminNavItem
  onNavigate?: () => void
  badgeCount: number
}) {
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
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground/78 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <NavBadge count={badgeCount} />
    </NavLink>
  )
}
