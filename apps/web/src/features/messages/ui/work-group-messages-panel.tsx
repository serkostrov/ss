import { MessagesFeedPanel } from './messages-feed-panel'

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
    <MessagesFeedPanel
      workGroupId={workGroupId}
      lockedSource={lockedSource}
      showPageHeader={false}
      hideGroupFilter
    />
  )
}
