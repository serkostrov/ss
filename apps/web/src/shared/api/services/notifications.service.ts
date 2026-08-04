import type { NotificationType, TableRow } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type AppNotification = TableRow<'notifications'>

export type NotificationsListFilters = {
  unreadOnly?: boolean
}

export const notificationsService = {
  async list(filters: NotificationsListFilters = {}): Promise<AppNotification[]> {
    const rows = await dataService.list('notifications', {
      order: { column: 'created_at', ascending: false },
      limit: 100,
    })
    if (!filters.unreadOnly) return rows
    return rows.filter((row) => row.read_at == null)
  },

  async unreadCount(): Promise<number> {
    const rows = await dataService.list('notifications', {
      columns: 'id, read_at',
      order: { column: 'created_at', ascending: false },
      limit: 100,
    })
    return rows.filter((row) => row.read_at == null).length
  },

  async markRead(id: string): Promise<AppNotification> {
    return rpcService.call('mark_notification_read', { p_notification_id: id })
  },

  async markAllRead(): Promise<number> {
    return rpcService.call('mark_all_notifications_read', {})
  },

  async markReadByTypes(types: NotificationType[]): Promise<number> {
    if (types.length === 0) return 0
    return rpcService.call('mark_notifications_read_by_types', { p_types: types })
  },

  async setEmailNotificationsEnabled(enabled: boolean): Promise<void> {
    await rpcService.call('set_own_email_notifications', { p_enabled: enabled })
  },
}

export function isNotificationType(value: string): value is NotificationType {
  return (
    value === 'invoice_issued' ||
    value === 'invoice_paid' ||
    value === 'product_approved' ||
    value === 'product_rejected'
  )
}
