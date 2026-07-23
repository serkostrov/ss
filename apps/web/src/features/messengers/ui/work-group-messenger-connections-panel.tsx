import { useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'

import type { MessengerConnection, MessengerPlatform } from '@shared/api'
import {
  Badge,
  Button,
  DeleteDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '@shared/ui'

import {
  botStatusLabel,
  connectionLastUpdate,
  formatMessengerDate,
  messengerPlatformLabel,
} from '../model/schemas'
import {
  availablePlatforms,
  useDeleteMessengerConnectionMutation,
  useMessengerConnections,
} from '../model/use-messenger-connections'
import { MessengerConnectionFormDialog } from './messenger-connection-form-dialog'

type WorkGroupMessengerConnectionsPanelProps = {
  workGroupId: string
  /** When set, shows only this platform and creates for it. */
  platform?: MessengerPlatform
}

export function WorkGroupMessengerConnectionsPanel({
  workGroupId,
  platform,
}: WorkGroupMessengerConnectionsPanelProps) {
  const query = useMessengerConnections(workGroupId)
  const deleteMutation = useDeleteMessengerConnectionMutation(workGroupId)

  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<MessengerConnection | null>(null)
  const [deleteItem, setDeleteItem] = useState<MessengerConnection | null>(null)

  const connections = query.data ?? []
  const filtered = useMemo(() => {
    const list = platform ? connections.filter((item) => item.platform === platform) : connections
    return [...list].sort((a, b) => a.platform.localeCompare(b.platform, 'en'))
  }, [connections, platform])

  const canAdd = platform
    ? !connections.some((item) => item.platform === platform)
    : availablePlatforms(connections).length > 0

  const openCreate = () => {
    setEditItem(null)
    setFormOpen(true)
  }

  const openEdit = (connection: MessengerConnection) => {
    setEditItem(connection)
    setFormOpen(true)
  }

  if (query.isLoading) {
    return <LoadingState label="Загрузка подключений мессенджеров…" />
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Не удалось загрузить подключения"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const emptyTitle = platform
    ? `${messengerPlatformLabel(platform)} не привязан`
    : 'Чаты не привязаны'
  const emptyDescription = platform
    ? `Добавьте чат ${messengerPlatformLabel(platform)} — укажите ID и статус подключения.`
    : 'Добавьте Telegram или Max — укажите ID чата и статус подключения.'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Привязка чата к рабочей группе. На платформу — не больше одного канала.
        </p>
        <Button type="button" size="sm" disabled={!canAdd} onClick={openCreate}>
          <Plus className="size-4" />
          Привязать чат
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          className="py-10"
          actionLabel={canAdd ? 'Привязать чат' : undefined}
          onAction={canAdd ? openCreate : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((connection) => (
            <li key={connection.id} className="rounded-lg border px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {!platform ? (
                      <p className="font-medium">{messengerPlatformLabel(connection.platform)}</p>
                    ) : null}
                    <StatusBadge
                      status={connection.bot_status}
                      label={botStatusLabel(connection.bot_status)}
                    />
                    {connection.last_error ? (
                      <Badge variant="destructive" className="font-normal">
                        <AlertTriangle className="mr-1 size-3" />
                        Есть ошибка
                      </Badge>
                    ) : null}
                  </div>

                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Чат: </span>
                      <span className="font-medium">
                        {connection.chat_title?.trim() || 'Без названия'}
                      </span>
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      ID: {connection.chat_id}
                    </p>
                  </div>

                  {connection.last_error ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {connection.last_error}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Создано: {formatMessengerDate(connection.created_at)}</span>
                    <span>Подключено: {formatMessengerDate(connection.connected_at)}</span>
                    <span>
                      Обновление: {formatMessengerDate(connectionLastUpdate(connection))}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(connection)}
                  >
                    <Pencil className="size-4" />
                    Изменить
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleteItem(connection)}
                  >
                    <Trash2 className="size-4" />
                    Удалить
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MessengerConnectionFormDialog
        open={formOpen || Boolean(editItem)}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false)
            setEditItem(null)
          } else {
            setFormOpen(true)
          }
        }}
        workGroupId={workGroupId}
        connection={editItem}
        preferredPlatform={platform}
      />

      <DeleteDialog
        open={Boolean(deleteItem)}
        onOpenChange={(open) => {
          if (!open) setDeleteItem(null)
        }}
        entityName={
          deleteItem
            ? `${messengerPlatformLabel(deleteItem.platform)} · ${deleteItem.chat_title || deleteItem.chat_id}`
            : undefined
        }
        title="Отвязать чат?"
        description="Запись будет удалена из messenger_connections. Worker перестанет использовать этот канал."
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!deleteItem) return
          await deleteMutation.mutateAsync(deleteItem.id)
          setDeleteItem(null)
        }}
      />
    </div>
  )
}
