export { MaterialCategoriesPanel } from './ui/material-categories-panel'
export type { MaterialCategoriesPanelHandle } from './ui/material-categories-panel'
export { MaterialCategoryFormDialog } from './ui/material-category-form-dialog'

export {
  useMaterialCategories,
  useActiveMaterialCategories,
  useMaterialCategoryUsage,
  useCreateMaterialCategoryMutation,
  useUpdateMaterialCategoryMutation,
  useToggleMaterialCategoryActiveMutation,
  useMoveMaterialCategoryMutation,
  useDeleteMaterialCategoryMutation,
} from './model/use-material-categories'

export {
  materialCategoryFormSchema,
  materialCategoryActiveFilterSchema,
  activeFilterLabel,
} from './model/schemas'
export type { MaterialCategoryFormValues, MaterialCategoryActiveFilter } from './model/schemas'
