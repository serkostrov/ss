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
}): string {
  const title = channel.title?.trim()
  const username = channel.username?.trim()
  if (title && username) return `${title} (@${username})`
  if (title) return title
  if (username) return `@${username}`
  return channel.external_chat_id
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
  const catalogEmpty = !channelsQuery.isLoading && catalogFromApi.length === 0
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
        title: values.chatTitle || 'Текущий канал',
        username: null,
        chat_kind: 'channel',
        is_active: true,
        last_seen_at: null,
        created_at: '',
        updated_at: '',
      })
    }
    return list
  }, [catalogFromApi, values.chatId, values.chatTitle, values.platform])

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
      title={isEdit ? 'Изменить привязку' : 'Привязать канал'}
      description="Выберите канал, в котором уже есть бот АПСС. Статус подключения обновляет worker."
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            disabled={pending || (!isEdit && platforms.length === 0)}
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
            disabled={isEdit || Boolean(preferredPlatform) || platforms.length === 0}
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
          label="Канал"
          required
          error={errors.chatId}
          description={
            channelsQuery.isLoading
              ? 'Загрузка каналов…'
              : catalogEmpty
                ? 'Список пуст. Нужен канал (не группа): добавьте бота админом после запуска worker или введите chat_id.'
                : selectedChannel
                  ? `ID: ${selectedChannel.external_chat_id}`
                  : 'Каналы, где присутствует бот.'
          }
        >
          {catalogEmpty ? (
            <Input
              value={values.chatId}
              onChange={(event) => patch('chatId', event.target.value.trim())}
              placeholder={values.platform === 'telegram' ? '-100…' : 'chat_id'}
              autoFocus
            />
          ) : (
            <Select
              value={values.chatId || undefined}
              onValueChange={selectChannel}
              disabled={channelsQuery.isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите канал" />
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
            placeholder="Подставится из канала"
          />
        </FormField>
      </div>
    </Modal>
  )
}
