import { NavLink } from 'react-router-dom'
import { Building2, FileText, Home, UsersRound, Vote } from 'lucide-react'
import type { ReactNode } from 'react'

import { useAuth } from '@app/providers'
import { LogoutButton } from '@features/auth'
import { APP_NAME, routes } from '@shared/config'
import { cn } from '@shared/lib/utils'

const navItems = [
  { to: routes.cabinet.root, label: 'Главная', icon: Home, end: true },
  { to: routes.cabinet.company, label: 'Компания', icon: Building2, end: false },
  { to: routes.cabinet.directory, label: 'Участники', icon: UsersRound, end: false },
  { to: routes.cabinet.materials, label: 'Материалы', icon: FileText, end: false },
  { to: routes.cabinet.polls, label: 'Голосования', icon: Vote, end: false },
] as const

type CabinetShellProps = {
  children: ReactNode
}

export function CabinetShell({ children }: CabinetShellProps) {
  const { profile } = useAuth()
  const showNav = profile?.status === 'confirmed'
  const levelLabel = profile?.membership?.participationLevelName

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-semibold">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">
              {profile?.fullName ? profile.fullName : 'Личный кабинет'}
              {levelLabel ? ` · ${levelLabel}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {showNav
              ? navItems.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </NavLink>
                ))
              : null}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
