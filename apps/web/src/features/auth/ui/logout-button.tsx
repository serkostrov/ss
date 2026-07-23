import { LogOut } from 'lucide-react'

import { Button, Spinner } from '@shared/ui'

import { useLogoutMutation } from '../model/use-auth-mutations'

type LogoutButtonProps = {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  className?: string
  label?: string
}

export function LogoutButton({
  variant = 'ghost',
  className,
  label = 'Выйти',
}: LogoutButtonProps) {
  const logout = useLogoutMutation()

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={logout.isPending}
      onClick={() => logout.mutate()}
    >
      {logout.isPending ? <Spinner size="sm" /> : <LogOut className="size-4" />}
      {label}
    </Button>
  )
}
