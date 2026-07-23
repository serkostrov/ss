import { MessagesHistoryPanel } from './messages-history-panel'

import type { MessageSource } from '@shared/api'

type WorkGroupMessagesPanelProps = {
  workGroupId: string
  lockedSource?: MessageSource
}

export function WorkGroupMessagesPanel({
  workGroupId,
  lockedSource,
}: WorkGroupMessagesPanelProps) {
  return (
    <MessagesHistoryPanel
      workGroupId={workGroupId}
      lockedSource={lockedSource}
      showPageHeader={false}
    />
  )
}
