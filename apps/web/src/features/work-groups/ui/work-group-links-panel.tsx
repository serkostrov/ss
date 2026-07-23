import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileUp, Link2, Pencil } from 'lucide-react'

import type { WorkGroupLink } from '@shared/api'
import {
  formatFileSize,
  isPreviewableMime,
  WORK_GROUP_FILE_ALLOWED_MIME_TYPES,
  WORK_GROUP_FILE_MAX_BYTES,
} from '@shared/lib/files'
import {
  Button,
  DeleteDialog,
  EmptyState,
  ErrorState,
  FileCard,
  FormField,
  Input,
  LoadingState,
  Modal,
  Spinner,
  Textarea,
  UploadField,
} from '@shared/ui'

import {
  useCreateWorkGroupExternalLinkMutation,
  useDeleteWorkGroupLinkMutation,
  useDownloadWorkGroupFileMutation,
  useMoveWorkGroupLinkMutation,
  usePreviewWorkGroupFileMutation,
  useUpdateWorkGroupLinkMutation,
  useUploadWorkGroupFileMutation,
  useWorkGroupLinks,
} from '../model/use-work-group-links'

const ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.zip',
  ...WORK_GROUP_FILE_ALLOWED_MIME_TYPES,
].join(',')

const MAX_MB = Math.floor(WORK_GROUP_FILE_MAX_BYTES / (1024 * 1024))

type WorkGroupLinksPanelProps = {
  workGroupId: string
}

export function WorkGroupLinksPanel({ workGroupId }: WorkGroupLinksPanelProps) {
  const query = useWorkGroupLinks(workGroupId)
  const createLink = useCreateWorkGroupExternalLinkMutation(workGroupId)
  const uploadFile = useUploadWorkGroupFileMutation(workGroupId)
  const updateLink = useUpdateWorkGroupLinkMutation(workGroupId)
  const deleteLink = useDeleteWorkGroupLinkMutation(workGroupId)
  const moveLink = useMoveWorkGroupLinkMutation(workGroupId)
  const downloadFile = useDownloadWorkGroupFileMutation()
  const previewFile = usePreviewWorkGroupFileMutation()

  const [linkOpen, setLinkOpen] = useState(false)
  const [editItem, setEditItem] = useState<WorkGroupLink | null>(null)
  const [deleteItem, setDeleteItem] = useState<WorkGroupLink | null>(null)
  const [preview, setPreview] = useState<{ link: WorkGroupLink; url: string } | null>(null)
  const [uploadError, setUploadError] = useState<string>()

  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string>()

  const links = query.data ?? []
  const busy =
    createLink.isPending ||
    uploadFile.isPending ||
    updateLink.isPending ||
    deleteLink.isPending ||
    moveLink.isPending ||
    downloadFile.isPending ||
    previewFile.isPending

  useEffect(() => {
    if (!linkOpen && !editItem) return
    if (editItem) {
      setTitle(editItem.title)
      setUrl(editItem.url ?? '')
      setDescription(editItem.description ?? '')
    } else {
      setTitle('')
      setUrl('')
      setDescription('')
    }
    setFormError(undefined)
  }, [linkOpen, editItem])

  const submitLink = async () => {
    setFormError(undefined)
    try {
      if (editItem) {
        await updateLink.mutateAsync({
          id: editItem.id,
          values: {
            title,
            description,
            url: editItem.file_url ? undefined : url,
          },
        })
        setEditItem(null)
        return
      }
      await createLink.mutateAsync({ title, url, description })
      setLinkOpen(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Ошибка сохранения')
    }
  }

  const onPickFiles = async (files: File[]) => {
    setUploadError(undefined)
    const file = files[0]
    if (!file) return
    try {
      await uploadFile.mutateAsync({ file })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Ошибка загрузки')
    }
  }

  const openPreview = async (link: WorkGroupLink) => {
    const signed = await previewFile.mutateAsync(link)
    setPreview({ link, url: signed })
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6" aria-labelledby="wg-links">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="wg-links" className="flex items-center gap-2 text-base font-semibold">
            <Link2 className="size-4" />
            Ссылки и файлы
          </h2>
          <p className="text-sm text-muted-foreground">
            Внешние URL и файлы в Storage (до {MAX_MB} МБ). Сортировка стрелками.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
          <ExternalLink className="size-4" />
          Добавить ссылку
        </Button>
      </div>

      <UploadField
        label="Загрузить файл"
        description="PDF, Office, изображения, ZIP"
        accept={ACCEPT}
        maxSizeMb={MAX_MB}
        disabled={busy}
        value={[]}
        onChange={(files) => void onPickFiles(files)}
        error={uploadError}
      />

      {uploadFile.isPending ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <FileUp className="size-4" />
          Загрузка в Storage…
        </div>
      ) : null}

      {query.isLoading ? <LoadingState label="Загрузка ссылок…" /> : null}
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
      ) : null}

      {!query.isLoading && !query.isError && links.length === 0 ? (
        <EmptyState
          title="Пока пусто"
          description="Добавьте внешнюю ссылку или загрузите файл."
          className="py-8"
        />
      ) : null}

      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((link, index) => {
            const isFile = Boolean(link.file_url)
            const meta = (() => {
              if (isFile) return formatFileSize(link.file_size)
              if (!link.url) return undefined
              try {
                return new URL(link.url).hostname
              } catch {
                return link.url
              }
            })()

            return (
              <li key={link.id}>
                <FileCard
                  title={link.title}
                  mimeType={isFile ? link.mime_type : 'Ссылка'}
                  meta={[meta, link.description].filter(Boolean).join(' · ') || undefined}
                  busy={busy}
                  canMoveUp={index > 0}
                  canMoveDown={index < links.length - 1}
                  onMoveUp={() => moveLink.mutate({ id: link.id, direction: 'up' })}
                  onMoveDown={() => moveLink.mutate({ id: link.id, direction: 'down' })}
                  onPreview={
                    isFile && isPreviewableMime(link.mime_type)
                      ? () => void openPreview(link)
                      : undefined
                  }
                  onDownload={
                    isFile
                      ? () => downloadFile.mutate(link)
                      : link.url
                        ? () => window.open(link.url!, '_blank', 'noopener,noreferrer')
                        : undefined
                  }
                  onRemove={() => setDeleteItem(link)}
                />
                <div className="mt-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => setEditItem(link)}
                  >
                    <Pencil className="size-3.5" />
                    Изменить
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Modal
        open={linkOpen || Boolean(editItem)}
        onOpenChange={(open) => {
          if (!open) {
            setLinkOpen(false)
            setEditItem(null)
          }
        }}
        title={editItem ? 'Редактировать' : 'Новая ссылка'}
        description={
          editItem?.file_url
            ? 'Для файлов можно изменить название и описание.'
            : 'Внешняя http/https ссылка.'
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLinkOpen(false)
                setEditItem(null)
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={createLink.isPending || updateLink.isPending}
              onClick={() => void submitLink()}
            >
              {createLink.isPending || updateLink.isPending ? (
                <Spinner size="sm" className="text-current" />
              ) : null}
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Название" required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
          </FormField>
          {!editItem?.file_url ? (
            <FormField label="URL" required>
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
              />
            </FormField>
          ) : null}
          <FormField label="Описание">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </FormField>
          {formError ? <p className="text-sm font-medium text-destructive">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        title={preview?.link.title ?? 'Файл'}
        description={
          preview
            ? `${preview.link.mime_type ?? 'файл'} · ${formatFileSize(preview.link.file_size)}`
            : undefined
        }
        className="max-w-4xl"
        footer={
          preview ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                Закрыть
              </Button>
              <Button type="button" onClick={() => downloadFile.mutate(preview.link)}>
                <Download className="size-4" />
                Скачать
              </Button>
            </>
          ) : null
        }
      >
        {preview ? (
          <div className="min-h-[40vh]">
            {preview.link.mime_type?.startsWith('image/') ? (
              <img
                src={preview.url}
                alt={preview.link.title}
                className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md object-contain"
              />
            ) : preview.link.mime_type === 'application/pdf' ? (
              <iframe
                title={preview.link.title}
                src={preview.url}
                className="h-[min(70vh,32rem)] w-full rounded-md border"
              />
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">Предпросмотр ограничен. Откройте или скачайте.</p>
                <Button asChild variant="outline" size="sm">
                  <a href={preview.url} target="_blank" rel="noreferrer">
                    Открыть во вкладке
                  </a>
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <DeleteDialog
        open={Boolean(deleteItem)}
        onOpenChange={(open) => {
          if (!open) setDeleteItem(null)
        }}
        entityName={deleteItem?.title ?? ''}
        title="Удалить запись?"
        description={
          deleteItem?.file_url
            ? 'Файл будет удалён из базы и из Storage.'
            : 'Внешняя ссылка будет удалена.'
        }
        loading={deleteLink.isPending}
        onConfirm={async () => {
          if (!deleteItem) return
          await deleteLink.mutateAsync(deleteItem.id)
          setDeleteItem(null)
        }}
      />
    </section>
  )
}
