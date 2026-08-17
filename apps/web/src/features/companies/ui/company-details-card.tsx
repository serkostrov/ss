import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, Pencil, Tags, Trash2 } from 'lucide-react'

import { CompanyProductsPanel } from '@features/company-products'
import {
  companyAccessStatusLabel,
  useCompanyAccessStatuses,
} from '@features/access-statuses'
import { routes } from '@shared/config'
import { useTargetHighlightFlash } from '@shared/lib/use-target-highlight-flash'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorState,
  IconButton,
  LoadingState,
  PageDetailHeader,
  Separator,
  StatusBadge,
} from '@shared/ui'

import { formatCompanyAutoId, formatCompanyBalance, formatCompanyDate } from '../model/schemas'
import {
  useCompany,
  useDeleteCompanyMutation,
  useSetCompanyStatusMutation,
} from '../model/use-companies'
import { CompanyCommentsPanel } from './company-comments-panel'
import { CompanyFormDialog } from './company-form-dialog'
import { CompanyRepresentativesPanel } from './company-representatives-panel'

export function CompanyDetailsCard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const query = useCompany(id)
  const statusesQuery = useCompanyAccessStatuses(false)
  const statusOptions = useMemo(
    () => (statusesQuery.data ?? []).filter((item) => item.is_active),
    [statusesQuery.data],
  )
  const statusMutation = useSetCompanyStatusMutation()
  const deleteMutation = useDeleteCompanyMutation()
  useTargetHighlightFlash()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<string | null>(null)

  if (query.isLoading) {
    return <LoadingState label="Загрузка карточки компании…" />
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const company = query.data
  if (!company) {
    return (
      <ErrorState
        title="Компания не найдена"
        description="Запись удалена или идентификатор неверен."
        action={
          <Button asChild variant="outline">
            <Link to={routes.admin.companies}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const websiteHref = company.website
    ? /^https?:\/\//i.test(company.website)
      ? company.website
      : `https://${company.website}`
    : null

  const otherStatuses = statusOptions.filter((item) => item.slug !== company.access_status)
  const targetStatus = statusOptions.find((item) => item.slug === statusTarget) ?? null

  return (
    <div className="space-y-6">
      <div id={`company-${company.id}`} className="scroll-mt-20 rounded-lg">
        <PageDetailHeader
          backTo={routes.admin.companies}
          title={company.name}
          description={
            `ID ${formatCompanyAutoId(company.auto_id)}` +
            (company.description
              ? ` · ${company.description}`
              : ' · Карточка компании — участника ассоциации.')
          }
          status={
            <StatusBadge
              status={company.access_status}
              label={companyAccessStatusLabel(company.access_status, statusOptions)}
            />
          }
        >
        <IconButton label="Изменить" onClick={() => setEditOpen(true)}>
          <Pencil />
        </IconButton>
        {otherStatuses.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Статус доступа" disabled={statusMutation.isPending}>
                <Tags />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {otherStatuses.map((status) => (
                <DropdownMenuItem key={status.slug} onClick={() => setStatusTarget(status.slug)}>
                  {status.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <IconButton
          label="Удалить"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 />
        </IconButton>
      </PageDetailHeader>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Основные сведения</CardTitle>
            <CardDescription>Реквизиты и контакты организации</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="ID" value={formatCompanyAutoId(company.auto_id)} />
              <Field label="ИНН" value={company.inn} />
              <Field label="Баланс" value={formatCompanyBalance(company.balance ?? 0)} />
              <Field
                label="Уровень участия"
                value={company.participation_level?.name ?? 'Не назначен'}
              />
              <Field label="Email" value={company.email} />
              <Field label="Телефон" value={company.phone} />
              <Field label="Адрес" value={company.address} className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-xs">Сайт</dt>
                <dd className="mt-0.5 font-medium break-words">
                  {websiteHref ? (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    >
                      {company.website}
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Служебное</CardTitle>
            <CardDescription>Только для админа</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Представители"
              value={
                company.representatives_count != null ? String(company.representatives_count) : '—'
              }
            />
            <Field label="Создана" value={formatCompanyDate(company.created_at)} />
            <Field label="Обновлена" value={formatCompanyDate(company.updated_at)} />
            <Separator />
            <div>
              <p className="text-muted-foreground text-xs">Внутренние заметки</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {company.notes?.trim() || 'Заметок пока нет.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <CompanyRepresentativesPanel companyId={company.id} companyName={company.name} />

      <CompanyProductsPanel companyId={company.id} />

      <CompanyCommentsPanel companyId={company.id} />

      <CompanyFormDialog open={editOpen} onOpenChange={setEditOpen} company={company} />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
        title="Изменить статус доступа?"
        description={
          targetStatus?.description?.trim() ||
          `Компания получит статус «${targetStatus?.name ?? statusTarget}».`
        }
        confirmLabel="Применить"
        loading={statusMutation.isPending}
        onConfirm={async () => {
          if (!statusTarget) return
          await statusMutation.mutateAsync({ id: company.id, status: statusTarget })
          setStatusTarget(null)
        }}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityName={company.name}
        title="Удалить компанию?"
        description={
          (company.representatives_count ?? 0) > 0
            ? `Будут удалены и связанные представители (${company.representatives_count}). Действие необратимо.`
            : 'Компания будет удалена безвозвратно.'
        }
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          await deleteMutation.mutateAsync(company.id)
          navigate(routes.admin.companies, { replace: true })
        }}
      />
    </div>
  )
}

function Field({
  label,
  value,
  className,
}: {
  label: string
  value?: string | null
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{value?.trim() || '—'}</dd>
    </div>
  )
}
