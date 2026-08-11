import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type {
  TableRow,
  WorkGroupMembershipRequestKind,
  WorkGroupMembershipRequestStatus,
} from '../types/database'
import { rpcService } from './rpc.service'

export type WorkGroupMembershipRequest = TableRow<'work_group_membership_requests'> & {
  workGroup: { id: string; name: string } | null
  company: { id: string; name: string } | null
  representative: { id: string; full_name: string | null; email: string | null } | null
}

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
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

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export const workGroupMembershipRequestsService = {
  async list(
    status: WorkGroupMembershipRequestStatus | 'all' = 'pending',
  ): Promise<WorkGroupMembershipRequest[]> {
    let query = supabaseClient
      .from('work_group_membership_requests')
      .select(
        `
        *,
        workGroup:work_groups ( id, name ),
        company:companies ( id, name ),
        representative:representatives ( id, full_name, email )
      `,
      )
      .order('created_at', { ascending: false })

    if (status !== 'all') query = query.eq('status', status)

    type RawRequest = TableRow<'work_group_membership_requests'> & {
      workGroup:
        | WorkGroupMembershipRequest['workGroup']
        | WorkGroupMembershipRequest['workGroup'][]
      company: WorkGroupMembershipRequest['company'] | WorkGroupMembershipRequest['company'][]
      representative:
        | WorkGroupMembershipRequest['representative']
        | WorkGroupMembershipRequest['representative'][]
    }

    const rows = assertResult((await query) as unknown as QueryResult<RawRequest[]>)
    return rows.map((row) => ({
      ...row,
      workGroup: normalizeRelation(row.workGroup),
      company: normalizeRelation(row.company),
      representative: normalizeRelation(row.representative),
    }))
  },

  review(requestId: string, approve: boolean, note?: string | null) {
    return rpcService.call('review_work_group_membership_request', {
      p_request_id: requestId,
      p_approve: approve,
      p_note: note ?? null,
    })
  },

  request(workGroupId: string, kind: WorkGroupMembershipRequestKind) {
    return rpcService.call('request_work_group_membership', {
      p_work_group_id: workGroupId,
      p_kind: kind,
    })
  },
}
