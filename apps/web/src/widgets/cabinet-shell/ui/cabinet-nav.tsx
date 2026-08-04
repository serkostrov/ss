import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { useNotificationNavBadges } from '@features/notifications'
import { cn } from '@shared/lib/utils'

import { cabinetNavGroups, cabinetNavItems, type CabinetNavItem } from '../model/nav'

type CabinetNavProps = {
  onNavigate?: () => void
  className?: string
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="bg-primary text-primary-foreground ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavItem({
  item,
  badgeCount,
  onNavigate,
}: {
  item: CabinetNavItem
  badgeCount: number
  onNavigate?: () => void
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

export function CabinetNav({ onNavigate, className }: CabinetNavProps) {
  const { profile } = useAuth()
  const { badges } = useNotificationNavBadges(profile?.status === 'confirmed')

  return (
    <nav className={cn('flex flex-col gap-4', className)} aria-label="Меню личного кабинета">
      {cabinetNavGroups.map((group) => {
        const groupItems = cabinetNavItems.filter((item) => item.group === group.id)
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
                  badgeCount={badges[item.id] ?? 0}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )
}
