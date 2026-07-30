import { LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { useLogoutMutation } from '@features/auth'
import { routes } from '@shared/config'
import { cn } from '@shared/lib/utils'
import { IconButton, Spinner, UserAvatar } from '@shared/ui'

type CabinetUserMenuProps = {
  onNavigate?: () => void
}

export function CabinetUserMenu({ onNavigate }: CabinetUserMenuProps) {
  const { profile } = useAuth()
  const logout = useLogoutMutation()
  const displayName = profile?.fullName?.trim() || profile?.email || 'Пользователь'
  const levelLabel = profile?.membership?.participationLevelName

  return (
    <div className="flex w-full items-center gap-2.5">
      <NavLink
        to={routes.cabinet.account}
        onClick={onNavigate}
        title="Открыть кабинет"
        className={({ isActive }) =>
          cn(
            'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 transition-colors',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent/60',
          )
        }
      >
        <UserAvatar name={displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="text-sidebar-foreground/60 truncate text-xs">
            Кабинет{levelLabel ? ` · ${levelLabel}` : ''}
          </p>
        </div>
      </NavLink>
      <IconButton
        label="Выйти"
        variant="ghost"
        className="text-sidebar-foreground/60 hover:bg-destructive/10 hover:text-destructive size-8 shrink-0"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        {logout.isPending ? <Spinner size="sm" className="text-current" /> : <LogOut />}
      </IconButton>
    </div>
  )
}
