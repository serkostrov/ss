import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, PauseCircle, Pencil, PlayCircle, Trash2 } from 'lucide-react'

import type { WorkGroupStatus } from '@shared/api'
import { routes } from '@shared/config'
import {
  Badge,
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
  StatusBadge,
} from '@shared/ui'

import { formatWorkGroupDate, workGroupStatusActionLabel } from '../model/schemas'
import {
  useDeleteWorkGroupMutation,
  useSetWorkGroupStatusMutation,
  useWorkGroup,
} from '../model/use-work-groups'
import { WorkGroupFormDialog } from './work-group-form-dialog'
import { WorkGroupSectionTabs } from './work-group-section-tabs'

export function WorkGroupDetailsCard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const query = useWorkGroup(id)
  const statusMutation = useSetWorkGroupStatusMutation()
  const deleteMutation = useDeleteWorkGroupMutation()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<WorkGroupStatus | null>(null)

  if (query.isLoading) {
    return <LoadingState label="Загрузка карточки группы…" />
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const group = query.data
  if (!group) {
    return (
      <ErrorState
        title="Группа не найдена"
        description="Запись удалена или идентификатор неверен."
        action={
          <Button asChild variant="outline">
            <Link to={routes.admin.workGroups}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const statusActions = (['active', 'paused', 'archived'] as WorkGroupStatus[]).filter(
    (status) => status !== group.status,
  )

  return (
    <div className="space-y-6">
      <PageDetailHeader
        backTo={routes.admin.workGroups}
        title={group.name}
        description={group.description || 'Карточка рабочей группы.'}
        status={<StatusBadge status={group.status} />}
      >
        <IconButton label="Изменить" onClick={() => setEditOpen(true)}>
          <Pencil />
        </IconButton>
        {statusActions.map((status) => (
          <IconButton
            key={status}
            label={workGroupStatusActionLabel(status)}
            disabled={statusMutation.isPending}
            onClick={() => setStatusTarget(status)}
          >
            {status === 'active' ? (
              <PlayCircle />
            ) : status === 'paused' ? (
              <PauseCircle />
            ) : (
              <Archive />
            )}
          </IconButton>
        ))}
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
            <CardTitle className="text-base">Ответственный</CardTitle>
            <CardDescription>Представитель, курирующий группу</CardDescription>
          </CardHeader>
          <CardContent>
            {group.responsible ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="ФИО"
                  value={group.responsible.full_name}
                  className="sm:col-span-2"
                />
                <Field label="Должность" value={group.responsible.position} />
                <Field
                  label="Компания"
                  value={group.responsible.company?.name ?? 'Не указана'}
                />
                {!group.responsible.is_active ? (
                  <div className="sm:col-span-2">
                    <Badge variant="outline">Представитель неактивен</Badge>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Ответственный не назначен.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Служебное</CardTitle>
            <CardDescription>Счётчики и даты</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <Field label="Участников" value={String(group.members_count)} />
              <Field label="Создана" value={formatWorkGroupDate(group.created_at)} />
              <Field label="Обновлена" value={formatWorkGroupDate(group.updated_at)} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <WorkGroupSectionTabs workGroupId={group.id} />

      <WorkGroupFormDialog open={editOpen} onOpenChange={setEditOpen} workGroup={group} />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
        title="Изменить статус группы?"
        description={
          statusTarget
            ? `Группа «${group.name}» будет переведена в статус «${workGroupStatusActionLabel(statusTarget)}».`
            : undefined
        }
        confirmLabel="Подтвердить"
        loading={statusMutation.isPending}
        onConfirm={async () => {
          if (!statusTarget) return
          await statusMutation.mutateAsync({ id: group.id, status: statusTarget })
          setStatusTarget(null)
        }}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityName={group.name}
        title="Удалить рабочую группу?"
        description="Участники, ссылки и привязки мессенджеров будут удалены."
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          await deleteMutation.mutateAsync(group.id)
          navigate(routes.admin.workGroups, { replace: true })
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
