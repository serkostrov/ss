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
      <TabsList className="h-9 w-auto gap-0.5 rounded-lg p-0.5">
        <TabsTrigger value="chats" className="h-8 rounded-md px-2.5 text-sm">
          Чаты
        </TabsTrigger>
        <TabsTrigger value="members" className="h-8 rounded-md px-2.5 text-sm">
          Участники
        </TabsTrigger>
        <TabsTrigger value="links" className="h-8 rounded-md px-2.5 text-sm">
          Ссылки
        </TabsTrigger>
      </TabsList>

      <TabsContent value="chats" className="mt-3 data-[state=inactive]:hidden">
        <WorkGroupMessengerWorkspace workGroupId={workGroupId} />
      </TabsContent>

      <TabsContent value="members" className="data-[state=inactive]:hidden">
        <WorkGroupMembersPanel workGroupId={workGroupId} />
      </TabsContent>

      <TabsContent value="links" className="data-[state=inactive]:hidden">
        <WorkGroupLinksPanel workGroupId={workGroupId} />
      </TabsContent>
    </Tabs>
  )
}
