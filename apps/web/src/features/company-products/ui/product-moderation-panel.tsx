import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

import type { ProductModerationStatus } from '@shared/api'
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
  useCompanyProductsForModeration,
  useReviewCompanyProductMutation,
} from '../model/use-company-products'

export function ProductModerationPanel() {
  const [status, setStatus] = useState<ProductModerationStatus | 'all'>('pending')
  const query = useCompanyProductsForModeration(status)
  const review = useReviewCompanyProductMutation()
  const products = query.data ?? []

  if (query.isLoading && !query.data) {
    return <LoadingState label="Загрузка продукции…" />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ProductModerationStatus | 'all')}
        >
          <SelectTrigger aria-label="Статус продукции">
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

      {products.length === 0 ? (
        <EmptyState
          title="Заявок нет"
          description="Новая и изменённая продукция участников появится здесь."
        />
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <div key={product.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {product.proposed_okpd_code
                        ? `${product.proposed_okpd_code} — ${product.proposed_okpd_title ?? product.name}`
                        : product.okpd
                          ? `${product.okpd.code} — ${product.okpd.title}`
                          : product.name}
                    </p>
                    <StatusBadge status={product.moderation_status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {product.company?.name ?? 'Компания'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Примечание:{' '}
                    {product.note?.name ??
                      (product.proposed_note_name
                        ? `${product.proposed_note_name} (предложение)`
                        : 'не указано')}
                  </p>
                  {product.proposed_okpd_code ? (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      Предложен новый код ОКПД — при одобрении добавится в справочник.
                    </p>
                  ) : null}
                  {product.proposed_note_name && !product.note?.name ? (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      Предложено новое примечание — при одобрении добавится в настройки.
                    </p>
                  ) : null}
                  {product.url ? (
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {product.url}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                  {product.review_note ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Комментарий: {product.review_note}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(product.created_at).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>

              {product.moderation_status === 'pending' ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        id: product.id,
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
                        id: product.id,
                        approve: true,
                      })
                    }
                  >
                    Одобрить
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
