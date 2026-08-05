import { Bell } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { useUnreadNotificationsCount } from '@features/notifications'
import { routes } from '@shared/config'
import { cn } from '@shared/lib/utils'

type AdminNotificationsNavProps = {
  onNavigate?: () => void
}

export function AdminNotificationsNav({ onNavigate }: AdminNotificationsNavProps) {
  const { profile } = useAuth()
  const enabled = profile?.role === 'admin' && profile.status !== 'blocked'
  const unreadQuery = useUnreadNotificationsCount(enabled)
  const unread = unreadQuery.data ?? 0

  return (
    <NavLink
      to={routes.admin.notifications}
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
      <Bell className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">Уведомления</span>
      {unread > 0 ? (
        <span className="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </NavLink>
  )
}
