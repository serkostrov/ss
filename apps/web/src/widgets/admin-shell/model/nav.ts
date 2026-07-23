import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Contact,
  FileText,
  History,
  LayoutDashboard,
  MessagesSquare,
  ScrollText,
  Settings,
  Briefcase,
  Users,
  Vote,
} from 'lucide-react'

import { permissions, type Permission } from '@features/auth'
import { routes } from '@shared/config'

export type AdminNavItem = {
  id: string
  to: string
  label: string
  description: string
  icon: LucideIcon
  permission: Permission
  end?: boolean
  group: 'main' | 'content' | 'system'
}

export const adminNavItems: AdminNavItem[] = [
  {
    id: 'dashboard',
    to: routes.admin.root,
    label: 'Обзор',
    description: 'Сводка по панели админа',
    icon: LayoutDashboard,
    permission: permissions['admin.dashboard'],
    end: true,
    group: 'main',
  },
  {
    id: 'registrations',
    to: routes.admin.registrations,
    label: 'Заявки',
    description: 'Регистрации и подтверждение участников',
    icon: Users,
    permission: permissions['admin.registrations'],
    group: 'main',
  },
  {
    id: 'companies',
    to: routes.admin.companies,
    label: 'Компании',
    description: 'Организации — участники ассоциации',
    icon: Building2,
    permission: permissions['admin.companies'],
    group: 'main',
  },
  {
    id: 'representatives',
    to: routes.admin.representatives,
    label: 'Представители',
    description: 'Контакты компаний и учётные записи',
    icon: Contact,
    permission: permissions['admin.representatives'],
    group: 'main',
  },
  {
    id: 'staff',
    to: routes.admin.staff,
    label: 'Сотрудники',
    description: 'Учётные записи сотрудников АПСС',
    icon: Briefcase,
    permission: permissions['admin.staff'],
    group: 'main',
  },
  {
    id: 'work-groups',
    to: routes.admin.workGroups,
    label: 'Группы',
    description: 'Рабочие группы и мессенджеры',
    icon: MessagesSquare,
    permission: permissions['admin.workGroups'],
    group: 'content',
  },
  {
    id: 'messages',
    to: routes.admin.messages,
    label: 'Сообщения',
    description: 'История Telegram / Max',
    icon: History,
    permission: permissions['admin.messages'],
    group: 'content',
  },
  {
    id: 'materials',
    to: routes.admin.materials,
    label: 'Материалы',
    description: 'Документы по уровням участия',
    icon: FileText,
    permission: permissions['admin.materials'],
    group: 'content',
  },
  {
    id: 'polls',
    to: routes.admin.polls,
    label: 'Голосования',
    description: 'Опросы кабинета участников',
    icon: Vote,
    permission: permissions['admin.polls'],
    group: 'content',
  },
  {
    id: 'audit',
    to: routes.admin.audit,
    label: 'Журнал',
    description: 'Аудит административных действий',
    icon: ScrollText,
    permission: permissions['admin.audit'],
    group: 'system',
  },
  {
    id: 'settings',
    to: routes.admin.settings,
    label: 'Настройки',
    description: 'Параметры системы и интеграции',
    icon: Settings,
    permission: permissions['admin.settings'],
    group: 'system',
  },
]

export const adminNavGroups: Array<{ id: AdminNavItem['group']; label: string }> = [
  { id: 'main', label: 'Управление' },
  { id: 'content', label: 'Контент' },
  { id: 'system', label: 'Система' },
]
