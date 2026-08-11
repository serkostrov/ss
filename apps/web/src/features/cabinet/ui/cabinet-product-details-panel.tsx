import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Building2, ExternalLink, Pencil, Trash2 } from 'lucide-react'

import { useAuth } from '@app/providers'
import { permissions } from '@features/auth/model/permissions'
import { usePermissions } from '@features/auth/model/use-permissions'
import {
  ProductFormDialog,
  productLabel,
  useCompanyProducts,
  useDeleteCompanyProductMutation,
} from '@features/company-products'
import { routes } from '@shared/config'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DeleteDialog,
  ErrorState,
  LoadingState,
  PageDetailHeader,
} from '@shared/ui'

import { useCabinetProduct } from '../model/use-cabinet-products'

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-sm break-words">{value || '—'}</dd>
    </div>
  )
}

function externalHref(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export function CabinetProductDetailsPanel({
  productsListTo = routes.cabinet.products,
  companyTo = routes.cabinet.directoryCompany,
}: {
  productsListTo?: string
  companyTo?: (companyId: string) => string
} = {}) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { can } = usePermissions()
  const query = useCabinetProduct(id)
  const product = query.product

  const canManage =
    Boolean(product) &&
    (can(permissions['admin.companies']) ||
      profile?.membership?.companyId === product?.companyId)

  const editableQuery = useCompanyProducts(canManage ? product?.companyId : undefined)
  const editableProduct =
    editableQuery.data?.find((item) => item.id === product?.id) ?? null

  const deleteMutation = useDeleteCompanyProductMutation(product?.companyId ?? 'none')

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (query.isLoading && !query.data) {
    return <LoadingState label="Загрузка продукции…" />
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Не удалось загрузить продукцию"
        error={query.error}
        onRetry={() => void query.refetch()}
        action={
          <Button asChild variant="outline">
            <Link to={productsListTo}>К каталогу</Link>
          </Button>
        }
      />
    )
  }

  if (!product) {
    return (
      <ErrorState
        title="Продукция не найдена"
        description="Запись удалена, скрыта или ещё не опубликована в справочнике."
        action={
          <Button asChild variant="outline">
            <Link to={productsListTo}>К каталогу</Link>
          </Button>
        }
      />
    )
  }

  const title = product.name
  const productUrl = externalHref(product.url)
  const companyWebsite = externalHref(product.companyWebsite)
  const companyHref = companyTo(product.companyId)
  const manageReady = canManage && Boolean(editableProduct)

  return (
    <div className="space-y-6">
      <PageDetailHeader
        backTo={productsListTo}
        title={title}
        description={
          product.okpd_code
            ? `ОКПД 2 · ${product.okpd_code}`
            : 'Позиция из каталога ассоциации'
        }
      >
        {canManage ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!manageReady}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4" />
              Изменить
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive gap-1.5"
              disabled={!manageReady}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Удалить
            </Button>
          </>
        ) : null}
        {productUrl ? (
          <Button asChild size="sm" className="gap-1.5">
            <a href={productUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Открыть ссылку
            </a>
          </Button>
        ) : null}
      </PageDetailHeader>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl leading-snug font-semibold tracking-tight sm:text-2xl">
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Код ОКПД 2"
                value={
                  product.okpd_code ? (
                    <span className="font-mono text-sm font-medium">{product.okpd_code}</span>
                  ) : null
                }
              />
              <Field
                label="Примечание"
                value={
                  product.note_name && product.note_name !== 'отсутствует'
                    ? product.note_name
                    : 'Не указано'
                }
              />
              <Field label="Наименование" value={product.name} />
              <Field
                label="Расшифровка ОКПД 2"
                value={product.okpd_title || null}
              />
              <Field
                label="Ссылка на продукт"
                value={
                  productUrl ? (
                    <a
                      href={productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 break-all underline-offset-4 hover:underline"
                    >
                      {product.url}
                      <ExternalLink className="size-3.5 shrink-0" />
                    </a>
                  ) : (
                    'Не указана'
                  )
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Компания
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Link
                to={companyHref}
                className="text-foreground hover:text-primary text-lg font-semibold underline-offset-4 hover:underline"
              >
                {product.companyName}
              </Link>
              {product.participationLevelName ? (
                <p className="text-muted-foreground mt-1 text-sm">{product.participationLevelName}</p>
              ) : null}
            </div>

            {product.companyDescription ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {product.companyDescription}
              </p>
            ) : null}

            <dl className="space-y-4">
              <Field
                label="Сайт компании"
                value={
                  companyWebsite ? (
                    <a
                      href={companyWebsite}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    >
                      {product.companyWebsite}
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null
                }
              />
            </dl>

            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link to={companyHref}>Открыть компанию</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {canManage && product.companyId ? (
        <ProductFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          companyId={product.companyId}
          product={editableProduct}
          onSaved={() => {
            void query.refetch()
            void editableQuery.refetch()
            navigate(productsListTo, { replace: true })
          }}
        />
      ) : null}

      {canManage && editableProduct ? (
        <DeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          entityName={productLabel(editableProduct)}
          title="Удалить продукцию?"
          description="Запись будет удалена из карточки компании и справочника."
          loading={deleteMutation.isPending}
          onConfirm={async () => {
            await deleteMutation.mutateAsync(editableProduct.id)
            setDeleteOpen(false)
            navigate(productsListTo, { replace: true })
          }}
        />
      ) : null}
    </div>
  )
}
