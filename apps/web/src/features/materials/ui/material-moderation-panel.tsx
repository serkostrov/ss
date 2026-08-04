import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { MaterialModerationStatus } from '@shared/api'
import { routes } from '@shared/config'
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@shared/ui'
import { MaterialAccessBadges } from '@features/material-access'

import {
  useMaterialSectionsForModeration,
  useReviewMaterialSectionMutation,
} from '../model/use-materials'

export function MaterialModerationPanel() {
  const [status, setStatus] = useState<MaterialModerationStatus | 'all'>('pending')
  const query = useMaterialSectionsForModeration(status)
  const review = useReviewMaterialSectionMutation()
  const sections = query.data ?? []

  if (query.isLoading && !query.data) {
    return <LoadingState label="Загрузка материалов…" />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as MaterialModerationStatus | 'all')}
        >
          <SelectTrigger aria-label="Статус материалов">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">На рассмотрении</SelectItem>
            <SelectItem value="approved">Одобренные</SelectItem>
            <SelectItem value="rejected">Отклонённые</SelectItem>
            <SelectItem value="all">Все</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          title="Заявок нет"
          description="Материалы, отправленные на выпуск, появятся здесь."
        />
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={routes.admin.material(section.id)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {section.title}
                    </Link>
                    <StatusBadge status={section.moderation_status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Категория: {section.category?.name ?? 'не указана'}
                  </p>
                  {section.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {section.description}
                    </p>
                  ) : null}
                  <div className="mt-2">
                    <MaterialAccessBadges levels={section.levels} />
                  </div>
                  {section.review_note ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Комментарий: {section.review_note}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(section.updated_at).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>

              {section.moderation_status === 'pending' ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        id: section.id,
                        approve: false,
                      })
                    }
                  >
                    Отклонить
                  </Button>
                  <Button
                    type="button"
                    disabled={review.isPending || section.level_ids.length === 0}
                    onClick={() =>
                      review.mutate({
                        id: section.id,
                        approve: true,
                      })
                    }
                  >
                    Подтвердить выпуск
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
