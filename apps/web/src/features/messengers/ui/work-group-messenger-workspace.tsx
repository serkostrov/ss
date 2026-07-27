import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import type { MessengerConnection, MessengerPlatform } from '@shared/api'
import {
  Button,
  DeleteDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@shared/ui'
import { ChatThreadPanel } from '@features/messages'

import { botStatusLabel, messengerPlatformLabel } from '../model/schemas'
import {
  useDeleteMessengerConnectionMutation,
  useMessengerConnections,
} from '../model/use-messenger-connections'
import { MessengerConnectionFormDialog } from './messenger-connection-form-dialog'

type WorkGroupMessengerWorkspaceProps = {
  workGroupId: string
}

const PLATFORMS: MessengerPlatform[] = ['telegram', 'max']

function connectionTitle(connection: MessengerConnection): string {
  return connection.chat_title?.trim() || `${messengerPlatformLabel(connection.platform)} чат`
}

export function WorkGroupMessengerWorkspace({ workGroupId }: WorkGroupMessengerWorkspaceProps) {
  const query = useMessengerConnections(workGroupId)
  const deleteMutation = useDeleteMessengerConnectionMutation(workGroupId)

  const [platform, setPlatform] = useState<MessengerPlatform>('telegram')
  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<MessengerConnection | null>(null)
  const [deleteItem, setDeleteItem] = useState<MessengerConnection | null>(null)

  const byPlatform = useMemo(() => {
    const map: Record<MessengerPlatform, MessengerConnection | null> = {
      telegram: null,
      max: null,
    }
    for (const item of query.data ?? []) {
      map[item.platform] = item
    }
    return map
  }, [query.data])

  const selected = byPlatform[platform]
  const canBind = !selected

  const openCreate = () => {
    setEditItem(null)
    setFormOpen(true)
  }

  if (query.isLoading) {
    return <LoadingState label="Загрузка чатов…" />
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Не удалось загрузить чаты"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    )
  }

  return (
    <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-xl border bg-card lg:min-h-[36rem]">
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2.5">
        <Tabs
          value={platform}
          onValueChange={(value) => setPlatform(value as MessengerPlatform)}
        >
          <TabsList>
            {PLATFORMS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {messengerPlatformLabel(item)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {selected ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{connectionTitle(selected)}</p>
                <StatusBadge
                  status={selected.bot_status}
                  label={botStatusLabel(selected.bot_status)}
                />
              </div>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {selected.chat_id}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditItem(selected)
                  setFormOpen(true)
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => setDeleteItem(selected)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="ml-auto">
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              Привязать
            </Button>
          </div>
        )}
      </div>

      {selected ? (
        <ChatThreadPanel
          workGroupId={workGroupId}
          source={selected.platform}
          externalChatId={selected.chat_id}
          channelTitle={connectionTitle(selected)}
          hideHeader
          className="min-h-0 flex-1"
        />
      ) : (
        <EmptyState
          title={`${messengerPlatformLabel(platform)} не привязан`}
          description="Привяжите канал, группу или личный чат — сообщения и композер появятся здесь."
          className="my-auto py-16"
          actionLabel={canBind ? 'Привязать чат' : undefined}
          onAction={canBind ? openCreate : undefined}
        />
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
        preferredPlatform={editItem?.platform ?? platform}
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
        description="Сообщения в истории останутся, новые из этого чата перестанут поступать."
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
