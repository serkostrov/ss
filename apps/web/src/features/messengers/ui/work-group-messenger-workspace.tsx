import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react'

import type { MessengerConnection } from '@shared/api'
import {
  Button,
  DeleteDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from '@shared/ui'
import { cn } from '@shared/lib/utils'
import { ChatThreadPanel } from '@features/messages'

import {
  botStatusLabel,
  messengerPlatformLabel,
} from '../model/schemas'
import {
  availablePlatforms,
  useDeleteMessengerConnectionMutation,
  useMessengerConnections,
} from '../model/use-messenger-connections'
import { MessengerConnectionFormDialog } from './messenger-connection-form-dialog'

type WorkGroupMessengerWorkspaceProps = {
  workGroupId: string
}

function connectionTitle(connection: MessengerConnection): string {
  return connection.chat_title?.trim() || `${messengerPlatformLabel(connection.platform)} чат`
}

export function WorkGroupMessengerWorkspace({ workGroupId }: WorkGroupMessengerWorkspaceProps) {
  const query = useMessengerConnections(workGroupId)
  const deleteMutation = useDeleteMessengerConnectionMutation(workGroupId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<MessengerConnection | null>(null)
  const [deleteItem, setDeleteItem] = useState<MessengerConnection | null>(null)

  const connections = useMemo(() => {
    const list = [...(query.data ?? [])]
    return list.sort((a, b) => a.platform.localeCompare(b.platform, 'en'))
  }, [query.data])

  const selected =
    connections.find((item) => item.id === selectedId) ?? connections[0] ?? null

  useEffect(() => {
    if (!selectedId && connections[0]) {
      setSelectedId(connections[0].id)
    } else if (selectedId && !connections.some((item) => item.id === selectedId)) {
      setSelectedId(connections[0]?.id ?? null)
      setMobileShowChat(false)
    }
  }, [connections, selectedId])

  const canAdd = availablePlatforms(connections).length > 0

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
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid min-h-[32rem] lg:min-h-[36rem] lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside
          className={cn(
            'flex min-h-0 flex-col border-b lg:border-r lg:border-b-0',
            mobileShowChat ? 'hidden lg:flex' : 'flex',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
            <p className="text-sm font-medium">Чаты</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canAdd}
              onClick={openCreate}
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Чат</span>
            </Button>
          </div>

          {connections.length === 0 ? (
            <EmptyState
              title="Нет привязанных чатов"
              description="Привяжите канал, группу или ЛС Telegram / Max — сообщения появятся справа."
              className="py-12"
              actionLabel={canAdd ? 'Привязать чат' : undefined}
              onAction={canAdd ? openCreate : undefined}
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {connections.map((connection) => {
                const active = selected?.id === connection.id
                return (
                  <li key={connection.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(connection.id)
                        setMobileShowChat(true)
                      }}
                      className={cn(
                        'flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted/70',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {connectionTitle(connection)}
                        </span>
                        <StatusBadge
                          status={connection.bot_status}
                          label={botStatusLabel(connection.bot_status)}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {messengerPlatformLabel(connection.platform)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* Chat pane */}
        <section
          className={cn(
            'flex min-h-0 min-w-0 flex-col',
            mobileShowChat ? 'flex' : 'hidden lg:flex',
          )}
        >
          {selected ? (
            <>
              <div className="flex items-center gap-1 border-b px-2 py-1.5 lg:hidden">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setMobileShowChat(false)}
                >
                  <ChevronLeft className="size-4" />
                  Чаты
                </Button>
              </div>

              <div className="flex items-center gap-2 border-b px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{connectionTitle(selected)}</p>
                  <p className="text-xs text-muted-foreground">
                    {messengerPlatformLabel(selected.platform)}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 gap-1">
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

              <ChatThreadPanel
                workGroupId={workGroupId}
                source={selected.platform}
                externalChatId={selected.chat_id}
                channelTitle={connectionTitle(selected)}
                hideHeader
                className="min-h-0 flex-1"
              />
            </>
          ) : (
            <EmptyState
              title="Выберите чат"
              description="Слева выберите чат или привяжите новый."
              className="my-auto py-16"
            />
          )}
        </section>
      </div>

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
        preferredPlatform={
          editItem?.platform ?? availablePlatforms(connections)[0]
        }
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
