import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

import { routes } from '@shared/config'
import {
  Button,
  ErrorState,
  MarkdownViewer,
  PageHeader,
  Skeleton,
} from '@shared/ui'

import { useCabinetMaterialBySlug } from '../model/use-cabinet-materials'
import { CabinetDocumentsPanel } from './cabinet-documents-panel'

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Загрузка материала">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="space-y-3 rounded-lg border p-4 sm:p-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

export function CabinetMaterialDetailsPanel() {
  const { slug } = useParams<{ slug: string }>()
  const query = useCabinetMaterialBySlug(slug)

  if (query.isLoading && !query.data) {
    return <DetailSkeleton />
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Не удалось загрузить материал"
        error={query.error}
        onRetry={() => void query.refetch()}
        action={
          <Button asChild variant="outline">
            <Link to={routes.cabinet.materials}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const section = query.data
  if (!section) {
    return (
      <ErrorState
        title="Материал недоступен"
        description="Раздел не найден, не опубликован или закрыт для уровня вашей компании."
        action={
          <Button asChild variant="outline">
            <Link to={routes.cabinet.materials}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const contentReady = Boolean(section.content?.trim())
  const contentPending = query.isFetching && !contentReady

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit gap-1">
          <Link to={routes.cabinet.materials}>
            <ChevronLeft className="size-4" />
            Назад
          </Link>
        </Button>

        <PageHeader title={section.title} description={section.description || undefined} />
      </div>
      {contentPending ? (
        <div className="space-y-3 rounded-lg border bg-card p-4 sm:p-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : contentReady ? (
        <article className="rounded-lg border bg-card p-4 sm:p-6">
          <MarkdownViewer content={section.content ?? ''} />
        </article>
      ) : (
        <p className="text-sm text-muted-foreground">Содержание пока не заполнено.</p>
      )}

      <CabinetDocumentsPanel sectionId={section.id} />
    </div>
  )
}
