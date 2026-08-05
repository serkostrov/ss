import { CabinetNotificationsPanel } from '@features/notifications'

export function AdminNotificationsPage() {
  return (
    <CabinetNotificationsPanel
      title="Уведомления"
      description="Заявки на регистрацию, модерация продукции и материалов."
      emptyDescription="Когда появятся новые заявки или объекты на модерации, здесь будет лента."
    />
  )
}
