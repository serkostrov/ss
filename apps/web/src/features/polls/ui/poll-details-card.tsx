import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, FileEdit, Lock, Pencil, Trash2 } from 'lucide-react'

import type { PollStatus } from '@shared/api'
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
  Separator,
  StatusBadge,
} from '@shared/ui'

import {
  formatPollDate,
  pollStatusActionLabel,
  pollStatusName,
  voteModeLabel,
} from '../model/schemas'
import {
  useDeletePollMutation,
  usePoll,
  useSetPollStatusMutation,
} from '../model/use-polls'
import { PollFormDialog } from './poll-form-dialog'
import { PollResultsPanel } from './poll-results-panel'

export function PollDetailsCard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const query = usePoll(id)
  const statusMutation = useSetPollStatusMutation()
  const deleteMutation = useDeletePollMutation()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<PollStatus | null>(null)

  if (query.isLoading) {
    return <LoadingState label="Загрузка голосования…" />
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const poll = query.data
  if (!poll) {
    return (
      <ErrorState
        title="Голосование не найдено"
        description="Запись удалена или идентификатор неверен."
        action={
          <Button asChild variant="outline">
            <Link to={routes.admin.polls}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const statusActions = (['draft', 'active', 'closed'] as PollStatus[]).filter(
    (status) => status !== poll.status,
  )

  return (
    <div className="space-y-6">
      <PageDetailHeader
        backTo={routes.admin.polls}
        title={poll.title}
        description={poll.description || 'Карточка голосования.'}
        status={<StatusBadge status={poll.status} />}
      >
        <IconButton label="Изменить" onClick={() => setEditOpen(true)}>
          <Pencil />
        </IconButton>
        {statusActions.map((status) => (
          <IconButton
            key={status}
            label={pollStatusActionLabel(status)}
            disabled={statusMutation.isPending}
            onClick={() => setStatusTarget(status)}
          >
            {status === 'active' ? (
              <CheckCircle2 />
            ) : status === 'closed' ? (
              <Lock />
            ) : (
              <FileEdit />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Параметры</CardTitle>
            <CardDescription>Режим, период и доступы</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Режим</p>
              <p className="font-medium">{voteModeLabel(poll.vote_mode)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Начало</p>
              <p className="font-medium">{formatPollDate(poll.starts_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Окончание</p>
              <p className="font-medium">{formatPollDate(poll.ends_at)}</p>
            </div>
            <Separator />
            <div>
              <p className="mb-2 text-muted-foreground">Уровни участников</p>
              {poll.levels.length ? (
                <div className="flex flex-wrap gap-1">
                  {poll.levels.map((level) => (
                    <Badge
                      key={level.id}
                      variant={level.is_active ? 'secondary' : 'outline'}
                      className="font-normal"
                    >
                      {level.name}
                      {!level.is_active ? ' (скрыт)' : ''}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Не назначены</p>
              )}
            </div>
            <Separator />
            <p className="text-muted-foreground">
              Создано: {formatPollDate(poll.created_at)}
            </p>
            <p className="text-muted-foreground">Голосов: {poll.votes_count}</p>
            <p className="text-muted-foreground">Вариантов: {poll.options.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Варианты ответа</CardTitle>
            <CardDescription>Порядок в голосовании</CardDescription>
          </CardHeader>
          <CardContent>
            {poll.options.length ? (
              <ol className="space-y-2">
                {poll.options.map((option, index) => (
                  <li
                    key={option.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {index + 1}
                    </span>
                    <span>{option.text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Варианты не заданы</p>
            )}
          </CardContent>
        </Card>
      </div>

      <PollResultsPanel pollId={poll.id} pollTitle={poll.title} />

      <PollFormDialog open={editOpen} onOpenChange={setEditOpen} poll={poll} />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
        title="Изменить статус голосования?"
        description={
          statusTarget
            ? `Голосование «${poll.title}» будет переведено в статус «${pollStatusName(statusTarget)}».`
            : undefined
        }
        confirmLabel="Подтвердить"
        loading={statusMutation.isPending}
        onConfirm={async () => {
          if (!statusTarget) return
          await statusMutation.mutateAsync({ id: poll.id, status: statusTarget })
          setStatusTarget(null)
        }}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityName={poll.title}
        title="Удалить голосование?"
        description="Варианты, доступы и все голоса будут удалены без возможности восстановления."
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          await deleteMutation.mutateAsync(poll.id)
          navigate(routes.admin.polls, { replace: true })
        }}
      />
    </div>
  )
}
