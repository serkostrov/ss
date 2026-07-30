import { NavLink } from 'react-router-dom'

import { cn } from '@shared/lib/utils'

import { cabinetNavItems } from '../model/nav'

type CabinetNavProps = {
  onNavigate?: () => void
  className?: string
}

export function CabinetNav({ onNavigate, className }: CabinetNavProps) {
  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="Меню личного кабинета">
      {cabinetNavItems.map(({ id, to, label, icon: Icon, end }) => (
        <NavLink
          key={id}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm'
                : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )
          }
        >
          <Icon
            className="size-4 shrink-0 transition-transform group-hover:scale-105"
            aria-hidden
          />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
