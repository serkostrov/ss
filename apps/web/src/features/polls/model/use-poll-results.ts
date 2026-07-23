import {
  pollsService,
  queryKeys,
  useSupabaseQuery,
  type PollResults,
  type PollVoteRow,
} from '@shared/api'
import { downloadCsv, slugifyFilename } from '@shared/lib/csv'
import { formatPollDate, voteModeLabel } from './schemas'

export function usePollResults(pollId: string | undefined) {
  return useSupabaseQuery(
    queryKeys.polls.results(pollId ?? 'none'),
    () => {
      if (!pollId) return Promise.resolve(null)
      return pollsService.getResults(pollId)
    },
    {
      enabled: Boolean(pollId),
      ensureFreshSession: true,
      meta: { suppressErrorToast: true },
    },
  )
}

export function usePollVotes(pollId: string | undefined) {
  return useSupabaseQuery(
    queryKeys.polls.votes(pollId ?? 'none'),
    () => {
      if (!pollId) return Promise.resolve([] as PollVoteRow[])
      return pollsService.listVotes(pollId)
    },
    {
      enabled: Boolean(pollId),
      ensureFreshSession: true,
      meta: { suppressErrorToast: true },
    },
  )
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 1000) / 10}%`
}

export function buildPollResultsCsv(
  results: PollResults,
  votes: PollVoteRow[],
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    ['Голосование', results.title],
    ['Режим', voteModeLabel(results.vote_mode)],
    ['Статус', results.status],
    ['Всего голосов', results.votes_total],
    ['Компаний проголосовало', results.companies_voted],
    ['Имеют право голоса', results.eligible_total],
    ['Явка', formatPercent(results.turnout_share)],
    ['Первый голос', formatPollDate(results.first_voted_at)],
    ['Последний голос', formatPollDate(results.last_voted_at)],
    [],
    ['Вариант', 'Голосов', 'Доля'],
    ...results.options.map((option) => [
      option.text,
      option.votes_count,
      formatPercent(option.share),
    ]),
    [],
    [
      'Дата голоса',
      'Представитель',
      'Email',
      'Компания',
      'Вариант',
    ],
    ...votes.map((vote) => [
      formatPollDate(vote.voted_at),
      vote.representative_name,
      vote.representative_email ?? '',
      vote.company_name,
      vote.option_text,
    ]),
  ]

  return rows
}

export function exportPollResultsCsv(results: PollResults, votes: PollVoteRow[]) {
  const name = `poll-results-${slugifyFilename(results.title, results.poll_id)}`
  downloadCsv(name, buildPollResultsCsv(results, votes))
}

export type { PollResults, PollVoteRow }
