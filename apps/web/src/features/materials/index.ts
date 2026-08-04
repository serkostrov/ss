export { MaterialsPanel } from './ui/materials-panel'
export { MaterialSectionEditor } from './ui/material-section-editor'
export { MaterialSectionCreateDialog } from './ui/material-section-create-dialog'
export { MaterialModerationPanel } from './ui/material-moderation-panel'

export {
  useMaterialSections,
  useMaterialSection,
  useMaterialSectionBySlug,
  useMaterialSectionsForModeration,
  useLevelsForMaterialAcl,
  useCreateMaterialSectionMutation,
  useUpdateMaterialSectionMutation,
  usePublishMaterialSectionMutation,
  useReviewMaterialSectionMutation,
  useMoveMaterialSectionMutation,
  useDeleteMaterialSectionMutation,
  toMaterialSectionInput,
} from './model/use-materials'

export {
  materialSectionFormSchema,
  materialStatusFilterSchema,
  materialStatusFilterLabel,
  formatMaterialDate,
} from './model/schemas'
export type { MaterialSectionFormValues, MaterialStatusFilter } from './model/schemas'
