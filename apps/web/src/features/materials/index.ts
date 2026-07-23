export { MaterialsPanel } from './ui/materials-panel'
export { MaterialSectionEditor } from './ui/material-section-editor'
export { MaterialSectionCreateDialog } from './ui/material-section-create-dialog'

export {
  useMaterialSections,
  useMaterialSection,
  useMaterialSectionBySlug,
  useLevelsForMaterialAcl,
  useCreateMaterialSectionMutation,
  useUpdateMaterialSectionMutation,
  usePublishMaterialSectionMutation,
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
