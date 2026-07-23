import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { formatPollDate, voteModeLabel } from '@features/polls'
import { queryKeys } from '@shared/api'
import { routes } from '@shared/config'
import { toApiError } from '@shared/lib/errors'
import { cn } from '@shared/lib/utils'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageHeader,
  Spinner,
  StatusBadge,
} from '@shared/ui'

import {
  useCabinetPoll,
  useCastCabinetVoteMutation,
} from '../model/use-cabinet-polls'

export function CabinetPollBallotPanel() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const query = useCabinetPoll(id)
  const voteMutation = useCastCabinetVoteMutation()

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const poll = query.data

  useEffect(() => {
    if (!poll) return
    if (poll.myVote) {
      setSelectedOptionId(poll.myVote.optionId)
      return
    }
    setSelectedOptionId(null)
  }, [poll?.id, poll?.myVote?.optionId, poll?.hasVoted])

  if (query.isLoading && !poll) {
    return <LoadingState label="Загрузка голосования…" />
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  if (!poll) {
    return (
      <ErrorState
        title="Голосование недоступно"
        description="Опрос закрыт, ещё не начался, завершён или не разрешён уровню вашей компании."
        action={
          <Button asChild variant="outline">
            <Link to={routes.cabinet.polls}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const locked = poll.hasVoted || !poll.canVote
  const selectedOption = poll.options.find((item) => item.id === selectedOptionId)

  const submitVote = async () => {
    if (!selectedOptionId || locked) return
    try {
      await voteMutation.mutateAsync({ pollId: poll.id, optionId: selectedOptionId })
      setConfirmOpen(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.polls.cabinetDetail(poll.id) })
    } catch (error) {
      setConfirmOpen(false)
      // Conflict / already voted — refresh ballot so UI shows the recorded choice.
      const apiError = toApiError(error)
      if (apiError.code === 'conflict' || apiError.code === 'forbidden') {
        await query.refetch()
        await queryClient.invalidateQueries({ queryKey: queryKeys.polls.cabinetList })
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit gap-1">
          <Link to={routes.cabinet.polls}>
            <ChevronLeft className="size-4" />
            Назад
          </Link>
        </Button>
        <PageHeader
          title={poll.title}
          description={poll.description || 'Бюллетень голосования.'}
          className="mb-0"
          status={
            locked ? (
              <StatusBadge status="confirmed" label="Голос учтён" />
            ) : (
              <StatusBadge status="active" label="Открыто" />
            )
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {locked ? 'Ваш выбор' : 'Выберите вариант'}
            </CardTitle>
            <CardDescription>
              {locked
                ? poll.myVote?.isOwnVote
                  ? 'Вы уже проголосовали. Изменить выбор нельзя.'
                  : 'Голос компании уже учтён. Повторное голосование недоступно.'
                : 'Голос отправляется один раз и не может быть изменён.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2" disabled={locked || voteMutation.isPending}>
              <legend className="sr-only">Варианты ответа</legend>
              {poll.options.map((option) => {
                const isSelected = selectedOptionId === option.id
                const isRecorded = poll.myVote?.optionId === option.id
                return (
                  <label
                    key={option.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm transition-colors',
                      isSelected || isRecorded
                        ? 'border-primary/50 bg-accent/40'
                        : 'hover:bg-accent/20',
                      locked && 'cursor-default',
                    )}
                  >
                    <input
                      type="radio"
                      name={`poll-${poll.id}`}
                      value={option.id}
                      checked={isSelected}
                      disabled={locked || voteMutation.isPending}
                      onChange={() => setSelectedOptionId(option.id)}
                      className="mt-1 size-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{option.text}</span>
                      {isRecorded ? (
                        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                          Зафиксированный выбор
                        </span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </fieldset>

            {!locked ? (
              <Button
                type="button"
                disabled={!selectedOptionId || voteMutation.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {voteMutation.isPending ? <Spinner size="sm" className="text-current" /> : null}
                Проголосовать
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Сведения</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Режим</p>
              <p className="font-medium">{voteModeLabel(poll.vote_mode)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Период</p>
              <p className="font-medium">
                {formatPollDate(poll.starts_at)} — {formatPollDate(poll.ends_at)}
              </p>
            </div>
            {poll.myVote ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-muted-foreground">Зафиксировано</p>
                <p className="font-medium">{poll.myVote.optionText}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatPollDate(poll.myVote.votedAt)}
                  {!poll.myVote.isOwnVote ? ' · голос компании' : ''}
                </p>
              </div>
            ) : (
              <Badge variant="outline" className="font-normal">
                Ещё не голосовали
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Подтвердить голос?"
        description={
          selectedOption
            ? `Будет зафиксирован вариант «${selectedOption.text}». Изменить решение после отправки нельзя.`
            : undefined
        }
        confirmLabel="Отправить голос"
        loading={voteMutation.isPending}
        onConfirm={() => void submitVote()}
      />
    </div>
  )
}
