import { LogOut } from 'lucide-react'

import { useAuth } from '@app/providers'
import { useLogoutMutation } from '@features/auth'
import { cn } from '@shared/lib/utils'
import { IconButton, Spinner, UserAvatar } from '@shared/ui'

type AdminUserMenuProps = {
  className?: string
}

export function AdminUserMenu({ className }: AdminUserMenuProps) {
  const { profile } = useAuth()
  const logout = useLogoutMutation()

  const displayName = profile?.fullName?.trim() || profile?.email || 'Пользователь'

  return (
    <div className={cn('flex w-full items-center gap-2', className)}>
      <UserAvatar name={displayName} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm">{displayName}</span>
      <IconButton
        label="Выйти"
        variant="ghost"
        className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        {logout.isPending ? <Spinner size="sm" className="text-current" /> : <LogOut />}
      </IconButton>
    </div>
  )
}
