import { LogOut, Shield } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { setActiveSurface, useLogoutMutation } from '@features/auth'
import { routes } from '@shared/config'
import { cn } from '@shared/lib/utils'
import { Button, IconButton, Spinner, UserAvatar } from '@shared/ui'

type CabinetUserMenuProps = {
  onNavigate?: () => void
  companyOnly?: boolean
  className?: string
}

export function CabinetUserMenu({ onNavigate, companyOnly = false, className }: CabinetUserMenuProps) {
  const { profile } = useAuth()
  const logout = useLogoutMutation()
  const navigate = useNavigate()
  const displayName = profile?.fullName?.trim() || profile?.email || 'Пользователь'
  const levelLabel = profile?.membership?.participationLevelName
  const companyName = profile?.membership?.companyName
  const isStaff = profile?.role === 'admin'
  const accountTo = companyOnly
    ? `${routes.cabinet.account}?tab=company`
    : routes.cabinet.account

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex w-full items-center gap-2">
        <NavLink
          to={accountTo}
          onClick={onNavigate}
          title={companyOnly ? 'Карточка компании' : 'Открыть кабинет'}
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'hover:bg-sidebar-accent/60',
            )
          }
        >
          <UserAvatar name={displayName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{displayName}</p>
            {companyName ? (
              <p className="text-sidebar-foreground/60 truncate text-xs">{companyName}</p>
            ) : levelLabel ? (
              <p className="text-sidebar-foreground/60 truncate text-xs">{levelLabel}</p>
            ) : null}
          </div>
        </NavLink>
        <IconButton
          label="Выйти"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive size-8 shrink-0"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? <Spinner size="sm" className="text-current" /> : <LogOut />}
        </IconButton>
      </div>
      {isStaff ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => {
            setActiveSurface('admin')
            onNavigate?.()
            navigate(routes.admin.root)
          }}
        >
          <Shield className="size-3.5" />
          Панель АПСС
        </Button>
      ) : null}
    </div>
  )
}
