import { ConfirmDialog } from './confirm-dialog'

type DeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityName?: string
  title?: string
  description?: string
  onConfirm: () => void | Promise<void>
  loading?: boolean
}

function DeleteDialog({
  open,
  onOpenChange,
  entityName,
  title = 'Удалить запись?',
  description,
  onConfirm,
  loading,
}: DeleteDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        description ??
        (entityName
          ? `«${entityName}» будет удалено без возможности восстановления.`
          : 'Действие необратимо. Продолжить?')
      }
      confirmLabel="Удалить"
      cancelLabel="Отмена"
      onConfirm={onConfirm}
      loading={loading}
      destructive
    />
  )
}

export { DeleteDialog }
export type { DeleteDialogProps }
