import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Building2, EyeOff, Link2, Link2Off, Pencil, Star, UserCheck } from 'lucide-react'

import { routes } from '@shared/config'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  ErrorState,
  IconButton,
  LoadingState,
  PageDetailHeader,
  Separator,
  StatusBadge,
} from '@shared/ui'

import { formatDateTime } from '../model/schemas'
import {
  useRemoveRepresentativeFromCompanyMutation,
  useRepresentative,
  useSetPrimaryRepresentativeMutation,
  useToggleRepresentativeActiveMutation,
} from '../model/use-representatives'
import { RepresentativeFormDialog } from './representative-form-dialog'

export function RepresentativeDetailsCard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const query = useRepresentative(id ?? null)
  const primaryMutation = useSetPrimaryRepresentativeMutation()
  const toggleMutation = useToggleRepresentativeActiveMutation()
  const removeMutation = useRemoveRepresentativeFromCompanyMutation()

  const [editOpen, setEditOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [primaryOpen, setPrimaryOpen] = useState(false)

  if (query.isLoading) {
    return <LoadingState label="Загрузка карточки представителя…" />
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const representative = query.data
  if (!representative) {
    return (
      <ErrorState
        title="Представитель не найден"
        description="Запись удалена или идентификатор неверен."
        action={
          <Button asChild variant="outline">
            <Link to={routes.admin.representatives}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const showPrimaryAction = !representative.is_primary && representative.is_active
  const linkedUserLabel =
    representative.linked_user_email ||
    representative.linked_user_full_name ||
    representative.linked_user_id
  const companyName = representative.company?.name ?? 'компании'

  const handleRemove = async () => {
    const result = await removeMutation.mutateAsync(representative.id)
    setRemoveOpen(false)
    navigate(routes.admin.company(result.company_id), { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageDetailHeader
        backTo={routes.admin.representatives}
        title={representative.full_name}
        description={representative.position || 'Контакт компании — участника ассоциации.'}
        status={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={representative.is_active ? 'active' : 'archived'}
              label={representative.is_active ? 'Активен' : 'Неактивен'}
            />
            {representative.is_primary ? (
              <StatusBadge status="admin" label="Основной" tone="default" />
            ) : null}
          </div>
        }
      >
        <IconButton label="Изменить" onClick={() => setEditOpen(true)}>
          <Pencil />
        </IconButton>
        {showPrimaryAction ? (
          <IconButton
            label="Сделать основным"
            disabled={primaryMutation.isPending}
            onClick={() => setPrimaryOpen(true)}
          >
            <Star />
          </IconButton>
        ) : null}
        <IconButton
          label={representative.is_active ? 'Деактивировать' : 'Активировать'}
          disabled={toggleMutation.isPending}
          onClick={() =>
            toggleMutation.mutate({
              id: representative.id,
              isActive: !representative.is_active,
            })
          }
        >
          {representative.is_active ? <EyeOff /> : <UserCheck />}
        </IconButton>
        <IconButton
          label="Отвязать от компании"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={removeMutation.isPending}
          onClick={() => setRemoveOpen(true)}
        >
          <Link2Off />
        </IconButton>
      </PageDetailHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Контакты</CardTitle>
            <CardDescription>Способы связи с представителем</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" value={representative.email} />
              <Field label="Телефон" value={representative.phone} />
              <Field
                label="Telegram"
                value={
                  representative.telegram_username ? `@${representative.telegram_username}` : null
                }
              />
              <Field label="Должность" value={representative.position} className="sm:col-span-2" />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Компания и учётная запись</CardTitle>
            <CardDescription>Представитель и участник — одна связка</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground text-xs">Компания</p>
              <p className="mt-0.5 font-medium">
                {representative.company ? (
                  <Link
                    to={routes.admin.company(representative.company.id)}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {representative.company.name}
                  </Link>
                ) : (
                  '—'
                )}
              </p>
            </div>
            <Field
              label="Учётная запись"
              value={representative.linked_user_id ? linkedUserLabel : 'Контакт без входа в систему'}
            />
            {representative.linked_user_id ? (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Link2 className="size-3.5 shrink-0" />
                {representative.linked_user_role === 'admin'
                  ? 'Сотрудник АПСС с доступом к кабинету компании'
                  : 'Участник с доступом к кабинету компании'}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={removeMutation.isPending}
              onClick={() => setRemoveOpen(true)}
            >
              <Building2 className="size-4" />
              Отвязать от компании
            </Button>
            <Separator />
            <Field label="Создан" value={formatDateTime(representative.created_at)} />
            <Field label="Обновлён" value={formatDateTime(representative.updated_at)} />
          </CardContent>
        </Card>
      </div>

      <RepresentativeFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        representative={representative}
      />

      <ConfirmDialog
        open={primaryOpen}
        onOpenChange={setPrimaryOpen}
        title="Назначить основным?"
        description="Предыдущий основной представитель этой компании будет снят (атомарно через RPC)."
        confirmLabel="Назначить"
        loading={primaryMutation.isPending}
        onConfirm={async () => {
          await primaryMutation.mutateAsync(representative.id)
          setPrimaryOpen(false)
        }}
      />

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Отвязать от компании?"
        description={
          representative.linked_user_id
            ? `«${representative.full_name}» будет убран из «${companyName}». Учётная запись ${linkedUserLabel ? `«${linkedUserLabel}» ` : ''}сохранится, но доступ к кабинету этой компании прекратится. Человека можно будет привязать к другой компании позже.`
            : `Контакт «${representative.full_name}» будет убран из «${companyName}».`
        }
        confirmLabel="Отвязать"
        loading={removeMutation.isPending}
        onConfirm={() => void handleRemove()}
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
