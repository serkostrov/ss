import { WorkGroupMessengerWorkspace } from '@features/messengers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui'

import { WorkGroupLinksPanel } from './work-group-links-panel'
import { WorkGroupMembersPanel } from './work-group-members-panel'

type WorkGroupSectionTabsProps = {
  workGroupId: string
}

export function WorkGroupSectionTabs({ workGroupId }: WorkGroupSectionTabsProps) {
  return (
    <Tabs defaultValue="chats">
      <TabsList>
        <TabsTrigger value="chats">Чаты</TabsTrigger>
        <TabsTrigger value="members">Участники</TabsTrigger>
        <TabsTrigger value="links">Ссылки</TabsTrigger>
      </TabsList>

      <TabsContent value="chats" className="mt-4">
        <WorkGroupMessengerWorkspace workGroupId={workGroupId} />
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
