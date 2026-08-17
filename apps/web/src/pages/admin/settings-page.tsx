import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'

import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { DirectionsPanel, type DirectionsPanelHandle } from '@features/directions'
import {
  AccessStatusesPanel,
  type AccessStatusesPanelHandle,
} from '@features/access-statuses'
import { LevelsPanel, type LevelsPanelHandle } from '@features/levels'
import {
  MaterialCategoriesPanel,
  type MaterialCategoriesPanelHandle,
} from '@features/material-categories'
import {
  Okpd2CodesPanel,
  type Okpd2CodesPanelHandle,
  ProductNotesPanel,
  type ProductNotesPanelHandle,
} from '@features/product-categories'
import { RegisteredUsersPanel } from '@features/registered-users'
import {
  ErrorState,
  PageHeader,
  PageHeaderAction,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui'

type SettingsTab =
  | 'users'
  | 'accessStatuses'
  | 'levels'
  | 'directions'
  | 'materialCategories'
  | 'okpd2'
  | 'productNotes'

export function AdminSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('users')
  const accessStatusesRef = useRef<AccessStatusesPanelHandle>(null)
  const levelsRef = useRef<LevelsPanelHandle>(null)
  const directionsRef = useRef<DirectionsPanelHandle>(null)
  const materialCategoriesRef = useRef<MaterialCategoriesPanelHandle>(null)
  const okpd2Ref = useRef<Okpd2CodesPanelHandle>(null)
  const productNotesRef = useRef<ProductNotesPanelHandle>(null)

  const showAddAction = tab !== 'users'

  const addPermission =
    tab === 'accessStatuses'
      ? permissions['admin.companies']
      : tab === 'levels'
      ? permissions['admin.levels']
      : tab === 'directions'
        ? permissions['admin.workGroups']
        : tab === 'materialCategories'
          ? permissions['admin.materials']
          : permissions['admin.companies']

  return (
    <CanAccess
      permission={permissions['admin.settings']}
      fallback={<ErrorState title="Нет доступа" description="Недостаточно прав для настроек." />}
    >
      <div className="space-y-6">
        <PageHeader
          title="Настройки"
          description="Параметры системы, справочники и учётные записи."
        />

        <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="w-auto">
              <TabsTrigger value="users">Пользователи</TabsTrigger>
              <TabsTrigger value="accessStatuses">Статусы доступа</TabsTrigger>
              <TabsTrigger value="levels">Уровни</TabsTrigger>
              <TabsTrigger value="directions">Направления</TabsTrigger>
              <TabsTrigger value="materialCategories">Категории материалов</TabsTrigger>
              <TabsTrigger value="okpd2">ОКПД 2</TabsTrigger>
              <TabsTrigger value="productNotes">Примечание продукции</TabsTrigger>
            </TabsList>
            {showAddAction ? (
              <CanAccess permission={addPermission}>
                <PageHeaderAction
                  type="button"
                  onClick={() => {
                    if (tab === 'accessStatuses') accessStatusesRef.current?.openCreate()
                    else if (tab === 'levels') levelsRef.current?.openCreate()
                    else if (tab === 'directions') directionsRef.current?.openCreate()
                    else if (tab === 'materialCategories') {
                      materialCategoriesRef.current?.openCreate()
                    } else if (tab === 'okpd2') {
                      okpd2Ref.current?.openCreate()
                    } else {
                      productNotesRef.current?.openCreate()
                    }
                  }}
                >
                  <Plus className="size-4" />
                  Добавить
                </PageHeaderAction>
              </CanAccess>
            ) : null}
          </div>

          <TabsContent value="users">
            <RegisteredUsersPanel />
          </TabsContent>

          <TabsContent value="accessStatuses">
            <CanAccess
              permission={permissions['admin.companies']}
              fallback={
                <ErrorState
                  title="Нет доступа"
                  description="Недостаточно прав для управления статусами доступа."
                />
              }
            >
              <AccessStatusesPanel ref={accessStatusesRef} />
            </CanAccess>
          </TabsContent>

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

          <TabsContent value="materialCategories">
            <CanAccess
              permission={permissions['admin.materials']}
              fallback={
                <ErrorState
                  title="Нет доступа"
                  description="Недостаточно прав для управления категориями материалов."
                />
              }
            >
              <MaterialCategoriesPanel ref={materialCategoriesRef} embedded />
            </CanAccess>
          </TabsContent>

          <TabsContent value="okpd2">
            <CanAccess
              permission={permissions['admin.companies']}
              fallback={
                <ErrorState
                  title="Нет доступа"
                  description="Недостаточно прав для управления классификатором ОКПД 2."
                />
              }
            >
              <Okpd2CodesPanel ref={okpd2Ref} />
            </CanAccess>
          </TabsContent>

          <TabsContent value="productNotes">
            <CanAccess
              permission={permissions['admin.companies']}
              fallback={
                <ErrorState
                  title="Нет доступа"
                  description="Недостаточно прав для управления примечаниями продукции."
                />
              }
            >
              <ProductNotesPanel ref={productNotesRef} />
            </CanAccess>
          </TabsContent>

        </Tabs>
      </div>
    </CanAccess>
  )
}
