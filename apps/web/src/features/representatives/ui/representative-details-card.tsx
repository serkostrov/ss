import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EyeOff, Link2, Link2Off, Pencil, Star, Trash2, UserCheck } from 'lucide-react'

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

import { formatDateTime } from '../model/schemas'
import {
  useDeleteRepresentativeMutation,
  useRepresentative,
  useSetPrimaryRepresentativeMutation,
  useToggleRepresentativeActiveMutation,
  useUnlinkRepresentativeUserMutation,
} from '../model/use-representatives'
import { RepresentativeFormDialog } from './representative-form-dialog'

export function RepresentativeDetailsCard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const query = useRepresentative(id ?? null)
  const primaryMutation = useSetPrimaryRepresentativeMutation()
  const toggleMutation = useToggleRepresentativeActiveMutation()
  const deleteMutation = useDeleteRepresentativeMutation()
  const unlinkMutation = useUnlinkRepresentativeUserMutation()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [primaryOpen, setPrimaryOpen] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [linkedDeleteOpen, setLinkedDeleteOpen] = useState(false)

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

  const canDelete = !representative.linked_user_id
  const showPrimaryAction = !representative.is_primary && representative.is_active
  const linkedUserLabel =
    representative.linked_user_email ||
    representative.linked_user_full_name ||
    representative.linked_user_id

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
        {representative.linked_user_id ? (
          <IconButton
            label="Отвязать учётную запись"
            disabled={unlinkMutation.isPending}
            onClick={() => setUnlinkOpen(true)}
          >
            <Link2Off />
          </IconButton>
        ) : null}
        <IconButton
          label="Удалить"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            if (canDelete) {
              setDeleteOpen(true)
            } else {
              setLinkedDeleteOpen(true)
            }
          }}
        >
          <Trash2 />
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
            <CardTitle className="text-base">Компания и статусы</CardTitle>
            <CardDescription>Роль в организации и учётная запись</CardDescription>
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
              value={
                representative.linked_user_id
                  ? linkedUserLabel
                  : 'Не привязана'
              }
            />
            {representative.linked_user_id ? (
              <div className="space-y-2">
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Link2 className="size-3.5 shrink-0" />
                  {representative.linked_user_role === 'admin'
                    ? 'Сотрудник АПСС с доступом к кабинету компании'
                    : 'Участник с доступом к кабинету компании'}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={unlinkMutation.isPending}
                  onClick={() => setUnlinkOpen(true)}
                >
                  <Link2Off className="size-4" />
                  Отвязать учётную запись
                </Button>
              </div>
            ) : null}
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
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        title="Отвязать учётную запись?"
        description={
          linkedUserLabel
            ? `Связь с «${linkedUserLabel}» будет снята. Контакт представителя сохранится — его можно удалить или привязать к другой учётной записи. Пользователь потеряет доступ к кабинету этой компании.`
            : 'Связь с учётной записью будет снята. Контакт представителя сохранится.'
        }
        confirmLabel="Отвязать"
        loading={unlinkMutation.isPending}
        onConfirm={async () => {
          await unlinkMutation.mutateAsync(representative.id)
          setUnlinkOpen(false)
        }}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityName={representative.full_name}
        title="Удалить представителя?"
        description="Контакт будет удалён безвозвратно."
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          await deleteMutation.mutateAsync(representative.id)
          navigate(routes.admin.representatives, { replace: true })
        }}
      />

      <ConfirmDialog
        open={linkedDeleteOpen}
        onOpenChange={setLinkedDeleteOpen}
        title="Удаление невозможно"
        description="Представитель привязан к компании. Сначала отвяжите её — кнопка «Отвязать учётную запись» на этой странице."
        confirmLabel="Понятно"
        cancelLabel="Закрыть"
        onConfirm={() => setLinkedDeleteOpen(false)}
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
