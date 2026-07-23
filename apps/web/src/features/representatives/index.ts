export { RepresentativesPanel } from './ui/representatives-panel'
export { RepresentativeDetailsCard } from './ui/representative-details-card'
export { RepresentativeFormDialog } from './ui/representative-form-dialog'
export { AssignExistingMemberDialog } from './ui/assign-existing-member-dialog'

export {
  useRepresentatives,
  useRepresentative,
  useRepresentativesByCompany,
  useCompanyOptionsForReps,
  useUpsertRepresentativeMutation,
  useSetPrimaryRepresentativeMutation,
  useToggleRepresentativeActiveMutation,
  useDeleteRepresentativeMutation,
  useMemberAssignCandidates,
  useAssignMemberToCompanyMutation,
  toRepresentativeInput,
} from './model/use-representatives'

export {
  representativeFormSchema,
  representativeActiveFilterLabel,
  representativePrimaryFilterLabel,
  formatDateTime,
} from './model/schemas'
export type {
  RepresentativeFormValues,
  RepresentativeActiveFilter,
  RepresentativePrimaryFilter,
} from './model/schemas'
