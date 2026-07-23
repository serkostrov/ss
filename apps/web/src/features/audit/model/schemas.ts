import type { AuditLogEntry } from '@shared/api'

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
  if (!entry.actor) return entry.user_id ? entry.user_id.slice(0, 8) : 'Система'
  return entry.actor.full_name?.trim() || entry.actor.email || 'Администратор'
}

export function formatAuditPayload(payload: AuditLogEntry['payload']): string {
  if (payload == null) return '—'
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

export function actionLabel(action: string): string {
  return action
}
