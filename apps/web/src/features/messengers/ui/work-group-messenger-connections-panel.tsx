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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui'

import {
  botStatusLabel,
  connectionLastUpdate,
  formatMessengerDate,
  messengerPlatformLabel,
} from '../model/schemas'
import {
  useDeleteMessengerConnectionMutation,
  useMessengerConnections,
} from '../model/use-messenger-connections'
import { MessengerConnectionFormDialog } from './messenger-connection-form-dialog'

type WorkGroupMessengerConnectionsPanelProps = {
  workGroupId: string
  /** When set, locks to one platform (no inner tabs). */
  platform?: MessengerPlatform
}

const PLATFORMS: Array<{ id: MessengerPlatform; label: string }> = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'max', label: 'Max' },
]

function ConnectionsList({
  platform,
  connections,
  canAdd,
  onCreate,
  onEdit,
  onDelete,
}: {
  platform: MessengerPlatform
  connections: MessengerConnection[]
  canAdd: boolean
  onCreate: () => void
  onEdit: (connection: MessengerConnection) => void
  onDelete: (connection: MessengerConnection) => void
}) {
  if (connections.length === 0) {
    return (
      <EmptyState
        title={`${messengerPlatformLabel(platform)} не привязан`}
        description={`Выберите канал, группу или ЛС ${messengerPlatformLabel(platform)}, где уже есть бот АПСС.`}
        className="py-10"
        actionLabel={canAdd ? 'Привязать чат' : undefined}
        onAction={canAdd ? onCreate : undefined}
      />
    )
  }

  return (
    <ul className="space-y-3">
      {connections.map((connection) => (
        <li key={connection.id} className="rounded-lg border px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
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
                  <span className="text-muted-foreground">Канал: </span>
                  <span className="font-medium">
                    {connection.chat_title?.trim() || 'Без названия'}
                  </span>
                </p>
                <p className="text-muted-foreground truncate font-mono text-xs">
                  ID: {connection.chat_id}
                </p>
              </div>

              {connection.last_error ? (
                <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
                  {connection.last_error}
                </p>
              ) : null}

              <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>Создано: {formatMessengerDate(connection.created_at)}</span>
                <span>Подключено: {formatMessengerDate(connection.connected_at)}</span>
                <span>Обновление: {formatMessengerDate(connectionLastUpdate(connection))}</span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(connection)}>
                <Pencil className="size-4" />
                Изменить
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onDelete(connection)}
              >
                <Trash2 className="size-4" />
                Удалить
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function WorkGroupMessengerConnectionsPanel({
  workGroupId,
  platform: lockedPlatform,
}: WorkGroupMessengerConnectionsPanelProps) {
  const query = useMessengerConnections(workGroupId)
  const deleteMutation = useDeleteMessengerConnectionMutation(workGroupId)

  const [activePlatform, setActivePlatform] = useState<MessengerPlatform>(
    lockedPlatform ?? 'telegram',
  )
  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<MessengerConnection | null>(null)
  const [deleteItem, setDeleteItem] = useState<MessengerConnection | null>(null)

  const platform = lockedPlatform ?? activePlatform
  const connections = query.data ?? []

  const byPlatform = useMemo(() => {
    const map: Record<MessengerPlatform, MessengerConnection[]> = {
      telegram: [],
      max: [],
    }
    for (const item of connections) {
      map[item.platform].push(item)
    }
    return map
  }, [connections])

  const canAdd = !connections.some((item) => item.platform === platform)

  const openCreate = () => {
    setEditItem(null)
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

  const bindButton = (
    <Button type="button" size="sm" className="shrink-0" disabled={!canAdd} onClick={openCreate}>
      <Plus className="size-4" />
      Привязать чат
    </Button>
  )

  const listFor = (target: MessengerPlatform) => (
    <ConnectionsList
      platform={target}
      connections={byPlatform[target]}
      canAdd={!connections.some((item) => item.platform === target)}
      onCreate={openCreate}
      onEdit={(connection) => {
        setEditItem(connection)
        setFormOpen(true)
      }}
      onDelete={setDeleteItem}
    />
  )

  return (
    <div className="space-y-4">
      {lockedPlatform ? (
        <>
          <div className="flex justify-end">{bindButton}</div>
          {listFor(lockedPlatform)}
        </>
      ) : (
        <Tabs
          value={activePlatform}
          onValueChange={(value) => setActivePlatform(value as MessengerPlatform)}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="w-auto">
              {PLATFORMS.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {bindButton}
          </div>
          {PLATFORMS.map((item) => (
            <TabsContent key={item.id} value={item.id} className="mt-4">
              {listFor(item.id)}
            </TabsContent>
          ))}
        </Tabs>
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
        description="Запись будет удалена. Worker перестанет использовать этот чат."
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
