import { useState } from 'react'

import type { MaterialModerationStatus } from '@shared/api'
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

import {
  useMaterialCategoriesForModeration,
  useReviewMaterialCategoryMutation,
} from '../model/use-material-categories'

export function MaterialCategoryModerationPanel() {
  const [status, setStatus] = useState<MaterialModerationStatus | 'all'>('pending')
  const query = useMaterialCategoriesForModeration(status)
  const review = useReviewMaterialCategoryMutation()
  const categories = query.data ?? []

  if (query.isLoading && !query.data) {
    return <LoadingState label="Загрузка категорий…" />
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
          <SelectTrigger aria-label="Статус категорий материалов">
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

      {categories.length === 0 ? (
        <EmptyState
          title="Заявок нет"
          description="Новые категории материалов появятся здесь до подтверждения."
        />
      ) : (
        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{category.name}</p>
                    <StatusBadge status={category.moderation_status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">slug: {category.slug}</p>
                  {category.review_note ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Комментарий: {category.review_note}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(category.created_at).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>

              {category.moderation_status === 'pending' ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        id: category.id,
                        approve: false,
                      })
                    }
                  >
                    Отклонить
                  </Button>
                  <Button
                    type="button"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        id: category.id,
                        approve: true,
                      })
                    }
                  >
                    Подтвердить
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
