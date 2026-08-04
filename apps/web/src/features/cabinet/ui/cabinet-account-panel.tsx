import { useState } from 'react'
import { Building2, Pencil, UserRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { Button, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui'

import { CabinetCompanyPanel } from './cabinet-company-panel'
import { CabinetProfilePanel } from './cabinet-profile-panel'

export function CabinetAccountPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'company' ? 'company' : 'profile'
  const [profileEditing, setProfileEditing] = useState(false)
  const [companyEditing, setCompanyEditing] = useState(false)

  const isEditing = activeTab === 'company' ? companyEditing : profileEditing
  const setEditing = activeTab === 'company' ? setCompanyEditing : setProfileEditing
  const editLabel = activeTab === 'company' ? 'Редактировать компанию' : 'Редактировать профиль'

  return (
    <div className="space-y-5">
      <PageHeader title="Кабинет" description="Личные данные и информация о вашей компании." />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setProfileEditing(false)
          setCompanyEditing(false)
          setSearchParams(value === 'company' ? { tab: 'company' } : {}, { replace: true })
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="profile" className="flex-1 gap-2 sm:flex-none">
              <UserRound className="size-4" />
              Профиль
            </TabsTrigger>
            <TabsTrigger value="company" className="flex-1 gap-2 sm:flex-none">
              <Building2 className="size-4" />
              Компания
            </TabsTrigger>
          </TabsList>

          {!isEditing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
              {editLabel}
            </Button>
          ) : null}
        </div>

        <TabsContent value="profile">
          <CabinetProfilePanel isEditing={profileEditing} onEditingChange={setProfileEditing} />
        </TabsContent>
        <TabsContent value="company">
          <CabinetCompanyPanel isEditing={companyEditing} onEditingChange={setCompanyEditing} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
