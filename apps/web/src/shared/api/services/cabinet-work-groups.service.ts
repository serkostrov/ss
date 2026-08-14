import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type {
  WorkGroupMembershipRequestKind,
  WorkGroupStatus,
} from '../types/database'
import { workGroupLinksService, type WorkGroupLink } from './work-group-links.service'
import { workGroupMembershipRequestsService } from './work-group-membership-requests.service'

export type CabinetWorkGroup = {
  id: string
  name: string
  description: string | null
  status: WorkGroupStatus
  category_id: string | null
  category_name: string | null
  is_member: boolean
  is_responsible: boolean
  joined_at: string | null
  pending_request_id: string | null
  pending_request_kind: WorkGroupMembershipRequestKind | null
  pending_request_at: string | null
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

export const cabinetWorkGroupsService = {
  async list(): Promise<CabinetWorkGroup[]> {
    const result = (await supabaseClient.rpc('list_cabinet_work_groups')) as QueryResult<
      CabinetWorkGroup[]
    >
    return assertResult(result)
  },

  async getById(id: string): Promise<CabinetWorkGroup | null> {
    const rows = await this.list()
    return rows.find((row) => row.id === id) ?? null
  },

  async listLinks(workGroupId: string): Promise<WorkGroupLink[]> {
    return workGroupLinksService.listByGroup(workGroupId)
  },

  async getDownloadUrl(link: WorkGroupLink): Promise<string> {
    return workGroupLinksService.getDownloadUrl(link)
  },

  requestMembership(workGroupId: string, kind: WorkGroupMembershipRequestKind) {
    return workGroupMembershipRequestsService.request(workGroupId, kind)
  },
}
