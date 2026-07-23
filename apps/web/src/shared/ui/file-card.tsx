import { ArrowDown, ArrowUp, Download, Eye, FileText, Trash2 } from 'lucide-react'

import { cn } from '@shared/lib/utils'
import { Button } from './button'
import { Card, CardContent } from './card'

type FileCardProps = {
  title: string
  meta?: string
  mimeType?: string | null
  href?: string
  onDownload?: () => void
  onPreview?: () => void
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  busy?: boolean
  className?: string
}

function FileCard({
  title,
  meta,
  mimeType,
  href,
  onDownload,
  onPreview,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  busy,
  className,
}: FileCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[mimeType, meta].filter(Boolean).join(' · ') || 'Файл'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onMoveUp || onMoveDown ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={busy || !canMoveUp || !onMoveUp}
                onClick={onMoveUp}
                aria-label="Выше"
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={busy || !canMoveDown || !onMoveDown}
                onClick={onMoveDown}
                aria-label="Ниже"
              >
                <ArrowDown className="size-3.5" />
              </Button>
            </>
          ) : null}
          {onPreview ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={busy}
              onClick={onPreview}
              aria-label="Просмотреть"
            >
              <Eye className="size-4" />
            </Button>
          ) : null}
          {href ? (
            <Button asChild variant="ghost" size="icon" className="size-8">
              <a href={href} target="_blank" rel="noreferrer" download aria-label="Скачать">
                <Download className="size-4" />
              </a>
            </Button>
          ) : onDownload ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={busy}
              onClick={onDownload}
              aria-label="Скачать"
            >
              <Download className="size-4" />
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              disabled={busy}
              onClick={onRemove}
              aria-label="Удалить"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export { FileCard }
export type { FileCardProps }
