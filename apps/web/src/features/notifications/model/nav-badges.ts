import type { NotificationType } from '@shared/api'

/** Maps notification types to cabinet / admin sidebar nav item ids. */
export const NOTIFICATION_NAV_BY_TYPE: Record<NotificationType, string> = {
  invoice_issued: 'invoices',
  invoice_paid: 'invoices',
  product_approved: 'products',
  product_rejected: 'products',
  registration_pending: 'registrations',
  product_moderation_pending: 'registrations',
  category_suggestion_pending: 'registrations',
  material_moderation_pending: 'registrations',
  material_category_pending: 'registrations',
  work_group_membership_pending: 'registrations',
  registration_confirmed: 'home',
}

/** Notification types that belong to a nav section (for clearing badges on open). */
export const NOTIFICATION_TYPES_BY_NAV: Record<string, NotificationType[]> = {
  invoices: ['invoice_issued', 'invoice_paid'],
  products: ['product_approved', 'product_rejected'],
  home: ['registration_confirmed'],
  registrations: [
    'registration_pending',
    'product_moderation_pending',
    'category_suggestion_pending',
    'material_moderation_pending',
    'material_category_pending',
    'work_group_membership_pending',
  ],
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
