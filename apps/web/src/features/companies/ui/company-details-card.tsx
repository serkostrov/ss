import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ExternalLink, PauseCircle, Pencil, PlayCircle, Trash2 } from 'lucide-react'

import { routes } from '@shared/config'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DeleteDialog,
  ErrorState,
  IconButton,
  LoadingState,
  PageDetailHeader,
  Separator,
  StatusBadge,
} from '@shared/ui'

import { formatCompanyDate } from '../model/schemas'
import {
  useCompany,
  useDeleteCompanyMutation,
  useSetCompanyStatusMutation,
} from '../model/use-companies'
import { CompanyFormDialog } from './company-form-dialog'
import { CompanyRepresentativesPanel } from './company-representatives-panel'

export function CompanyDetailsCard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const query = useCompany(id)
  const statusMutation = useSetCompanyStatusMutation()
  const deleteMutation = useDeleteCompanyMutation()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<'active' | 'suspended' | 'archived' | null>(
    null,
  )

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

  return (
    <div className="space-y-6">
      <PageDetailHeader
        backTo={routes.admin.companies}
        title={company.name}
        description={company.description || 'Карточка компании — участника ассоциации.'}
        status={<StatusBadge status={company.access_status} />}
      >
        <IconButton label="Изменить" onClick={() => setEditOpen(true)}>
          <Pencil />
        </IconButton>
        {company.access_status !== 'active' ? (
          <IconButton
            label="Активировать"
            disabled={statusMutation.isPending}
            onClick={() => setStatusTarget('active')}
          >
            <PlayCircle />
          </IconButton>
        ) : null}
        {company.access_status !== 'suspended' ? (
          <IconButton
            label="Приостановить"
            disabled={statusMutation.isPending}
            onClick={() => setStatusTarget('suspended')}
          >
            <PauseCircle />
          </IconButton>
        ) : null}
        {company.access_status !== 'archived' ? (
          <IconButton
            label="Вышедшая"
            disabled={statusMutation.isPending}
            onClick={() => setStatusTarget('archived')}
          >
            <Archive />
          </IconButton>
        ) : null}
        <IconButton
          label="Удалить"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 />
        </IconButton>
      </PageDetailHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Основные сведения</CardTitle>
            <CardDescription>Реквизиты и контакты организации</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="ИНН" value={company.inn} />
              <Field
                label="Уровень участия"
                value={company.participation_level?.name ?? 'Не назначен'}
              />
              <Field label="Email" value={company.email} />
              <Field label="Телефон" value={company.phone} />
              <Field label="Адрес" value={company.address} className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Сайт</dt>
                <dd className="mt-0.5 font-medium break-words">
                  {websiteHref ? (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
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
                company.representatives_count != null
                  ? String(company.representatives_count)
                  : '—'
              }
            />
            <Field label="Создана" value={formatCompanyDate(company.created_at)} />
            <Field label="Обновлена" value={formatCompanyDate(company.updated_at)} />
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">Внутренние заметки</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {company.notes?.trim() || 'Заметок пока нет.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <CompanyRepresentativesPanel companyId={company.id} companyName={company.name} />

      <CompanyFormDialog open={editOpen} onOpenChange={setEditOpen} company={company} />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
        title="Изменить статус доступа?"
        description={
          statusTarget === 'active'
            ? 'Компания снова получит доступ к материалам кабинета (при подтверждённых участниках).'
            : statusTarget === 'suspended'
              ? 'Доступ представителей будет ограничен до повторной активации.'
              : 'Компания будет помечена как архивная.'
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
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{value?.trim() || '—'}</dd>
    </div>
  )
}
