export { WorkGroupMessengerConnectionsPanel } from './ui/work-group-messenger-connections-panel'
export { WorkGroupMessengerWorkspace } from './ui/work-group-messenger-workspace'
export { MessengerConnectionFormDialog } from './ui/messenger-connection-form-dialog'

export {
  useMessengerConnections,
  useUpsertMessengerConnectionMutation,
  useUpdateMessengerConnectionMutation,
  useDeleteMessengerConnectionMutation,
  toMessengerConnectionInput,
  availablePlatforms,
  boundChatIds,
} from './model/use-messenger-connections'
export type { MessengerConnection } from './model/use-messenger-connections'

export {
  messengerConnectionFormSchema,
  messengerPlatformLabel,
  botStatusLabel,
  formatMessengerDate,
  connectionLastUpdate,
} from './model/schemas'
export type { MessengerConnectionFormValues } from './model/schemas'
