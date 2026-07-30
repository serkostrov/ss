import type { LucideIcon } from 'lucide-react'
import { FileText, Home, MessageSquareText, UsersRound, Vote } from 'lucide-react'

import { routes } from '@shared/config'

export type CabinetNavItem = {
  id: string
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const cabinetNavItems: CabinetNavItem[] = [
  { id: 'home', to: routes.cabinet.root, label: 'Главная', icon: Home, end: true },
  { id: 'directory', to: routes.cabinet.directory, label: 'Участники', icon: UsersRound },
  { id: 'messages', to: routes.cabinet.messages, label: 'Сообщения', icon: MessageSquareText },
  { id: 'materials', to: routes.cabinet.materials, label: 'Материалы', icon: FileText },
  { id: 'polls', to: routes.cabinet.polls, label: 'Голосования', icon: Vote },
]
