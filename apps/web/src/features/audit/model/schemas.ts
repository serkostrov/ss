import type { AuditLogEntry, Json } from '@shared/api'

export function formatAuditDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function auditActorLabel(entry: AuditLogEntry): string {
  if (!entry.actor) return entry.user_id ? 'Пользователь' : 'Система'
  return entry.actor.full_name?.trim() || entry.actor.email || 'Администратор'
}

const ENTITY_LABELS: Record<string, string> = {
  users: 'Пользователь',
  companies: 'Компания',
  representatives: 'Представитель',
  participation_levels: 'Уровень участия',
  work_groups: 'Рабочая группа',
  work_group_categories: 'Направление',
  work_group_members: 'Участник группы',
  work_group_links: 'Ссылка группы',
  messenger_connections: 'Канал мессенджера',
  messenger_bot_channels: 'Каталог каналов',
  messages: 'Сообщение',
  material_sections: 'Материал',
  material_categories: 'Категория материалов',
  material_documents: 'Документ материала',
  material_section_levels: 'Доступ к материалу',
  company_products: 'Продукция',
  product_categories: 'Категория продукции',
  product_category_suggestions: 'Предложение категории продукции',
  okpd2_codes: 'Код ОКПД 2',
  product_notes: 'Примечание продукции',
  invoices: 'Счёт',
  polls: 'Голосование',
  poll_options: 'Вариант ответа',
  poll_votes: 'Голос',
  poll_levels: 'Доступ к голосованию',
  audit_log: 'Журнал',
}

const ACTION_VERB_LABELS: Record<string, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  upsert: 'Сохранение',
  reorder: 'Изменение порядка',
  confirm: 'Подтверждение',
  reject: 'Отклонение',
  set_status: 'Смена статуса',
  set_primary: 'Назначение основным',
  assign_member: 'Привязка участника',
  set_levels: 'Настройка уровней доступа',
  bulk_set_levels: 'Массовая настройка уровней',
  replace_options: 'Замена вариантов',
  bulk_add: 'Массовое добавление',
}

const ACTION_LABELS: Record<string, string> = {
  'registration.confirm': 'Подтверждение регистрации',
  'registration.reject': 'Отклонение регистрации',
  'user.set_status': 'Смена статуса пользователя',
  'representatives.assign_member': 'Привязка участника к компании',
  'representatives.unlink_user': 'Отвязка учётной записи от представителя',
  'representatives.set_primary': 'Назначение основного представителя',
  'representatives.upsert': 'Сохранение представителя',
  'participation_levels.delete': 'Удаление уровня участия',
  'participation_levels.reorder': 'Порядок уровней участия',
  'work_group_categories.delete': 'Удаление направления',
  'work_group_categories.reorder': 'Порядок направлений',
  'material_categories.delete': 'Удаление категории материалов',
  'material_categories.reorder': 'Порядок категорий материалов',
  'material_categories.review': 'Подтверждение категории материалов',
  'company_products.reorder': 'Порядок продукции',
  'company_products.review': 'Модерация продукции',
  'invoices.set_status': 'Смена статуса счёта',
  'product_categories.delete': 'Удаление категории продукции',
  'product_categories.reorder': 'Порядок категорий продукции',
  'product_category_suggestions.review': 'Рассмотрение категории продукции',
  'okpd2_codes.delete': 'Удаление кода ОКПД 2',
  'product_notes.delete': 'Удаление примечания продукции',
  'material_sections.reorder': 'Порядок материалов',
  'material_sections.review': 'Подтверждение выпуска материала',
  'material_sections.set_levels': 'Уровни доступа к материалу',
  'material_sections.bulk_set_levels': 'Массовые уровни доступа к материалам',
  'material_documents.reorder': 'Порядок документов',
  'polls.set_levels': 'Уровни доступа к голосованию',
  'polls.replace_options': 'Замена вариантов голосования',
  'work_group_members.bulk_add': 'Добавление участников в группу',
  'work_group_links.reorder': 'Порядок ссылок группы',
  'messenger_connections.upsert': 'Привязка канала',
  'messenger_connections.update': 'Изменение привязки канала',
  'messenger_connections.delete': 'Отвязка канала',
}

export function entityTypeLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? humanizeToken(entityType)
}

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]

  const dot = action.lastIndexOf('.')
  if (dot > 0) {
    const entity = action.slice(0, dot)
    const verb = action.slice(dot + 1)
    const verbLabel = ACTION_VERB_LABELS[verb] ?? humanizeToken(verb)
    const entityLabel = entityTypeLabel(entity)
    return `${verbLabel}: ${entityLabel.toLowerCase()}`
  }

  return humanizeToken(action)
}

function humanizeToken(value: string): string {
  return value.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickDisplayName(row: Record<string, unknown> | null): string | null {
  if (!row) return null
  for (const key of ['name', 'full_name', 'title', 'email', 'chat_title', 'slug']) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function shortId(value: string | null | undefined): string | null {
  if (!value) return null
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function summarizeChangedKeys(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string | null {
  if (!before || !after) return null
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed: string[] = []
  for (const key of keys) {
    if (key === 'updated_at' || key === 'created_at') continue
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key)
    }
  }
  if (changed.length === 0) return null
  const shown = changed.slice(0, 4).join(', ')
  return changed.length > 4 ? `Изменены поля: ${shown}…` : `Изменены поля: ${shown}`
}

/** Human-readable one-line summary of audit payload. */
export function formatAuditPayload(payload: AuditLogEntry['payload'] | Json | null): string {
  if (payload == null) return '—'

  const root = asRecord(payload)
  if (!root) {
    try {
      return JSON.stringify(payload)
    } catch {
      return String(payload)
    }
  }

  const parts: string[] = []

  if (typeof root.rpc === 'string' && root.rpc.trim()) {
    parts.push(`Операция: ${humanizeToken(root.rpc)}`)
  }

  const after = asRecord(root.after)
  const before = asRecord(root.before)
  const name = pickDisplayName(after) ?? pickDisplayName(before)
  if (name) parts.push(name)

  const changes = summarizeChangedKeys(before, after)
  if (changes) parts.push(changes)

  if (typeof root.status === 'string') parts.push(`Статус: ${root.status}`)
  if (typeof root.mode === 'string') parts.push(`Режим: ${root.mode}`)
  if (typeof root.count === 'number') parts.push(`Записей: ${root.count}`)
  if (typeof root.added === 'number') parts.push(`Добавлено: ${root.added}`)

  if (parts.length > 0) return parts.join(' · ')

  const keys = Object.keys(root).slice(0, 5)
  if (keys.length === 0) return '—'
  return `Данные: ${keys.join(', ')}`
}

export function entityDisplay(entry: AuditLogEntry): { title: string; subtitle: string | null } {
  const title = entityTypeLabel(entry.entity_type)
  const payload = asRecord(entry.payload)
  const after = asRecord(payload?.after)
  const before = asRecord(payload?.before)
  const name = pickDisplayName(after) ?? pickDisplayName(before)
  const id = shortId(entry.entity_id)
  if (name && id) return { title, subtitle: `${name} · ${id}` }
  if (name) return { title, subtitle: name }
  if (id) return { title, subtitle: id }
  return { title, subtitle: null }
}
