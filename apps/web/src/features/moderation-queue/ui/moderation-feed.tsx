import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, Search, X } from 'lucide-react'

import { useReviewCompanyProductMutation } from '@features/company-products'
import { useReviewMaterialCategoryMutation } from '@features/material-categories'
import { useReviewMaterialSectionMutation } from '@features/materials'
import { useReviewProductCategorySuggestionMutation } from '@features/product-categories'
import { RegistrationDetailSheet } from '@features/registrations'
import { cn } from '@shared/lib/utils'
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@shared/ui'

import type {
  ModerationFeedItem,
  ModerationFeedKind,
  ModerationFeedKindFilter,
  ModerationFeedStatusFilter,
} from '../model/types'
import { useModerationFeed } from '../model/use-moderation-feed'

const KIND_LABELS: Record<ModerationFeedKind, string> = {
  registration: 'Регистрация',
  product: 'Продукция',
  productCategory: 'Категория продукции',
  material: 'Материал',
  materialCategory: 'Категория материалов',
}

const KIND_FILTERS: Array<{ value: ModerationFeedKindFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'registration', label: 'Регистрации' },
  { value: 'product', label: 'Продукция' },
  { value: 'productCategory', label: 'Кат. продукции' },
  { value: 'material', label: 'Материалы' },
  { value: 'materialCategory', label: 'Кат. материалов' },
]

function formatRelative(value: string): string {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  if (Number.isNaN(diffMs)) return value
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} д`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function suggestionKey(item: ModerationFeedItem): string | null {
  if (item.kind === 'productCategory') return item.rawId
  return item.linkedSuggestionId ?? null
}

function suggestedName(item: ModerationFeedItem): string | null {
  if (item.kind === 'productCategory') return item.title
  return item.suggestedCategoryName ?? null
}

export function ModerationFeed() {
  const [statusFilter, setStatusFilter] = useState<ModerationFeedStatusFilter>('pending')
  const [kindFilter, setKindFilter] = useState<ModerationFeedKindFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null)
  const [categoryBySuggestion, setCategoryBySuggestion] = useState<Record<string, string>>({})

  const feed = useModerationFeed(statusFilter, kindFilter, search)
  const reviewProduct = useReviewCompanyProductMutation()
  const reviewProductCategory = useReviewProductCategorySuggestionMutation()
  const reviewMaterial = useReviewMaterialSectionMutation()
  const reviewMaterialCategory = useReviewMaterialCategoryMutation()

  const busy =
    reviewProduct.isPending ||
    reviewProductCategory.isPending ||
    reviewMaterial.isPending ||
    reviewMaterialCategory.isPending

  const visibleKindFilters = useMemo(
    () =>
      KIND_FILTERS.filter(
        (item) =>
          item.value === 'all' ||
          (feed.counts[item.value] ?? 0) > 0 ||
          kindFilter === item.value,
      ),
    [feed.counts, kindFilter],
  )

  const approve = async (item: ModerationFeedItem) => {
    switch (item.kind) {
      case 'product': {
        if (item.linkedSuggestionId) {
          const selected = categoryBySuggestion[item.linkedSuggestionId]
          await reviewProductCategory.mutateAsync({
            id: item.linkedSuggestionId,
            approve: true,
            categoryId: selected && selected !== 'new' ? selected : null,
          })
        }
        await reviewProduct.mutateAsync({ id: item.rawId, approve: true })
        break
      }
      case 'productCategory': {
        const selected = categoryBySuggestion[item.rawId]
        await reviewProductCategory.mutateAsync({
          id: item.rawId,
          approve: true,
          categoryId: selected && selected !== 'new' ? selected : null,
        })
        break
      }
      case 'material':
        reviewMaterial.mutate({ id: item.rawId, approve: true })
        break
      case 'materialCategory':
        reviewMaterialCategory.mutate({ id: item.rawId, approve: true })
        break
      case 'registration':
        setSelectedRegistrationId(item.rawId)
        break
    }
  }

  const reject = async (item: ModerationFeedItem) => {
    switch (item.kind) {
      case 'product': {
        if (item.linkedSuggestionId) {
          await reviewProductCategory.mutateAsync({
            id: item.linkedSuggestionId,
            approve: false,
          })
        }
        await reviewProduct.mutateAsync({ id: item.rawId, approve: false })
        break
      }
      case 'productCategory':
        await reviewProductCategory.mutateAsync({ id: item.rawId, approve: false })
        break
      case 'material':
        reviewMaterial.mutate({ id: item.rawId, approve: false })
        break
      case 'materialCategory':
        reviewMaterialCategory.mutate({ id: item.rawId, approve: false })
        break
      case 'registration':
        setSelectedRegistrationId(item.rawId)
        break
    }
  }

  if (feed.isLoading) {
    return <LoadingState label="Загрузка заявок…" />
  }

  if (feed.isError) {
    return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleKindFilters.map((filter) => {
            const count = feed.counts[filter.value]
            const active = kindFilter === filter.value
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setKindFilter(filter.value)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                  active
                    ? 'border-foreground/15 bg-foreground text-background'
                    : 'border-transparent bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[10px] tabular-nums',
                    active ? 'bg-background/20' : 'bg-background/80',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск…"
              className="h-8 pl-8 text-sm"
              aria-label="Поиск по заявкам"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as ModerationFeedStatusFilter)}
          >
            <SelectTrigger className="h-8 w-full sm:w-44" aria-label="Статус заявок">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">На рассмотрении</SelectItem>
              <SelectItem value="resolved">Рассмотренные</SelectItem>
              <SelectItem value="all">Все</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {feed.items.length === 0 ? (
        <EmptyState
          title={statusFilter === 'pending' ? 'Очередь пуста' : 'Ничего не найдено'}
          description={
            statusFilter === 'pending'
              ? 'Новые регистрации, продукция, категории и материалы появятся здесь.'
              : 'Измените фильтры или поисковый запрос.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y">
            {feed.items.map((item) => {
              const pending = item.status === 'pending'
              const linkedSuggestion = suggestionKey(item)
              const categoryName = suggestedName(item)
              const showCategorySelect = Boolean(linkedSuggestion && categoryName && pending)
              const kindLabel =
                item.kind === 'product' && item.linkedSuggestionId
                  ? 'Продукция + категория'
                  : KIND_LABELS[item.kind]

              return (
                <li
                  key={item.id}
                  className="group flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {kindLabel}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatRelative(item.sortAt)}
                      </span>
                    </div>

                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      {item.href ? (
                        <Link
                          to={item.href}
                          className="truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {item.title}
                        </Link>
                      ) : item.kind === 'registration' ? (
                        <button
                          type="button"
                          className="truncate text-left text-sm font-medium underline-offset-2 hover:underline"
                          onClick={() => setSelectedRegistrationId(item.rawId)}
                        >
                          {item.title}
                        </button>
                      ) : (
                        <p className="truncate text-sm font-medium">{item.title}</p>
                      )}
                      {item.meta?.startsWith('http') ? (
                        <a
                          href={item.meta}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Открыть ссылку"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </div>

                    <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>

                    {showCategorySelect && linkedSuggestion && categoryName ? (
                      <div className="mt-1.5 max-w-sm">
                        <Select
                          value={categoryBySuggestion[linkedSuggestion] ?? 'new'}
                          onValueChange={(value) =>
                            setCategoryBySuggestion((current) => ({
                              ...current,
                              [linkedSuggestion]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Создать «{categoryName}»</SelectItem>
                            {feed.productCategories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                Привязать к «{category.name}»
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-1.5 sm:pl-2">
                    {pending ? (
                      item.kind === 'registration' ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          onClick={() => setSelectedRegistrationId(item.rawId)}
                        >
                          Открыть
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="size-8"
                            disabled={busy}
                            aria-label="Отклонить"
                            onClick={() => void reject(item)}
                          >
                            <X className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            className="size-8"
                            disabled={busy || item.canApprove === false}
                            aria-label="Одобрить"
                            onClick={() => void approve(item)}
                          >
                            <Check className="size-3.5" />
                          </Button>
                        </>
                      )
                    ) : (
                      <StatusBadge status={item.status} className="h-5 px-1.5 text-[10px]" />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <RegistrationDetailSheet
        userId={selectedRegistrationId}
        open={Boolean(selectedRegistrationId)}
        onOpenChange={(open) => {
          if (!open) setSelectedRegistrationId(null)
        }}
      />
    </div>
  )
}
