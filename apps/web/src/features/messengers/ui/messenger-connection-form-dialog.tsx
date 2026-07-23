import { useEffect, useState } from 'react'

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
  Textarea,
} from '@shared/ui'

import {
  botStatusLabel,
  messengerConnectionFormSchema,
  messengerPlatformLabel,
  type MessengerConnectionFormValues,
} from '../model/schemas'
import {
  availablePlatforms,
  toMessengerConnectionInput,
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
    botStatus: connection?.bot_status ?? 'pending',
    lastError: connection?.last_error ?? '',
  }
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

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(connection, defaultPlatform))
    setErrors({})
  }, [open, connection, defaultPlatform])

  const pending = upsertMutation.isPending || updateMutation.isPending

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
      description="Без ID чата бот не сможет писать в группу. Работу бота выполняет worker."
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
            onValueChange={(value) =>
              patch('platform', value as MessengerConnectionFormValues['platform'])
            }
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
          label="ID чата"
          required
          error={errors.chatId}
          description={
            values.platform === 'telegram'
              ? 'Telegram: добавьте @userinfobot или @getidsbot в группу — бот пришлёт chat id (часто вида -100…). Либо перешлите сообщение из группы боту @RawDataBot.'
              : 'Max: откройте карточку чата/группы в приложении или веб-кабинете Max для бизнеса — скопируйте идентификатор чата (chat_id) из свойств беседы.'
          }
        >
          <Input
            value={values.chatId}
            onChange={(event) => patch('chatId', event.target.value)}
            placeholder={values.platform === 'telegram' ? '-1001234567890' : 'chat_id'}
            autoFocus
          />
        </FormField>

        <FormField label="Название чата" error={errors.chatTitle}>
          <Input
            value={values.chatTitle ?? ''}
            onChange={(event) => patch('chatTitle', event.target.value)}
            placeholder="Рабочая группа АПСС"
          />
        </FormField>

        <FormField label="Статус подключения" error={errors.botStatus}>
          <Select
            value={values.botStatus}
            onValueChange={(value) =>
              patch('botStatus', value as MessengerConnectionFormValues['botStatus'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['pending', 'connected', 'error'] as const).map((status) => (
                <SelectItem key={status} value={status}>
                  {botStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Последняя ошибка"
          error={errors.lastError}
          description={
            values.botStatus === 'error'
              ? 'Обязательно при статусе «Ошибка»'
              : 'Очищается при статусе «Подключено»'
          }
        >
          <Textarea
            value={values.lastError ?? ''}
            onChange={(event) => patch('lastError', event.target.value)}
            rows={3}
            placeholder="Текст ошибки от бота или привязки…"
          />
        </FormField>
      </div>
    </Modal>
  )
}
