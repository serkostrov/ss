import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type {
  Json,
  PollStatus,
  TableInsert,
  TableRow,
  TableUpdate,
  VoteMode,
} from '../types/database'
import { authService } from './auth.service'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type PollOption = TableRow<'poll_options'>

export type PollLevelRef = Pick<
  TableRow<'participation_levels'>,
  'id' | 'name' | 'is_active' | 'sort_order'
>

export type Poll = TableRow<'polls'> & {
  options: PollOption[]
  levels: PollLevelRef[]
  level_ids: string[]
  votes_count: number
}

export type PollInput = {
  title: string
  description?: string | null
  vote_mode: VoteMode
  starts_at?: string | null
  ends_at?: string | null
  status?: PollStatus
  options: string[]
  level_ids?: string[]
}

export type PollsListFilters = {
  search?: string
  status?: PollStatus | 'all'
  voteMode?: VoteMode | 'all'
}

export type MemberPollVote = {
  optionId: string
  optionText: string
  votedAt: string
  /** True when the current representative cast the vote (false if company mate in per_company). */
  isOwnVote: boolean
}

/** Active poll visible to a confirmed member (RLS-scoped). */
export type CabinetPoll = {
  id: string
  title: string
  description: string | null
  vote_mode: VoteMode
  starts_at: string | null
  ends_at: string | null
  status: PollStatus
  created_at: string
  options: PollOption[]
  hasVoted: boolean
  /** Present after a vote by this representative or company (per mode). */
  myVote: MemberPollVote | null
  canVote: boolean
}

export type PollResultsOption = {
  id: string
  text: string
  sort_order: number
  votes_count: number
  share: number
}

export type PollResults = {
  poll_id: string
  title: string
  vote_mode: VoteMode
  status: PollStatus
  votes_total: number
  companies_voted: number
  eligible_total: number
  turnout_share: number
  first_voted_at: string | null
  last_voted_at: string | null
  options: PollResultsOption[]
}

export type PollVoteRow = {
  id: string
  voted_at: string
  option_id: string
  option_text: string
  option_sort_order: number
  representative_id: string
  representative_name: string
  representative_email: string | null
  company_id: string
  company_name: string
}

const POLL_SELECT = `
  id,
  title,
  description,
  vote_mode,
  starts_at,
  ends_at,
  status,
  created_by,
  created_at,
  poll_options (
    id,
    poll_id,
    text,
    sort_order,
    created_at
  ),
  poll_level_access (
    participation_level_id,
    participation_levels (
      id,
      name,
      is_active,
      sort_order
    )
  ),
  poll_votes ( count )
`

const MEMBER_POLL_SELECT = `
  id,
  title,
  description,
  vote_mode,
  starts_at,
  ends_at,
  status,
  created_at,
  poll_options (
    id,
    poll_id,
    text,
    sort_order,
    created_at
  )
`

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
}

type RawPoll = TableRow<'polls'> & {
  poll_options: PollOption[] | null
  poll_level_access:
    | Array<{
        participation_level_id: string
        participation_levels: PollLevelRef | PollLevelRef[] | null
      }>
    | null
  poll_votes: Array<{ count: number }> | null
}

function assertResult<T>(result: QueryResult<T>): T {
  if (result.error) {
    throw new ApiError(result.error.message, {
      code: 'unknown',
      details: result.error,
      cause: result.error,
    })
  }
  return result.data
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function normalize(row: RawPoll): Poll {
  const options = [...(row.poll_options ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.text.localeCompare(b.text, 'ru'),
  )

  const levels: PollLevelRef[] = []
  for (const link of row.poll_level_access ?? []) {
    const level = firstRelation(link.participation_levels)
    if (level) levels.push(level)
  }
  levels.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru'))

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    vote_mode: row.vote_mode,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    options,
    levels,
    level_ids: levels.map((item) => item.id),
    votes_count: row.poll_votes?.[0]?.count ?? 0,
  }
}

function assertValidOptions(options: string[]): string[] {
  const cleaned = options.map((item) => item.trim()).filter(Boolean)
  if (cleaned.length < 2) {
    throw new ApiError('Нужно минимум два варианта ответа', { code: 'validation' })
  }
  if (cleaned.some((item) => item.length > 500)) {
    throw new ApiError('Вариант ответа слишком длинный', { code: 'validation' })
  }
  return cleaned
}

function assertPeriod(startsAt?: string | null, endsAt?: string | null) {
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new ApiError('Дата окончания должна быть позже начала', { code: 'validation' })
  }
}

type MemberPollRow = {
  id: string
  title: string
  description: string | null
  vote_mode: VoteMode
  starts_at: string | null
  ends_at: string | null
  status: PollStatus
  created_at: string
  poll_options: PollOption[] | null
}

type MemberVoteRow = {
  poll_id: string
  poll_option_id: string
  representative_id: string
  voted_at: string
  poll_options: Pick<PollOption, 'text'> | Pick<PollOption, 'text'>[] | null
}

const CAST_VOTE_ERRORS: Record<
  string,
  { message: string; code: 'conflict' | 'forbidden' | 'validation' | 'not_found' }
> = {
  already_voted: {
    message: 'Голос уже учтён. Повторное голосование недоступно.',
    code: 'conflict',
  },
  forbidden: { message: 'Недостаточно прав для голосования', code: 'forbidden' },
  poll_forbidden: {
    message: 'Голосование недоступно для уровня вашей компании',
    code: 'forbidden',
  },
  no_representative: {
    message: 'Профиль представителя не привязан. Обратитесь к админу.',
    code: 'validation',
  },
  company_inactive: {
    message: 'Компания неактивна — голосование недоступно',
    code: 'forbidden',
  },
  poll_not_active: { message: 'Голосование неактивно', code: 'validation' },
  poll_not_started: { message: 'Голосование ещё не началось', code: 'validation' },
  poll_ended: { message: 'Срок голосования истёк', code: 'validation' },
  option_invalid: { message: 'Выбран недействительный вариант ответа', code: 'validation' },
  poll_not_found: { message: 'Голосование не найдено', code: 'not_found' },
}

function resolveCastVoteErrorKey(message: string): string | null {
  const trimmed = message.trim()
  if (CAST_VOTE_ERRORS[trimmed]) return trimmed
  for (const key of Object.keys(CAST_VOTE_ERRORS)) {
    if (trimmed === key || trimmed.endsWith(key) || trimmed.includes(key)) return key
  }
  return null
}

function mapCastVoteError(error: unknown): never {
  if (error instanceof ApiError) {
    const key = resolveCastVoteErrorKey(error.message)
    const mapped = key ? CAST_VOTE_ERRORS[key] : undefined
    if (mapped) {
      throw new ApiError(mapped.message, { code: mapped.code, cause: error, details: error.details })
    }
    if (error.code === 'conflict') {
      throw new ApiError(CAST_VOTE_ERRORS.already_voted.message, {
        code: 'conflict',
        cause: error,
        details: error.details,
      })
    }
    throw error
  }
  throw error
}

function normalizeMemberPoll(
  row: MemberPollRow,
  vote: MemberPollVote | null,
): CabinetPoll {
  const options = [...(row.poll_options ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.text.localeCompare(b.text, 'ru'),
  )

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    vote_mode: row.vote_mode,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    created_at: row.created_at,
    options,
    hasVoted: Boolean(vote),
    myVote: vote,
    canVote: !vote,
  }
}

async function loadMemberVotes(
  pollIds: string[],
  representativeId: string | null | undefined,
): Promise<Map<string, MemberPollVote>> {
  const map = new Map<string, MemberPollVote>()
  if (!pollIds.length) return map

  const result = (await supabaseClient
    .from('poll_votes')
    .select(
      `
      poll_id,
      poll_option_id,
      representative_id,
      voted_at,
      poll_options ( text )
    `,
    )
    .in('poll_id', pollIds)) as unknown as QueryResult<MemberVoteRow[]>

  const rows = assertResult(result)
  for (const row of rows) {
    // Prefer own vote if several company votes somehow appear.
    const existing = map.get(row.poll_id)
    const isOwn = Boolean(representativeId && row.representative_id === representativeId)
    if (existing && !isOwn) continue

    const option = firstRelation(row.poll_options)
    map.set(row.poll_id, {
      optionId: row.poll_option_id,
      optionText: option?.text ?? '—',
      votedAt: row.voted_at,
      isOwnVote: isOwn,
    })
  }
  return map
}

/**
 * Admin polls: CRUD + options + level ACL. Voting via cast_vote RPC.
 */
export const pollsService = {
  async list(filters: PollsListFilters = {}): Promise<Poll[]> {
    let query = supabaseClient
      .from('polls')
      .select(POLL_SELECT)
      .order('created_at', { ascending: false })

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }
    if (filters.voteMode && filters.voteMode !== 'all') {
      query = query.eq('vote_mode', filters.voteMode)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [`title.ilike."${pattern}"`, `description.ilike."${pattern}"`].join(','),
        )
      }
    }

    const result = (await query) as unknown as QueryResult<RawPoll[]>
    return assertResult(result).map(normalize)
  },

  async getById(id: string): Promise<Poll | null> {
    const result = (await supabaseClient
      .from('polls')
      .select(POLL_SELECT)
      .eq('id', id)
      .maybeSingle()) as unknown as QueryResult<RawPoll | null>

    const row = assertResult(result)
    return row ? normalize(row) : null
  },

  async create(input: PollInput): Promise<Poll> {
    const options = assertValidOptions(input.options)
    assertPeriod(input.starts_at, input.ends_at)
    const user = await authService.getUser()

    const payload: TableInsert<'polls'> = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      vote_mode: input.vote_mode,
      starts_at: input.starts_at || null,
      ends_at: input.ends_at || null,
      status: input.status ?? 'draft',
      created_by: user?.id ?? null,
    }

    if (payload.status === 'active' && !(input.level_ids?.length)) {
      throw new ApiError('Для публикации выберите уровни доступа', { code: 'validation' })
    }

    const created = await dataService.insert('polls', payload)

    await rpcService.call('replace_poll_options', {
      p_poll_id: created.id,
      p_texts: options,
    })

    if (input.level_ids?.length) {
      await rpcService.call('set_poll_levels', {
        p_poll_id: created.id,
        p_level_ids: [...new Set(input.level_ids)],
      })
    }

    const full = await this.getById(created.id)
    if (!full) throw new ApiError('Голосование создано, но не найдено', { code: 'unknown' })
    return full
  },

  async update(id: string, input: PollInput): Promise<Poll> {
    const existing = await this.getById(id)
    if (!existing) throw new ApiError('Голосование не найдено', { code: 'not_found' })

    const options = assertValidOptions(input.options)
    assertPeriod(input.starts_at, input.ends_at)

    if (existing.votes_count > 0 && input.vote_mode !== existing.vote_mode) {
      throw new ApiError('Нельзя менять режим после первых голосов', { code: 'validation' })
    }

    const nextStatus = input.status ?? existing.status
    if (nextStatus === 'active' && !(input.level_ids?.length ?? existing.level_ids.length)) {
      throw new ApiError('Для активации выберите уровни доступа', { code: 'validation' })
    }

    const payload: TableUpdate<'polls'> = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      vote_mode: input.vote_mode,
      starts_at: input.starts_at || null,
      ends_at: input.ends_at || null,
      status: nextStatus,
    }

    await dataService.updateById('polls', id, payload)

    const optionsChanged =
      options.length !== existing.options.length ||
      options.some((text, index) => text !== existing.options[index]?.text)

    if (optionsChanged) {
      await rpcService.call('replace_poll_options', {
        p_poll_id: id,
        p_texts: options,
      })
    }

    if (input.level_ids) {
      await rpcService.call('set_poll_levels', {
        p_poll_id: id,
        p_level_ids: [...new Set(input.level_ids)],
      })
    }

    const full = await this.getById(id)
    if (!full) throw new ApiError('Голосование не найдено', { code: 'not_found' })
    return full
  },

  async setStatus(id: string, status: PollStatus): Promise<Poll> {
    const existing = await this.getById(id)
    if (!existing) throw new ApiError('Голосование не найдено', { code: 'not_found' })

    if (status === 'active') {
      if (existing.options.length < 2) {
        throw new ApiError('Нужно минимум два варианта ответа', { code: 'validation' })
      }
      if (!existing.level_ids.length) {
        throw new ApiError('Выберите уровни доступа перед активацией', { code: 'validation' })
      }
      assertPeriod(existing.starts_at, existing.ends_at)
    }

    await dataService.updateById('polls', id, { status })
    const full = await this.getById(id)
    if (!full) throw new ApiError('Голосование не найдено', { code: 'not_found' })
    return full
  },

  async delete(id: string): Promise<void> {
    await dataService.deleteById('polls', id)
  },

  /**
   * Active in-window polls for the current member (RLS enforces level ACL).
   * Includes own / company vote when already cast.
   */
  async listForMember(): Promise<CabinetPoll[]> {
    const user = await authService.getUser()
    const profile = user ? await authService.getProfile(user.id) : null
    const representativeId = profile?.membership?.representativeId ?? null

    const result = (await supabaseClient
      .from('polls')
      .select(MEMBER_POLL_SELECT)
      .eq('status', 'active')
      .order('ends_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })) as unknown as QueryResult<MemberPollRow[]>

    const rows = assertResult(result)
    const votes = await loadMemberVotes(
      rows.map((row) => row.id),
      representativeId,
    )

    return rows.map((row) => normalizeMemberPoll(row, votes.get(row.id) ?? null))
  },

  /** Member detail. Null when poll is unavailable (closed, out of window, no ACL). */
  async getForMemberById(id: string): Promise<CabinetPoll | null> {
    const user = await authService.getUser()
    const profile = user ? await authService.getProfile(user.id) : null
    const representativeId = profile?.membership?.representativeId ?? null

    const result = (await supabaseClient
      .from('polls')
      .select(MEMBER_POLL_SELECT)
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle()) as unknown as QueryResult<MemberPollRow | null>

    const row = assertResult(result)
    if (!row) return null

    const votes = await loadMemberVotes([row.id], representativeId)
    return normalizeMemberPoll(row, votes.get(row.id) ?? null)
  },

  async castVote(pollId: string, optionId: string): Promise<TableRow<'poll_votes'>> {
    try {
      return await rpcService.call('cast_vote', {
        p_poll_id: pollId,
        p_option_id: optionId,
      })
    } catch (error) {
      mapCastVoteError(error)
    }
  },

  /** Aggregated results for admin charts/stats (single SQL RPC). */
  async getResults(pollId: string): Promise<PollResults> {
    const raw = await rpcService.call('get_poll_results', { p_poll_id: pollId })
    return normalizePollResults(raw)
  },

  /** Denormalized voter list for admin (single SQL RPC, join in DB). */
  async listVotes(pollId: string): Promise<PollVoteRow[]> {
    const rows = await rpcService.call('list_poll_votes_admin', { p_poll_id: pollId })
    return (rows ?? []).map((row) => ({
      id: row.id,
      voted_at: row.voted_at,
      option_id: row.option_id,
      option_text: row.option_text,
      option_sort_order: row.option_sort_order,
      representative_id: row.representative_id,
      representative_name: row.representative_name,
      representative_email: row.representative_email,
      company_id: row.company_id,
      company_name: row.company_name,
    }))
  },
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return fallback
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizePollResults(raw: Json): PollResults {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('Некорректный ответ результатов голосования', { code: 'unknown' })
  }

  const data = raw as Record<string, unknown>
  const optionsRaw = Array.isArray(data.options) ? data.options : []

  const options: PollResultsOption[] = optionsRaw
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      return {
        id: asString(row.id),
        text: asString(row.text),
        sort_order: asNumber(row.sort_order),
        votes_count: asNumber(row.votes_count),
        share: asNumber(row.share),
      }
    })
    .filter((item): item is PollResultsOption => Boolean(item?.id))

  const voteMode = data.vote_mode
  if (voteMode !== 'per_company' && voteMode !== 'per_representative') {
    throw new ApiError('Некорректный режим голосования в результатах', { code: 'unknown' })
  }

  const status = data.status
  if (status !== 'draft' && status !== 'active' && status !== 'closed') {
    throw new ApiError('Некорректный статус в результатах', { code: 'unknown' })
  }

  return {
    poll_id: asString(data.poll_id),
    title: asString(data.title),
    vote_mode: voteMode,
    status,
    votes_total: asNumber(data.votes_total),
    companies_voted: asNumber(data.companies_voted),
    eligible_total: asNumber(data.eligible_total),
    turnout_share: asNumber(data.turnout_share),
    first_voted_at: typeof data.first_voted_at === 'string' ? data.first_voted_at : null,
    last_voted_at: typeof data.last_voted_at === 'string' ? data.last_voted_at : null,
    options,
  }
}
