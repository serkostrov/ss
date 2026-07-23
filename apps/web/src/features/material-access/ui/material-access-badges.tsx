import type { MaterialLevelRef } from '@shared/api'
import { Badge } from '@shared/ui'
import { cn } from '@shared/lib/utils'

type MaterialAccessBadgesProps = {
  levels: MaterialLevelRef[]
  emptyLabel?: string
  className?: string
  maxVisible?: number
}

export function MaterialAccessBadges({
  levels,
  emptyLabel = 'Нет доступа',
  className,
  maxVisible = 4,
}: MaterialAccessBadgesProps) {
  if (!levels.length) {
    return <span className={cn('text-sm text-muted-foreground', className)}>{emptyLabel}</span>
  }

  const visible = levels.slice(0, maxVisible)
  const rest = levels.length - visible.length

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {visible.map((level) => (
        <Badge
          key={level.id}
          variant={level.is_active ? 'secondary' : 'outline'}
          className="font-normal"
        >
          {level.name}
        </Badge>
      ))}
      {rest > 0 ? (
        <Badge variant="outline" className="font-normal">
          +{rest}
        </Badge>
      ) : null}
    </div>
  )
}
