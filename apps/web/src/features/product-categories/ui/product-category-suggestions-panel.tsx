import { useState } from 'react'

import type { ProductCategorySuggestionStatus } from '@shared/api'
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
  useProductCategories,
  useProductCategorySuggestions,
  useReviewProductCategorySuggestionMutation,
} from '../model/use-product-categories'

export function ProductCategorySuggestionsPanel() {
  const [status, setStatus] = useState<ProductCategorySuggestionStatus | 'all'>('pending')
  const [categoryBySuggestion, setCategoryBySuggestion] = useState<Record<string, string>>({})
  const query = useProductCategorySuggestions(status)
  const categories = useProductCategories()
  const review = useReviewProductCategorySuggestionMutation()
  const suggestions = query.data ?? []

  if (query.isLoading && !query.data) {
    return <LoadingState label="Загрузка предложений…" />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(value as ProductCategorySuggestionStatus | 'all')
          }
        >
          <SelectTrigger aria-label="Статус предложений">
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

      {suggestions.length === 0 ? (
        <EmptyState
          title="Предложений нет"
          description="Предложенные участниками категории появятся здесь."
        />
      ) : (
        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{suggestion.suggested_name}</p>
                    <StatusBadge status={suggestion.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {suggestion.company?.name ?? 'Компания'} ·{' '}
                    {suggestion.product?.name ?? 'Продукция'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {suggestion.suggestedBy?.full_name ??
                      suggestion.suggestedBy?.email ??
                      'Участник'}
                    {' · '}
                    {new Date(suggestion.created_at).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>

              {suggestion.status === 'pending' ? (
                <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center">
                  <Select
                    value={categoryBySuggestion[suggestion.id] ?? 'new'}
                    onValueChange={(value) =>
                      setCategoryBySuggestion((current) => ({
                        ...current,
                        [suggestion.id]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="sm:max-w-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">
                        Создать «{suggestion.suggested_name}»
                      </SelectItem>
                      {(categories.data ?? []).map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          Привязать к «{category.name}»
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2 sm:ml-auto">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={review.isPending}
                      onClick={() =>
                        review.mutate({
                          id: suggestion.id,
                          approve: false,
                        })
                      }
                    >
                      Отклонить
                    </Button>
                    <Button
                      type="button"
                      disabled={review.isPending}
                      onClick={() => {
                        const selected = categoryBySuggestion[suggestion.id]
                        review.mutate({
                          id: suggestion.id,
                          approve: true,
                          categoryId: selected && selected !== 'new' ? selected : null,
                        })
                      }}
                    >
                      Одобрить
                    </Button>
                  </div>
                </div>
              ) : suggestion.review_note ? (
                <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                  Комментарий: {suggestion.review_note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
