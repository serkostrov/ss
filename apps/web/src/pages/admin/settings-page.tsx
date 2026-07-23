import { useRef } from 'react'
import { Plus } from 'lucide-react'

import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
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

export function AdminSettingsPage() {
  const levelsRef = useRef<LevelsPanelHandle>(null)

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

        <Tabs defaultValue="levels">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="w-auto">
              <TabsTrigger value="levels">Уровни</TabsTrigger>
            </TabsList>
            <CanAccess permission={permissions['admin.levels']}>
              <PageHeaderAction
                type="button"
                onClick={() => levelsRef.current?.openCreate()}
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
        </Tabs>
      </div>
    </CanAccess>
  )
}
