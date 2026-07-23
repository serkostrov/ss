import { useState } from 'react'
import { Download, FileText } from 'lucide-react'

import type { MaterialDocument } from '@shared/api'
import { formatFileSize } from '@shared/lib/files'
import {
  Button,
  EmptyState,
  ErrorState,
  FileCard,
  Modal,
  Skeleton,
  Spinner,
} from '@shared/ui'
import {
  useDownloadMaterialDocumentMutation,
  useMaterialDocuments,
  usePreviewMaterialDocumentMutation,
} from '@features/documents'

function isPreviewable(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType === 'text/plain'
}

type CabinetDocumentsPanelProps = {
  sectionId: string
}

export function CabinetDocumentsPanel({ sectionId }: CabinetDocumentsPanelProps) {
  const query = useMaterialDocuments(sectionId)
  const downloadMutation = useDownloadMaterialDocumentMutation()
  const previewMutation = usePreviewMaterialDocumentMutation()

  const [preview, setPreview] = useState<{
    doc: MaterialDocument
    url: string
  } | null>(null)

  const docs = query.data ?? []
  const busyId =
    (downloadMutation.isPending && downloadMutation.variables?.id) ||
    (previewMutation.isPending && previewMutation.variables?.id) ||
    null

  const openPreview = async (doc: MaterialDocument) => {
    const url = await previewMutation.mutateAsync(doc)
    setPreview({ doc, url })
  }

  return (
    <section className="space-y-4" aria-labelledby="cabinet-docs-heading">
      <div>
        <h2 id="cabinet-docs-heading" className="text-base font-semibold">
          Документы
        </h2>
        <p className="text-sm text-muted-foreground">
          Просмотр и скачивание по временной защищённой ссылке.
        </p>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Загрузка документов">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-lg border p-4">
              <Skeleton className="size-10 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState
          title="Не удалось загрузить документы"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Документов нет"
          description="К этому разделу пока не прикреплены файлы."
          className="py-8"
        />
      ) : null}

      {docs.length > 0 ? (
        <ul className="space-y-2">
          {docs.map((doc) => {
            const rowBusy = busyId === doc.id
            return (
              <li key={doc.id}>
                <FileCard
                  title={doc.title}
                  mimeType={doc.mime_type}
                  meta={formatFileSize(doc.file_size)}
                  busy={rowBusy}
                  onPreview={
                    isPreviewable(doc.mime_type) ? () => void openPreview(doc) : undefined
                  }
                  onDownload={() => downloadMutation.mutate(doc)}
                />
              </li>
            )
          })}
        </ul>
      ) : null}

      <Modal
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        title={preview?.doc.title ?? 'Документ'}
        description={
          preview
            ? `${preview.doc.mime_type ?? 'файл'} · ${formatFileSize(preview.doc.file_size)}`
            : undefined
        }
        className="max-w-4xl"
        footer={
          preview ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                Закрыть
              </Button>
              <Button
                type="button"
                disabled={downloadMutation.isPending}
                onClick={() => downloadMutation.mutate(preview.doc)}
              >
                {downloadMutation.isPending ? (
                  <Spinner size="sm" className="text-current" />
                ) : (
                  <Download className="size-4" />
                )}
                Скачать
              </Button>
            </>
          ) : null
        }
      >
        {preview ? (
          <div className="min-h-[40vh]">
            {preview.doc.mime_type?.startsWith('image/') ? (
              <img
                src={preview.url}
                alt={preview.doc.title}
                className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md object-contain"
              />
            ) : preview.doc.mime_type === 'application/pdf' ? (
              <iframe
                title={preview.doc.title}
                src={preview.url}
                className="h-[min(70vh,32rem)] w-full rounded-md border"
              />
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Предпросмотр для этого типа файла ограничен. Откройте во вкладке или скачайте.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href={preview.url} target="_blank" rel="noreferrer">
                    Открыть в новой вкладке
                  </a>
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
