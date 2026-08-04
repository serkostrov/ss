import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  Home,
  Package,
  Receipt,
  UsersRound,
  Vote,
} from 'lucide-react'

import { routes } from '@shared/config'

export type CabinetNavGroupId = 'overview' | 'association' | 'activity' | 'finance'

export type CabinetNavItem = {
  id: string
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  group: CabinetNavGroupId
}

export const cabinetNavGroups: Array<{ id: CabinetNavGroupId; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'association', label: 'Ассоциация' },
  { id: 'activity', label: 'Участие' },
  { id: 'finance', label: 'Финансы' },
]

export const cabinetNavItems: CabinetNavItem[] = [
  { id: 'home', to: routes.cabinet.root, label: 'Главная', icon: Home, end: true, group: 'overview' },
  {
    id: 'directory',
    to: routes.cabinet.directory,
    label: 'Участники',
    icon: UsersRound,
    group: 'association',
  },
  {
    id: 'products',
    to: routes.cabinet.products,
    label: 'Продукция и услуги',
    icon: Package,
    group: 'association',
  },
  {
    id: 'materials',
    to: routes.cabinet.materials,
    label: 'Материалы',
    icon: FileText,
    group: 'activity',
  },
  {
    id: 'polls',
    to: routes.cabinet.polls,
    label: 'Голосования',
    icon: Vote,
    group: 'activity',
  },
  {
    id: 'invoices',
    to: routes.cabinet.invoices,
    label: 'Счета на оплату',
    icon: Receipt,
    group: 'finance',
  },
]
