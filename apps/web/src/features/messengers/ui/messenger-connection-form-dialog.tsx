import { useEffect, useMemo, useState } from 'react'

import type { MessengerConnection } from '@shared/api'
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@shared/ui'

import {
  messengerChatKindLabel,
  messengerConnectionFormSchema,
  messengerPlatformLabel,
  type MessengerConnectionFormValues,
} from '../model/schemas'
import {
  availablePlatforms,
  toMessengerConnectionInput,
  useMessengerBotChannels,
  useMessengerConnections,
  useUpdateMessengerConnectionMutation,
  useUpsertMessengerConnectionMutation,
} from '../model/use-messenger-connections'

type MessengerConnectionFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workGroupId: string
  connection?: MessengerConnection | null
  /** Preferred platform when creating a new connection. */
  preferredPlatform?: MessengerConnectionFormValues['platform']
}

function toFormValues(
  connection: MessengerConnection | null | undefined,
  defaultPlatform: MessengerConnectionFormValues['platform'],
): MessengerConnectionFormValues {
  return {
    platform: connection?.platform ?? defaultPlatform,
    chatId: connection?.chat_id ?? '',
    chatTitle: connection?.chat_title ?? '',
  }
}

function channelLabel(channel: {
  title: string | null
  username: string | null
  external_chat_id: string
  chat_kind?: string | null
}): string {
  const kind = messengerChatKindLabel(channel.chat_kind)
  const title = channel.title?.trim()
  const username = channel.username?.trim()
  const name =
    title && username
      ? `${title} (@${username})`
      : title || (username ? `@${username}` : channel.external_chat_id)
  return `${kind}: ${name}`
}

export function MessengerConnectionFormDialog({
  open,
  onOpenChange,
  workGroupId,
  connection,
  preferredPlatform,
}: MessengerConnectionFormDialogProps) {
  const isEdit = Boolean(connection)
  const listQuery = useMessengerConnections(workGroupId)
  const upsertMutation = useUpsertMessengerConnectionMutation(workGroupId)
  const updateMutation = useUpdateMessengerConnectionMutation(workGroupId)

  const platforms = availablePlatforms(listQuery.data ?? [], connection?.platform)
  const defaultPlatform =
    (preferredPlatform && platforms.includes(preferredPlatform) ? preferredPlatform : undefined) ??
    platforms[0] ??
    preferredPlatform ??
    'telegram'

  const [values, setValues] = useState<MessengerConnectionFormValues>(() =>
    toFormValues(connection, defaultPlatform),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const channelsQuery = useMessengerBotChannels(values.platform, open)
  const catalogFromApi = channelsQuery.data ?? []
  const channels = useMemo(() => {
    const list = [...catalogFromApi]
    if (
      values.chatId &&
      !list.some((item) => item.external_chat_id === values.chatId)
    ) {
      list.unshift({
        id: `current-${values.chatId}`,
        platform: values.platform,
        external_chat_id: values.chatId,
        title: values.chatTitle || 'Текущий чат',
        username: null,
        chat_kind: 'other',
        is_active: true,
        last_seen_at: null,
        created_at: '',
        updated_at: '',
      })
    }
    return list
  }, [catalogFromApi, values.chatId, values.chatTitle, values.platform])
  const noChannelsFound = !channelsQuery.isLoading && channels.length === 0

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(connection, defaultPlatform))
    setErrors({})
  }, [open, connection, defaultPlatform])

  const pending = upsertMutation.isPending || updateMutation.isPending

  const selectedChannel = useMemo(
    () => channels.find((item) => item.external_chat_id === values.chatId) ?? null,
    [channels, values.chatId],
  )

  const patch = <K extends keyof MessengerConnectionFormValues>(
    key: K,
    value: MessengerConnectionFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const selectChannel = (externalChatId: string) => {
    const channel = channels.find((item) => item.external_chat_id === externalChatId)
    setValues((prev) => ({
      ...prev,
      chatId: externalChatId,
      chatTitle: channel?.title ?? channel?.username ?? prev.chatTitle,
    }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next.chatId
      return next
    })
  }

  const submit = async () => {
    const parsed = messengerConnectionFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const payload = toMessengerConnectionInput(workGroupId, parsed.data)

    if (isEdit && connection) {
      await updateMutation.mutateAsync({
        id: connection.id,
        values: {
          chat_id: payload.chat_id,
          chat_title: payload.chat_title,
          bot_status: payload.bot_status,
          last_error: payload.last_error,
        },
      })
    } else {
      await upsertMutation.mutateAsync(payload)
    }

    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Изменить привязку' : 'Привязать чат'}
      description="Выберите канал, группу или личный чат, где уже есть бот АПСС. Статус обновляет worker."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={
              pending ||
              (!isEdit && platforms.length === 0) ||
              channelsQuery.isLoading ||
              noChannelsFound ||
              !values.chatId.trim()
            }
            onClick={() => void submit()}
          >
            {pending ? <Spinner size="sm" className="text-current" /> : null}
            {isEdit ? 'Сохранить' : 'Привязать'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Платформа" required error={errors.platform}>
          <Select
            value={values.platform}
            disabled={isEdit || platforms.length <= 1}
            onValueChange={(value) => {
              const platform = value as MessengerConnectionFormValues['platform']
              setValues((prev) => ({
                ...prev,
                platform,
                chatId: '',
                chatTitle: '',
              }))
              setErrors({})
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите платформу" />
            </SelectTrigger>
            <SelectContent>
              {platforms.map((platform) => (
                <SelectItem key={platform} value={platform}>
                  {messengerPlatformLabel(platform)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Чат"
          required
          error={errors.chatId}
          description={
            channelsQuery.isLoading
              ? 'Загрузка чатов…'
              : noChannelsFound
                ? 'Добавьте бота в канал/группу или напишите ему в ЛС.'
                : selectedChannel
                  ? `ID: ${selectedChannel.external_chat_id}`
                  : 'Каналы, группы и личные чаты, где есть бот АПСС.'
          }
        >
          {channelsQuery.isLoading ? (
            <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground">
              <Spinner size="sm" />
              Загрузка…
            </div>
          ) : noChannelsFound ? (
            <div className="flex h-9 items-center rounded-md border border-dashed border-input bg-muted/30 px-3 text-sm text-muted-foreground">
              Не найдено чатов
            </div>
          ) : (
            <Select
              value={values.chatId || undefined}
              onValueChange={selectChannel}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите чат" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.external_chat_id}>
                    {channelLabel(channel)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label="Название" error={errors.chatTitle}>
          <Input
            value={values.chatTitle ?? ''}
            onChange={(event) => patch('chatTitle', event.target.value)}
            placeholder="Подставится из чата"
          />
        </FormField>
      </div>
    </Modal>
  )
}
