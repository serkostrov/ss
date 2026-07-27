import { ImageIcon, Paperclip, SendHorizontal, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import type { MessageSource } from '@shared/api'
import { Button, IconButton, Spinner, Textarea } from '@shared/ui'
import { cn } from '@shared/lib/utils'
import { notify } from '@shared/lib/notify'

import { useSendMessengerMessageMutation } from '../model/use-send-message'

type ChatComposerProps = {
  workGroupId: string
  platform: MessageSource
  chatId: string
  className?: string
  onSent?: () => void
}

type PendingFile = {
  id: string
  file: File
  previewUrl?: string
}

const MAX_FILES = 5
const MAX_FILE_MB = 8

function formatSize(size: number): string {
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

export function ChatComposer({
  workGroupId,
  platform,
  chatId,
  className,
  onSent,
}: ChatComposerProps) {
  const photoInputId = useId()
  const fileInputId = useId()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const sendMutation = useSendMessengerMessageMutation(workGroupId)

  useEffect(() => {
    setText('')
    setFiles((prev) => {
      for (const item of prev) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
      return []
    })
  }, [workGroupId, platform, chatId])

  useEffect(() => {
    return () => {
      setFiles((prev) => {
        for (const item of prev) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        }
        return prev
      })
    }
  }, [])

  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  useEffect(() => {
    resizeTextarea()
  }, [text])

  const addFiles = (list: FileList | null, preferImages: boolean) => {
    if (!list?.length) return
    const next: PendingFile[] = []
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        notify.error(`Файл больше ${MAX_FILE_MB} МБ: ${file.name}`)
        continue
      }
      if (preferImages && !file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        continue
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      })
    }
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES))
  }

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((item) => item.id !== id)
    })
  }

  const canSend = (text.trim().length > 0 || files.length > 0) && !sendMutation.isPending
  const maxBlocksAttachments = platform === 'max'

  const submit = async () => {
    if (!canSend) return
    if (platform === 'max' && files.length > 0) {
      notify.error('Для Max пока можно отправлять только текст')
      return
    }
    await sendMutation.mutateAsync({
      platform,
      chatId,
      workGroupId,
      text: text.trim(),
      files: files.map((item) => item.file),
    })
    setText('')
    setFiles((prev) => {
      for (const item of prev) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
      return []
    })
    onSent?.()
    textareaRef.current?.focus()
  }

  return (
    <div className={cn('border-t bg-background/95 px-3 py-3 backdrop-blur sm:px-4', className)}>
      {files.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((item) => (
            <li
              key={item.id}
              className="group relative flex max-w-[11rem] items-center gap-2 rounded-xl border bg-muted/40 p-1.5 pr-8"
            >
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="" className="size-10 rounded-lg object-cover" />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-lg bg-background text-muted-foreground">
                  <Paperclip className="size-4" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{item.file.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatSize(item.file.size)}</p>
              </div>
              <button
                type="button"
                className="absolute top-1 right-1 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label="Убрать файл"
                onClick={() => removeFile(item.id)}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {maxBlocksAttachments ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Для Max пока только текст. Фото и файлы доступны в Telegram.
        </p>
      ) : null}

      <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm">
        <div className="flex shrink-0 gap-0.5 pb-0.5">
          <input
            id={photoInputId}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            disabled={sendMutation.isPending || maxBlocksAttachments}
            onChange={(event) => {
              addFiles(event.target.files, true)
              event.target.value = ''
            }}
          />
          <input
            id={fileInputId}
            type="file"
            multiple
            className="sr-only"
            disabled={sendMutation.isPending || maxBlocksAttachments}
            onChange={(event) => {
              addFiles(event.target.files, false)
              event.target.value = ''
            }}
          />
          <IconButton
            label="Фото или видео"
            variant="ghost"
            disabled={sendMutation.isPending || maxBlocksAttachments || files.length >= MAX_FILES}
            onClick={() => document.getElementById(photoInputId)?.click()}
          >
            <ImageIcon className="size-4" />
          </IconButton>
          <IconButton
            label="Файл"
            variant="ghost"
            disabled={sendMutation.isPending || maxBlocksAttachments || files.length >= MAX_FILES}
            onClick={() => document.getElementById(fileInputId)?.click()}
          >
            <Paperclip className="size-4" />
          </IconButton>
        </div>

        <Textarea
          ref={textareaRef}
          value={text}
          rows={1}
          placeholder="Написать сообщение от бота…"
          disabled={sendMutation.isPending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          className="max-h-40 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
        />

        <Button
          type="button"
          size="icon"
          className="mb-0.5 size-10 shrink-0 rounded-xl"
          disabled={!canSend || (maxBlocksAttachments && files.length > 0)}
          onClick={() => void submit()}
          aria-label="Отправить"
        >
          {sendMutation.isPending ? (
            <Spinner size="sm" className="text-current" />
          ) : (
            <SendHorizontal className="size-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
