import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import type { Poll } from '@shared/api'
import { MaterialLevelsPicker } from '@features/material-access'
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
  pollFormSchema,
  toDatetimeLocalValue,
  voteModeLabel,
  type PollFormValues,
} from '../model/schemas'
import {
  toPollInput,
  useCreatePollMutation,
  useLevelsForPollAcl,
  useUpdatePollMutation,
} from '../model/use-polls'

type PollFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  poll?: Poll | null
  onCreated?: (poll: Poll) => void
}

function emptyOptions(): string[] {
  return ['', '']
}

function toFormValues(poll?: Poll | null): PollFormValues {
  return {
    title: poll?.title ?? '',
    description: poll?.description ?? '',
    voteMode: poll?.vote_mode ?? 'per_company',
    startsAt: toDatetimeLocalValue(poll?.starts_at),
    endsAt: toDatetimeLocalValue(poll?.ends_at),
    status: poll?.status ?? 'draft',
    options: poll?.options?.length
      ? poll.options.map((item) => item.text)
      : emptyOptions(),
    levelIds: poll?.level_ids ?? [],
  }
}

export function PollFormDialog({
  open,
  onOpenChange,
  poll,
  onCreated,
}: PollFormDialogProps) {
  const isEdit = Boolean(poll)
  const levels = useLevelsForPollAcl()
  const createMutation = useCreatePollMutation()
  const updateMutation = useUpdatePollMutation()
  const [values, setValues] = useState<PollFormValues>(() => toFormValues(poll))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(toFormValues(poll))
    setErrors({})
  }, [open, poll])

  const pending = createMutation.isPending || updateMutation.isPending
  const voteModeLocked = Boolean(poll && poll.votes_count > 0)

  const patch = <K extends keyof PollFormValues>(key: K, value: PollFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const patchOption = (index: number, text: string) => {
    setValues((prev) => {
      const options = [...prev.options]
      options[index] = text
      return { ...prev, options }
    })
    setErrors((prev) => {
      const next = { ...prev }
      delete next.options
      return next
    })
  }

  const addOption = () => {
    setValues((prev) => ({ ...prev, options: [...prev.options, ''] }))
  }

  const removeOption = (index: number) => {
    setValues((prev) => {
      if (prev.options.length <= 2) return prev
      return { ...prev, options: prev.options.filter((_, i) => i !== index) }
    })
  }

  const submit = async () => {
    const parsed = pollFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    const payload = toPollInput(parsed.data)

    if (isEdit && poll) {
      await updateMutation.mutateAsync({ id: poll.id, values: payload })
      onOpenChange(false)
      return
    }

    const created = await createMutation.mutateAsync(payload)
    onOpenChange(false)
    onCreated?.(created)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать голосование' : 'Новое голосование'}
      description="Варианты ответа, период, режим учёта голосов и уровни участников."
      className="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner size="sm" className="text-current" /> : null}
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Название" required error={errors.title}>
          <Input
            value={values.title}
            onChange={(event) => patch('title', event.target.value)}
            autoFocus
          />
        </FormField>

        <FormField label="Описание" error={errors.description}>
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => patch('description', event.target.value)}
            rows={3}
          />
        </FormField>

        <FormField
          label="Режим голосования"
          error={errors.voteMode}
          description={
            voteModeLocked
              ? 'Режим нельзя менять после первых голосов'
              : undefined
          }
        >
          <Select
            value={values.voteMode}
            disabled={voteModeLocked}
            onValueChange={(value) =>
              patch('voteMode', value as PollFormValues['voteMode'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per_company">{voteModeLabel('per_company')}</SelectItem>
              <SelectItem value="per_representative">
                {voteModeLabel('per_representative')}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Начало" error={errors.startsAt}>
            <Input
              type="datetime-local"
              value={values.startsAt ?? ''}
              onChange={(event) => patch('startsAt', event.target.value)}
            />
          </FormField>
          <FormField label="Окончание" error={errors.endsAt}>
            <Input
              type="datetime-local"
              value={values.endsAt ?? ''}
              onChange={(event) => patch('endsAt', event.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Статус" error={errors.status}>
          <Select
            value={values.status}
            onValueChange={(value) =>
              patch('status', value as PollFormValues['status'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Черновик</SelectItem>
              <SelectItem value="active">Активно</SelectItem>
              <SelectItem value="closed">Закрыто</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Варианты ответа <span className="text-destructive">*</span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={addOption}>
              <Plus className="size-4" />
              Добавить
            </Button>
          </div>
          <div className="space-y-2">
            {values.options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={option}
                  placeholder={`Вариант ${index + 1}`}
                  onChange={(event) => patchOption(index, event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive"
                  disabled={values.options.length <= 2}
                  onClick={() => removeOption(index)}
                  aria-label="Удалить вариант"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          {errors.options ? (
            <p className="text-sm font-medium text-destructive">{errors.options}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Уровни участников</p>
          <p className="text-xs text-muted-foreground">
            Кто сможет голосовать после активации
          </p>
          <MaterialLevelsPicker
            levels={levels.data ?? []}
            value={values.levelIds}
            onChange={(levelIds) => patch('levelIds', levelIds)}
            disabled={pending || levels.isLoading}
            error={errors.levelIds}
          />
        </div>
      </div>
    </Modal>
  )
}
