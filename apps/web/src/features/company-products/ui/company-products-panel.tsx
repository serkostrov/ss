import { useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'

import type { CompanyProduct } from '@shared/api'
import { useTargetHighlightFlash } from '@shared/lib/use-target-highlight-flash'
import { cn } from '@shared/lib/utils'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DeleteDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shared/ui'

import {
  useCompanyProducts,
  useDeleteCompanyProductMutation,
  useMoveCompanyProductMutation,
} from '../model/use-company-products'
import { ProductFormDialog, productLabel } from './product-form-dialog'

type CompanyProductsPanelProps = {
  companyId: string
  title?: string
  editable?: boolean
}

export function CompanyProductsPanel({
  companyId,
  title = 'Продукция',
  editable = true,
}: CompanyProductsPanelProps) {
  const query = useCompanyProducts(companyId)
  const deleteMutation = useDeleteCompanyProductMutation(companyId)
  const moveMutation = useMoveCompanyProductMutation(companyId)
  useTargetHighlightFlash()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CompanyProduct | null>(null)
  const [deleting, setDeleting] = useState<CompanyProduct | null>(null)

  const products = query.data ?? []

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        {title ? <CardTitle className="text-base">{title}</CardTitle> : <span />}
        {editable ? (
          <Button type="button" size="sm" className="shrink-0" onClick={openCreate}>
            <Plus className="size-4" />
            Добавить
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading && !query.data ? <LoadingState label="Загрузка продукции…" /> : null}

        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : null}

        {!query.isLoading && !query.isError && products.length === 0 ? (
          <EmptyState
            title="Продукции пока нет"
            description={
              editable
                ? 'Добавьте товары или услуги по классификатору ОКПД 2.'
                : 'Компания пока не добавила товары или услуги.'
            }
          />
        ) : null}

        {products.length > 0 ? (
          <div className="overflow-hidden rounded-lg border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead
                    className={cn(
                      'px-3 py-2 text-[11px] font-medium tracking-wide uppercase',
                      editable ? 'w-[48%]' : 'w-[58%]',
                    )}
                  >
                    Продукция
                  </TableHead>
                  <TableHead className="w-[22%] px-3 py-2 text-[11px] font-medium tracking-wide uppercase">
                    Примечание
                  </TableHead>
                  <TableHead className="w-[14%] px-3 py-2 text-[11px] font-medium tracking-wide uppercase">
                    Статус
                  </TableHead>
                  <TableHead className="w-12 px-3 py-2 text-right text-[11px] font-medium tracking-wide uppercase">
                    URL
                  </TableHead>
                  {editable ? (
                    <TableHead className="w-[16%] px-2 py-2 text-right text-[11px] font-medium tracking-wide uppercase">
                      Действия
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product, index) => (
                  <TableRow
                    key={product.id}
                    id={`product-${product.id}`}
                    className="scroll-mt-28 hover:bg-muted/25"
                  >
                    <TableCell className="px-3 py-2.5 align-middle">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {product.okpd?.code || product.proposed_okpd_code ? (
                            <span className="bg-muted/80 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                              {product.okpd?.code ?? product.proposed_okpd_code}
                            </span>
                          ) : (
                            <Badge variant="muted" className="px-1.5 py-0 text-[10px] font-normal">
                              без ОКПД
                            </Badge>
                          )}
                          {product.proposed_okpd_code ? (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                              предложение
                            </Badge>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-sm font-medium leading-snug">
                          {product.name}
                        </p>
                        {product.okpd?.title || product.proposed_okpd_title ? (
                          <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">
                            {product.okpd?.title ?? product.proposed_okpd_title}
                          </p>
                        ) : null}
                        {product.review_note && product.moderation_status === 'rejected' ? (
                          <p className="text-destructive text-[11px]">{product.review_note}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-middle">
                      {product.note?.name && product.note.name !== 'отсутствует' ? (
                        <Badge
                          variant="secondary"
                          className="max-w-full truncate px-1.5 py-0 text-[10px] font-normal"
                        >
                          {product.note.name}
                        </Badge>
                      ) : product.proposed_note_name ? (
                        <Badge
                          variant="outline"
                          className="max-w-full truncate px-1.5 py-0 text-[10px] font-normal"
                          title="Предложенное примечание"
                        >
                          {product.proposed_note_name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-middle">
                      <StatusBadge status={product.moderation_status} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-middle text-right">
                      {product.url ? (
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noreferrer"
                          className="border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-accent inline-flex size-8 items-center justify-center rounded-md border transition-colors"
                          title={product.url}
                        >
                          <ExternalLink className="size-3.5" />
                          <span className="sr-only">Открыть ссылку</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </TableCell>
                    {editable ? (
                      <TableCell className="px-1 py-1.5 align-middle">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={index === 0 || moveMutation.isPending}
                            aria-label="Выше"
                            onClick={() => moveMutation.mutate({ id: product.id, direction: 'up' })}
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={index >= products.length - 1 || moveMutation.isPending}
                            aria-label="Ниже"
                            onClick={() =>
                              moveMutation.mutate({ id: product.id, direction: 'down' })
                            }
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label="Редактировать"
                            onClick={() => {
                              setEditing(product)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive size-7"
                            aria-label="Удалить"
                            onClick={() => setDeleting(product)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>

      {editable ? (
        <ProductFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open)
            if (!open) setEditing(null)
          }}
          companyId={companyId}
          product={editing}
        />
      ) : null}

      {editable ? (
        <DeleteDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          entityName={deleting ? productLabel(deleting) : undefined}
          title="Удалить продукцию?"
          description="Запись будет удалена из карточки компании и справочника."
          loading={deleteMutation.isPending}
          onConfirm={async () => {
            if (!deleting) return
            await deleteMutation.mutateAsync(deleting.id)
            setDeleting(null)
          }}
        />
      ) : null}
    </Card>
  )
}
