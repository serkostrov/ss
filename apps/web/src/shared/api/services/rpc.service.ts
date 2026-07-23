import { supabaseClient } from '../lib/client'
import { unwrap } from '../lib/helpers'
import type {
  CreateRepresentativePayload,
  RpcArgs,
  RpcName,
  RpcReturns,
  UserStatus,
} from '../types/database'
import { auditService } from './audit.service'

type RpcAuditSpec = {
  action: string
  entity_type: string
  entityId?: (args: Record<string, unknown>) => string | null
}

/** Admin RPCs that should appear in audit_log (excludes member/self ops). */
const RPC_AUDIT: Partial<Record<RpcName, RpcAuditSpec>> = {
  confirm_registration: {
    action: 'registration.confirm',
    entity_type: 'users',
    entityId: (args) => String(args.p_user_id ?? ''),
  },
  reject_registration: {
    action: 'registration.reject',
    entity_type: 'users',
    entityId: (args) => String(args.p_user_id ?? ''),
  },
  set_user_status: {
    action: 'user.set_status',
    entity_type: 'users',
    entityId: (args) => String(args.p_user_id ?? ''),
  },
  delete_participation_level: {
    action: 'participation_levels.delete',
    entity_type: 'participation_levels',
    entityId: (args) => String(args.p_level_id ?? ''),
  },
  reorder_participation_levels: {
    action: 'participation_levels.reorder',
    entity_type: 'participation_levels',
  },
  set_primary_representative: {
    action: 'representatives.set_primary',
    entity_type: 'representatives',
    entityId: (args) => String(args.p_representative_id ?? ''),
  },
  upsert_representative: {
    action: 'representatives.upsert',
    entity_type: 'representatives',
    entityId: (args) => (args.p_id != null ? String(args.p_id) : null),
  },
  reorder_material_sections: {
    action: 'material_sections.reorder',
    entity_type: 'material_sections',
  },
  reorder_material_documents: {
    action: 'material_documents.reorder',
    entity_type: 'material_documents',
    entityId: (args) => String(args.p_section_id ?? ''),
  },
  set_material_section_levels: {
    action: 'material_sections.set_levels',
    entity_type: 'material_sections',
    entityId: (args) => String(args.p_section_id ?? ''),
  },
  bulk_set_material_section_levels: {
    action: 'material_sections.bulk_set_levels',
    entity_type: 'material_sections',
  },
  set_poll_levels: {
    action: 'polls.set_levels',
    entity_type: 'polls',
    entityId: (args) => String(args.p_poll_id ?? ''),
  },
  replace_poll_options: {
    action: 'polls.replace_options',
    entity_type: 'polls',
    entityId: (args) => String(args.p_poll_id ?? ''),
  },
  bulk_add_work_group_members: {
    action: 'work_group_members.bulk_add',
    entity_type: 'work_groups',
    entityId: (args) => String(args.p_work_group_id ?? ''),
  },
  reorder_work_group_links: {
    action: 'work_group_links.reorder',
    entity_type: 'work_groups',
    entityId: (args) => String(args.p_work_group_id ?? ''),
  },
}

/**
 * Typed RPC gateway. Prefer this over direct client.rpc.
 */
export const rpcService = {
  async call<T extends RpcName>(fn: T, args: RpcArgs<T>): Promise<RpcReturns<T>> {
    const result = await supabaseClient.rpc(fn, args as never)
    const data = unwrap(result) as unknown as RpcReturns<T>

    const spec = RPC_AUDIT[fn]
    if (spec) {
      const argsRecord = args as Record<string, unknown>
      void auditService.log({
        action: spec.action,
        entity_type: spec.entity_type,
        entity_id: spec.entityId?.(argsRecord) || null,
        payload: { rpc: fn, args: argsRecord } as never,
      })
    }

    return data
  },

  castVote(pollId: string, optionId: string) {
    return this.call('cast_vote', { p_poll_id: pollId, p_option_id: optionId })
  },

  confirmRegistration(input: {
    userId: string
    representativeId?: string | null
    createRepresentative?: CreateRepresentativePayload | null
  }) {
    return this.call('confirm_registration', {
      p_user_id: input.userId,
      p_representative_id: input.representativeId ?? null,
      p_create_representative: input.createRepresentative ?? null,
    })
  },

  rejectRegistration(userId: string) {
    return this.call('reject_registration', { p_user_id: userId })
  },

  setUserStatus(userId: string, status: Extract<UserStatus, 'confirmed' | 'blocked'>) {
    return this.call('set_user_status', {
      p_user_id: userId,
      p_status: status,
    })
  },

  getParticipationLevelUsage(levelId: string) {
    return this.call('get_participation_level_usage', { p_level_id: levelId })
  },

  deleteParticipationLevel(levelId: string) {
    return this.call('delete_participation_level', { p_level_id: levelId })
  },

  reorderParticipationLevels(orderedIds: string[]) {
    return this.call('reorder_participation_levels', { p_ordered_ids: orderedIds })
  },

  setPrimaryRepresentative(representativeId: string) {
    return this.call('set_primary_representative', { p_representative_id: representativeId })
  },

  upsertRepresentative(args: RpcArgs<'upsert_representative'>) {
    return this.call('upsert_representative', args)
  },

  reorderMaterialSections(orderedIds: string[]) {
    return this.call('reorder_material_sections', { p_ordered_ids: orderedIds })
  },

  setMaterialSectionLevels(sectionId: string, levelIds: string[]) {
    return this.call('set_material_section_levels', {
      p_section_id: sectionId,
      p_level_ids: levelIds,
    })
  },

  setPollLevels(pollId: string, levelIds: string[]) {
    return this.call('set_poll_levels', {
      p_poll_id: pollId,
      p_level_ids: levelIds,
    })
  },

  replacePollOptions(pollId: string, texts: string[]) {
    return this.call('replace_poll_options', {
      p_poll_id: pollId,
      p_texts: texts,
    })
  },

  getPollResults(pollId: string) {
    return this.call('get_poll_results', { p_poll_id: pollId })
  },

  listPollVotesAdmin(pollId: string) {
    return this.call('list_poll_votes_admin', { p_poll_id: pollId })
  },

  bulkSetMaterialSectionLevels(sectionIds: string[], levelIds: string[], mode = 'replace') {
    return this.call('bulk_set_material_section_levels', {
      p_section_ids: sectionIds,
      p_level_ids: levelIds,
      p_mode: mode,
    })
  },

  bulkAddWorkGroupMembers(
    workGroupId: string,
    representativeIds: string[],
    addedBy?: string | null,
  ) {
    return this.call('bulk_add_work_group_members', {
      p_work_group_id: workGroupId,
      p_representative_ids: representativeIds,
      p_added_by: addedBy ?? null,
    })
  },

  reorderWorkGroupLinks(workGroupId: string, orderedIds: string[]) {
    return this.call('reorder_work_group_links', {
      p_work_group_id: workGroupId,
      p_ordered_ids: orderedIds,
    })
  },
}
