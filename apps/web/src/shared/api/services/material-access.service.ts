import { ApiError } from '@shared/lib/errors'

import { rpcService } from './rpc.service'
import {
  materialsService,
  type MaterialLevelRef,
  type MaterialSection,
} from './materials.service'

export type MaterialAccessMode = 'replace' | 'add' | 'remove'

export type BulkMaterialAccessInput = {
  sectionIds: string[]
  levelIds: string[]
  mode: MaterialAccessMode
}

/**
 * Access control for material sections via material_section_levels.
 * Prefer bulk RPC over N× setLevels calls.
 */
export const materialAccessService = {
  async getSectionLevels(sectionId: string): Promise<MaterialLevelRef[]> {
    const section = await materialsService.getById(sectionId)
    if (!section) throw new ApiError('Раздел не найден', { code: 'not_found' })
    return section.levels
  },

  async setSectionLevels(sectionId: string, levelIds: string[]): Promise<MaterialSection> {
    const unique = [...new Set(levelIds)]
    return materialsService.setLevels(sectionId, unique)
  },

  /**
   * Apply ACL to many sections in one round-trip.
   * - replace: overwrite levels
   * - add: union with existing
   * - remove: subtract selected levels
   */
  async bulkSetLevels(input: BulkMaterialAccessInput): Promise<number> {
    const sectionIds = [...new Set(input.sectionIds.filter(Boolean))]
    const levelIds = [...new Set(input.levelIds.filter(Boolean))]

    if (!sectionIds.length) {
      throw new ApiError('Выберите хотя бы один раздел', { code: 'validation' })
    }

    if (input.mode !== 'replace' && !levelIds.length) {
      throw new ApiError('Выберите хотя бы один уровень', { code: 'validation' })
    }

    const updated = await rpcService.call('bulk_set_material_section_levels', {
      p_section_ids: sectionIds,
      p_level_ids: levelIds,
      p_mode: input.mode,
    })

    return typeof updated === 'number' ? updated : Number(updated ?? 0)
  },
}

export type { MaterialLevelRef, MaterialSection }
