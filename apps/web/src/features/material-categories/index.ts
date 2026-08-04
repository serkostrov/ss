export { MaterialCategoriesPanel } from './ui/material-categories-panel'
export type { MaterialCategoriesPanelHandle } from './ui/material-categories-panel'
export { MaterialCategoryFormDialog } from './ui/material-category-form-dialog'
export { MaterialCategoryModerationPanel } from './ui/material-category-moderation-panel'

export {
  useMaterialCategories,
  useActiveMaterialCategories,
  useMaterialCategoriesForModeration,
  useMaterialCategoryUsage,
  useCreateMaterialCategoryMutation,
  useUpdateMaterialCategoryMutation,
  useToggleMaterialCategoryActiveMutation,
  useMoveMaterialCategoryMutation,
  useDeleteMaterialCategoryMutation,
  useReviewMaterialCategoryMutation,
} from './model/use-material-categories'

export {
  materialCategoryFormSchema,
  materialCategoryActiveFilterSchema,
  activeFilterLabel,
} from './model/schemas'
export type { MaterialCategoryFormValues, MaterialCategoryActiveFilter } from './model/schemas'
