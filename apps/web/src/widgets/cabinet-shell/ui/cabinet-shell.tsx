import { NavLink } from 'react-router-dom'
import { Building2, FileText, Home, MessageSquareText, UsersRound, Vote } from 'lucide-react'
import type { ReactNode } from 'react'

import { useAuth } from '@app/providers'
import { LogoutButton } from '@features/auth'
import { APP_NAME, routes } from '@shared/config'
import { cn } from '@shared/lib/utils'

const navItems = [
  { to: routes.cabinet.root, label: 'Главная', icon: Home, end: true },
  { to: routes.cabinet.company, label: 'Компания', icon: Building2, end: false },
  { to: routes.cabinet.directory, label: 'Участники', icon: UsersRound, end: false },
  { to: routes.cabinet.messages, label: 'Сообщения', icon: MessageSquareText, end: false },
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
  const userLabel = profile?.fullName?.trim() || 'Личный кабинет'

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <div className="min-w-0 shrink">
            <p className="truncate text-sm font-semibold leading-tight">{APP_NAME}</p>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {userLabel}
              {levelLabel ? ` · ${levelLabel}` : ''}
            </p>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {showNav
              ? navItems.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    title={label}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                        isActive
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="hidden lg:inline">{label}</span>
                  </NavLink>
                ))
              : null}
            <LogoutButton
              className="h-8 shrink-0 gap-1.5 px-2 text-sm"
              label="Выйти"
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-5">{children}</main>
    </div>
  )
}
