import * as React from 'react'
import { Bold, Eye, Heading2, Italic, List, ListOrdered, Pencil } from 'lucide-react'

import { cn } from '@shared/lib/utils'
import { Button } from './button'
import { MarkdownViewer } from './markdown-viewer'
import { Textarea } from './textarea'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minRows?: number
  error?: string
}

/**
 * Lightweight Markdown editor with toolbar + live preview.
 * Uses react-markdown for preview (no TipTap dependency).
 */
function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Текст в формате Markdown…',
  className,
  minRows = 14,
  error,
}: MarkdownEditorProps) {
  const [mode, setMode] = React.useState<'edit' | 'preview'>('edit')
  const ref = React.useRef<HTMLTextAreaElement>(null)

  const wrapSelection = (before: string, after = before) => {
    const el = ref.current
    if (!el) {
      onChange(`${value}${before}${after}`)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || 'текст'
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const cursor = start + before.length + selected.length + after.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  const insertLinePrefix = (prefix: string) => {
    const el = ref.current
    if (!el) {
      onChange(`${value}\n${prefix}`)
      return
    }
    const start = el.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const cursor = start + prefix.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className={cn('overflow-hidden rounded-md border', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-1.5">
        <Button
          type="button"
          size="sm"
          variant={mode === 'edit' ? 'secondary' : 'ghost'}
          onClick={() => setMode('edit')}
        >
          <Pencil className="size-3.5" />
          Редактор
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'preview' ? 'secondary' : 'ghost'}
          onClick={() => setMode('preview')}
        >
          <Eye className="size-3.5" />
          Превью
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={mode !== 'edit'}
          onClick={() => wrapSelection('**')}
          aria-label="Жирный"
        >
          <Bold className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={mode !== 'edit'}
          onClick={() => wrapSelection('*')}
          aria-label="Курсив"
        >
          <Italic className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={mode !== 'edit'}
          onClick={() => insertLinePrefix('## ')}
          aria-label="Заголовок"
        >
          <Heading2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={mode !== 'edit'}
          onClick={() => insertLinePrefix('- ')}
          aria-label="Список"
        >
          <List className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          disabled={mode !== 'edit'}
          onClick={() => insertLinePrefix('1. ')}
          aria-label="Нумерованный список"
        >
          <ListOrdered className="size-3.5" />
        </Button>
      </div>

      {mode === 'edit' ? (
        <Textarea
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-[280px] rounded-none border-0 focus-visible:ring-0"
          style={{ minHeight: `${minRows * 1.5}rem` }}
        />
      ) : (
        <div className="min-h-[280px] bg-background p-4">
          {value.trim() ? (
            <MarkdownViewer content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Пока нечего показывать.</p>
          )}
        </div>
      )}

      {error ? <p className="border-t px-3 py-2 text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  )
}

export { MarkdownEditor }
export type { MarkdownEditorProps }
