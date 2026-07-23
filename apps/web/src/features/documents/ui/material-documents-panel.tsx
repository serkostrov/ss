import { useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteDialog,
  EmptyState,
  ErrorState,
  FileCard,
  LoadingState,
  Spinner,
  UploadField,
} from '@shared/ui'
import {
  formatFileSize,
  MATERIAL_DOCUMENT_ALLOWED_MIME_TYPES,
  MATERIAL_DOCUMENT_MAX_BYTES,
} from '@shared/lib/files'
import type { MaterialDocument } from '@shared/api'

import {
  useDeleteMaterialDocumentMutation,
  useDownloadMaterialDocumentMutation,
  useMaterialDocuments,
  useMoveMaterialDocumentMutation,
  useUploadMaterialDocumentMutation,
} from '../model/use-documents'

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
  ...MATERIAL_DOCUMENT_ALLOWED_MIME_TYPES,
].join(',')

const MAX_SIZE_MB = Math.floor(MATERIAL_DOCUMENT_MAX_BYTES / (1024 * 1024))

type MaterialDocumentsPanelProps = {
  sectionId: string
  /** Admin: upload / delete / reorder. Cabinet: download only. */
  mode?: 'admin' | 'readonly'
}

export function MaterialDocumentsPanel({
  sectionId,
  mode = 'admin',
}: MaterialDocumentsPanelProps) {
  const query = useMaterialDocuments(sectionId)
  const uploadMutation = useUploadMaterialDocumentMutation(sectionId)
  const deleteMutation = useDeleteMaterialDocumentMutation(sectionId)
  const moveMutation = useMoveMaterialDocumentMutation(sectionId)
  const downloadMutation = useDownloadMaterialDocumentMutation()

  const [pendingDelete, setPendingDelete] = useState<MaterialDocument | null>(null)
  const [uploadError, setUploadError] = useState<string | undefined>()

  const docs = query.data ?? []
  const busy =
    uploadMutation.isPending ||
    deleteMutation.isPending ||
    moveMutation.isPending ||
    downloadMutation.isPending

  const onPickFiles = async (files: File[]) => {
    setUploadError(undefined)
    const file = files[0]
    if (!file) return
    try {
      await uploadMutation.mutateAsync({ file })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Ошибка загрузки')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Документы</CardTitle>
        <CardDescription>
          {mode === 'admin'
            ? `Загрузка в защищённое хранилище. До ${MAX_SIZE_MB} МБ, PDF, Office, изображения, ZIP.`
            : 'Файлы раздела. Скачивание по временной ссылке.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === 'admin' ? (
          <UploadField
            label="Загрузить файл"
            description="Файл сразу попадёт в список после успешной загрузки."
            accept={ACCEPT}
            maxSizeMb={MAX_SIZE_MB}
            disabled={busy}
            value={[]}
            onChange={(files) => void onPickFiles(files)}
            error={uploadError}
          />
        ) : null}

        {query.isLoading ? <LoadingState label="Загрузка документов…" /> : null}

        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : null}

        {!query.isLoading && !query.isError && docs.length === 0 ? (
          <EmptyState
            title="Документов пока нет"
            description={
              mode === 'admin'
                ? 'Загрузите первый файл для этого раздела.'
                : 'К разделу пока не прикреплены файлы.'
            }
          />
        ) : null}

        {docs.length > 0 ? (
          <ul className="space-y-2">
            {docs.map((doc, index) => (
              <li key={doc.id}>
                <FileCard
                  title={doc.title}
                  mimeType={doc.mime_type}
                  meta={formatFileSize(doc.file_size)}
                  busy={busy}
                  canMoveUp={index > 0}
                  canMoveDown={index < docs.length - 1}
                  onMoveUp={
                    mode === 'admin'
                      ? () => moveMutation.mutate({ id: doc.id, direction: 'up' })
                      : undefined
                  }
                  onMoveDown={
                    mode === 'admin'
                      ? () => moveMutation.mutate({ id: doc.id, direction: 'down' })
                      : undefined
                  }
                  onDownload={() => downloadMutation.mutate(doc)}
                  onRemove={mode === 'admin' ? () => setPendingDelete(doc) : undefined}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {uploadMutation.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" />
            Загрузка в Storage…
          </div>
        ) : null}
      </CardContent>

      <DeleteDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        entityName={pendingDelete?.title ?? ''}
        title="Удалить документ?"
        description="Файл будет удалён из базы и из Storage."
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return
          await deleteMutation.mutateAsync(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </Card>
  )
}
