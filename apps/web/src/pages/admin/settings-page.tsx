import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'

import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import {
  DirectionsPanel,
  type DirectionsPanelHandle,
} from '@features/directions'
import { LevelsPanel, type LevelsPanelHandle } from '@features/levels'
import {
  ErrorState,
  PageHeader,
  PageHeaderAction,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui'

type SettingsTab = 'levels' | 'directions'

export function AdminSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('levels')
  const levelsRef = useRef<LevelsPanelHandle>(null)
  const directionsRef = useRef<DirectionsPanelHandle>(null)

  const addPermission =
    tab === 'levels' ? permissions['admin.levels'] : permissions['admin.workGroups']

  return (
    <CanAccess
      permission={permissions['admin.settings']}
      fallback={
        <ErrorState title="Нет доступа" description="Недостаточно прав для настроек." />
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Настройки"
          description="Параметры системы и справочники."
        />

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as SettingsTab)}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="w-auto">
              <TabsTrigger value="levels">Уровни</TabsTrigger>
              <TabsTrigger value="directions">Направления</TabsTrigger>
            </TabsList>
            <CanAccess permission={addPermission}>
              <PageHeaderAction
                type="button"
                onClick={() => {
                  if (tab === 'levels') levelsRef.current?.openCreate()
                  else directionsRef.current?.openCreate()
                }}
              >
                <Plus className="size-4" />
                Добавить
              </PageHeaderAction>
            </CanAccess>
          </div>

          <TabsContent value="levels">
            <CanAccess
              permission={permissions['admin.levels']}
              fallback={
                <ErrorState
                  title="Нет доступа"
                  description="Недостаточно прав для управления уровнями."
                />
              }
            >
              <LevelsPanel ref={levelsRef} embedded />
            </CanAccess>
          </TabsContent>

          <TabsContent value="directions">
            <CanAccess
              permission={permissions['admin.workGroups']}
              fallback={
                <ErrorState
                  title="Нет доступа"
                  description="Недостаточно прав для управления направлениями."
                />
              }
            >
              <DirectionsPanel ref={directionsRef} embedded />
            </CanAccess>
          </TabsContent>
        </Tabs>
      </div>
    </CanAccess>
  )
}
