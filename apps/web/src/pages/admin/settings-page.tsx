import { useMemo, useRef, useState, type RefObject } from 'react'
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

import { SettingsSectionShell } from './settings-section-shell'

type SettingsSection = 'users' | 'companies' | 'directories'

type SettingsTab =
  | 'users'
  | 'accessStatuses'
  | 'levels'
  | 'directions'
  | 'materialCategories'
  | 'okpd2'
  | 'productNotes'

type SettingsTabConfig = {
  id: SettingsTab
  /** Короткая подпись на подвкладке (без повтора главного раздела). */
  label: string
  description: string
}

type SettingsSectionConfig = {
  id: SettingsSection
  label: string
  tabs: SettingsTabConfig[]
}

const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  {
    id: 'users',
    label: 'Пользователи',
    tabs: [
      {
        id: 'users',
        label: 'Учётные записи',
        description: 'Зарегистрированные пользователи, роли и статусы подтверждения.',
      },
    ],
  },
  {
    id: 'companies',
    label: 'Компании',
    tabs: [
      {
        id: 'accessStatuses',
        label: 'Статусы',
        description:
          'Что компания видит в кабинете и может ли участвовать в программе. Настройка доступа — иконка щита.',
      },
      {
        id: 'levels',
        label: 'Уровни',
        description:
          'Базовый доступ к разделам кабинета в зависимости от статуса компании. Настройка — иконка щита.',
      },
    ],
  },
  {
    id: 'directories',
    label: 'Справочники',
    tabs: [
      {
        id: 'directions',
        label: 'Направления',
        description: 'Направления деятельности для рабочих групп.',
      },
      {
        id: 'materialCategories',
        label: 'Материалы',
        description: 'Категории разделов материалов в кабинете участников.',
      },
      {
        id: 'okpd2',
        label: 'ОКПД 2',
        description: 'Классификатор продукции и услуг для карточек компаний.',
      },
      {
        id: 'productNotes',
        label: 'Примечания',
        description: 'Типовые примечания к продукции и услугам в карточках компаний.',
      },
    ],
  },
]

const TAB_BY_SECTION = SETTINGS_SECTIONS.reduce(
  (acc, section) => {
    acc[section.id] = section.tabs.map((tab) => tab.id)
    return acc
  },
  {} as Record<SettingsSection, SettingsTab[]>,
)

function findSectionByTab(tab: SettingsTab): SettingsSection {
  for (const section of SETTINGS_SECTIONS) {
    if (section.tabs.some((item) => item.id === tab)) return section.id
  }
  return 'users'
}

function getTabConfig(tab: SettingsTab): SettingsTabConfig | undefined {
  for (const section of SETTINGS_SECTIONS) {
    const match = section.tabs.find((item) => item.id === tab)
    if (match) return match
  }
  return undefined
}

function renderTabContent(
  tab: SettingsTab,
  refs: {
    accessStatuses: RefObject<AccessStatusesPanelHandle>
    levels: RefObject<LevelsPanelHandle>
    directions: RefObject<DirectionsPanelHandle>
    materialCategories: RefObject<MaterialCategoriesPanelHandle>
    okpd2: RefObject<Okpd2CodesPanelHandle>
    productNotes: RefObject<ProductNotesPanelHandle>
  },
) {
  switch (tab) {
    case 'users':
      return <RegisteredUsersPanel />
    case 'accessStatuses':
      return (
        <CanAccess
          permission={permissions['admin.companies']}
          fallback={
            <ErrorState
              title="Нет доступа"
              description="Недостаточно прав для управления статусами."
            />
          }
        >
          <AccessStatusesPanel ref={refs.accessStatuses} embedded />
        </CanAccess>
      )
    case 'levels':
      return (
        <CanAccess
          permission={permissions['admin.levels']}
          fallback={
            <ErrorState
              title="Нет доступа"
              description="Недостаточно прав для управления уровнями."
            />
          }
        >
          <LevelsPanel ref={refs.levels} embedded />
        </CanAccess>
      )
    case 'directions':
      return (
        <CanAccess
          permission={permissions['admin.workGroups']}
          fallback={
            <ErrorState
              title="Нет доступа"
              description="Недостаточно прав для управления направлениями."
            />
          }
        >
          <DirectionsPanel ref={refs.directions} embedded />
        </CanAccess>
      )
    case 'materialCategories':
      return (
        <CanAccess
          permission={permissions['admin.materials']}
          fallback={
            <ErrorState
              title="Нет доступа"
              description="Недостаточно прав для управления категориями материалов."
            />
          }
        >
          <MaterialCategoriesPanel ref={refs.materialCategories} embedded />
        </CanAccess>
      )
    case 'okpd2':
      return (
        <CanAccess
          permission={permissions['admin.companies']}
          fallback={
            <ErrorState
              title="Нет доступа"
              description="Недостаточно прав для управления классификатором ОКПД 2."
            />
          }
        >
          <Okpd2CodesPanel ref={refs.okpd2} embedded />
        </CanAccess>
      )
    case 'productNotes':
      return (
        <CanAccess
          permission={permissions['admin.companies']}
          fallback={
            <ErrorState
              title="Нет доступа"
              description="Недостаточно прав для управления примечаниями продукции."
            />
          }
        >
          <ProductNotesPanel ref={refs.productNotes} embedded />
        </CanAccess>
      )
  }
}

export function AdminSettingsPage() {
  const [section, setSection] = useState<SettingsSection>('users')
  const [tab, setTab] = useState<SettingsTab>('users')

  const accessStatusesRef = useRef<AccessStatusesPanelHandle>(null)
  const levelsRef = useRef<LevelsPanelHandle>(null)
  const directionsRef = useRef<DirectionsPanelHandle>(null)
  const materialCategoriesRef = useRef<MaterialCategoriesPanelHandle>(null)
  const okpd2Ref = useRef<Okpd2CodesPanelHandle>(null)
  const productNotesRef = useRef<ProductNotesPanelHandle>(null)

  const sectionConfig = useMemo(
    () => SETTINGS_SECTIONS.find((item) => item.id === section) ?? SETTINGS_SECTIONS[0],
    [section],
  )
  const tabConfig = useMemo(() => getTabConfig(tab), [tab])
  const showSubTabs = sectionConfig.tabs.length > 1
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

  const handleSectionChange = (nextSection: SettingsSection) => {
    setSection(nextSection)
    const firstTab = TAB_BY_SECTION[nextSection][0]
    if (firstTab) setTab(firstTab)
  }

  const handleTabChange = (nextTab: SettingsTab) => {
    setTab(nextTab)
    setSection(findSectionByTab(nextTab))
  }

  const openCreate = () => {
    if (tab === 'accessStatuses') accessStatusesRef.current?.openCreate()
    else if (tab === 'levels') levelsRef.current?.openCreate()
    else if (tab === 'directions') directionsRef.current?.openCreate()
    else if (tab === 'materialCategories') materialCategoriesRef.current?.openCreate()
    else if (tab === 'okpd2') okpd2Ref.current?.openCreate()
    else productNotesRef.current?.openCreate()
  }

  const addButton = showAddAction ? (
    <CanAccess permission={addPermission}>
      <PageHeaderAction type="button" onClick={openCreate}>
        <Plus className="size-4" />
        Добавить
      </PageHeaderAction>
    </CanAccess>
  ) : null

  const panelRefs = {
    accessStatuses: accessStatusesRef,
    levels: levelsRef,
    directions: directionsRef,
    materialCategories: materialCategoriesRef,
    okpd2: okpd2Ref,
    productNotes: productNotesRef,
  }

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

        <Tabs value={section} onValueChange={(value) => handleSectionChange(value as SettingsSection)}>
          <TabsList className="w-full sm:w-auto">
            {SETTINGS_SECTIONS.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {showSubTabs ? (
          <Tabs value={tab} onValueChange={(value) => handleTabChange(value as SettingsTab)}>
            <SettingsSectionShell
              tabLabel={tabConfig?.label ?? sectionConfig.label}
              description={tabConfig?.description ?? ''}
              subTabs={sectionConfig.tabs.map((item) => ({ id: item.id, label: item.label }))}
              activeTab={tab}
              onTabChange={(value) => handleTabChange(value as SettingsTab)}
              actions={addButton}
            >
              {sectionConfig.tabs.map((item) => (
                <TabsContent key={item.id} value={item.id} className="mt-0 focus-visible:outline-none">
                  {renderTabContent(item.id, panelRefs)}
                </TabsContent>
              ))}
            </SettingsSectionShell>
          </Tabs>
        ) : (
          <SettingsSectionShell
            tabLabel={tabConfig?.label ?? sectionConfig.label}
            description={tabConfig?.description ?? ''}
            actions={addButton}
          >
            {renderTabContent(tab, panelRefs)}
          </SettingsSectionShell>
        )}
      </div>
    </CanAccess>
  )
}
