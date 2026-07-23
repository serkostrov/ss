import type { ReactNode } from 'react'

import type { MessengerPlatform } from '@shared/api'
import { WorkGroupMessengerConnectionsPanel } from '@features/messengers'
import { WorkGroupMessagesPanel } from '@features/messages'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui'

import { WorkGroupLinksPanel } from './work-group-links-panel'
import { WorkGroupMembersPanel } from './work-group-members-panel'

type WorkGroupSectionTabsProps = {
  workGroupId: string
}

const PLATFORMS: Array<{ id: MessengerPlatform; label: string }> = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'max', label: 'Max' },
]

function PlatformTabs({
  children,
}: {
  children: (platform: MessengerPlatform) => ReactNode
}) {
  return (
    <Tabs defaultValue="telegram">
      <TabsList className="w-auto">
        {PLATFORMS.map((item) => (
          <TabsTrigger key={item.id} value={item.id}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {PLATFORMS.map((item) => (
        <TabsContent key={item.id} value={item.id}>
          {children(item.id)}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export function WorkGroupSectionTabs({ workGroupId }: WorkGroupSectionTabsProps) {
  return (
    <Tabs defaultValue="chats">
      <TabsList>
        <TabsTrigger value="chats">Чаты</TabsTrigger>
        <TabsTrigger value="messages">История</TabsTrigger>
        <TabsTrigger value="members">Участники</TabsTrigger>
        <TabsTrigger value="links">Ссылки</TabsTrigger>
      </TabsList>

      <TabsContent value="chats">
        <PlatformTabs>
          {(platform) => (
            <WorkGroupMessengerConnectionsPanel workGroupId={workGroupId} platform={platform} />
          )}
        </PlatformTabs>
      </TabsContent>

      <TabsContent value="messages">
        <PlatformTabs>
          {(platform) => (
            <WorkGroupMessagesPanel workGroupId={workGroupId} lockedSource={platform} />
          )}
        </PlatformTabs>
      </TabsContent>

      <TabsContent value="members">
        <WorkGroupMembersPanel workGroupId={workGroupId} />
      </TabsContent>

      <TabsContent value="links">
        <WorkGroupLinksPanel workGroupId={workGroupId} />
      </TabsContent>
    </Tabs>
  )
}
