import type { NotificationType } from '@shared/api'

/** Maps notification types to cabinet sidebar nav item ids. */
export const NOTIFICATION_NAV_BY_TYPE: Record<NotificationType, string> = {
  invoice_issued: 'invoices',
  invoice_paid: 'invoices',
  product_approved: 'products',
  product_rejected: 'products',
}

/** Notification types that belong to a nav section (for clearing badges on open). */
export const NOTIFICATION_TYPES_BY_NAV: Record<string, NotificationType[]> = {
  invoices: ['invoice_issued', 'invoice_paid'],
  products: ['product_approved', 'product_rejected'],
}

export type NotificationNavBadges = Record<string, number>

export function countNotificationNavBadges(
  items: Array<{ type: NotificationType; read_at: string | null }>,
): NotificationNavBadges {
  const badges: NotificationNavBadges = {}
  for (const item of items) {
    if (item.read_at != null) continue
    const navId = NOTIFICATION_NAV_BY_TYPE[item.type]
    if (!navId) continue
    badges[navId] = (badges[navId] ?? 0) + 1
  }
  return badges
}
