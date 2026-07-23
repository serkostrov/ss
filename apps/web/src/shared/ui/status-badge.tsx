import { Badge, type BadgeProps } from './badge'

export type StatusTone = 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'secondary'

const STATUS_PRESETS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'На рассмотрении', tone: 'warning' },
  confirmed: { label: 'Подтверждён', tone: 'success' },
  blocked: { label: 'Заблокирован', tone: 'destructive' },
  active: { label: 'Активен', tone: 'success' },
  suspended: { label: 'Приостановлен', tone: 'warning' },
  archived: { label: 'Архив', tone: 'muted' },
  paused: { label: 'Пауза', tone: 'warning' },
  draft: { label: 'Черновик', tone: 'muted' },
  closed: { label: 'Закрыто', tone: 'secondary' },
  connected: { label: 'Подключено', tone: 'success' },
  error: { label: 'Ошибка', tone: 'destructive' },
  received: { label: 'Получено', tone: 'secondary' },
  stored: { label: 'Сохранено', tone: 'secondary' },
  relayed: { label: 'Переслано', tone: 'success' },
  failed: { label: 'Сбой', tone: 'destructive' },
  sent: { label: 'Отправлено', tone: 'success' },
  admin: { label: 'Админ', tone: 'default' },
  member: { label: 'Участник', tone: 'secondary' },
}

type StatusBadgeProps = {
  status: string
  label?: string
  tone?: StatusTone
  className?: string
}

function mapToneToVariant(tone: StatusTone): BadgeProps['variant'] {
  if (tone === 'success') return 'success'
  if (tone === 'warning') return 'warning'
  if (tone === 'destructive') return 'destructive'
  if (tone === 'muted') return 'muted'
  if (tone === 'secondary') return 'secondary'
  return 'default'
}

function StatusBadge({ status, label, tone, className }: StatusBadgeProps) {
  const preset = STATUS_PRESETS[status]
  const resolvedTone = tone ?? preset?.tone ?? 'secondary'
  const resolvedLabel = label ?? preset?.label ?? status

  return (
    <Badge variant={mapToneToVariant(resolvedTone)} className={className}>
      {resolvedLabel}
    </Badge>
  )
}

export { StatusBadge, STATUS_PRESETS }
export type { StatusBadgeProps }
