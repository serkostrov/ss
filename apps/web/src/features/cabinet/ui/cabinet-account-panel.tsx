import { useEffect, useState } from 'react'
import { Building2, Pencil, UserRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { isExitedCompany } from '@features/cabinet/model/company-access'
import { Button, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui'

import { CabinetCompanyPanel } from './cabinet-company-panel'
import { CabinetProfilePanel } from './cabinet-profile-panel'

export function CabinetAccountPanel() {
  const { profile } = useAuth()
  const companyOnly = isExitedCompany(profile)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = companyOnly
    ? 'company'
    : searchParams.get('tab') === 'company'
      ? 'company'
      : 'profile'
  const [profileEditing, setProfileEditing] = useState(false)
  const [companyEditing, setCompanyEditing] = useState(false)

  useEffect(() => {
    if (!companyOnly) return
    if (searchParams.get('tab') !== 'company') {
      setSearchParams({ tab: 'company' }, { replace: true })
    }
  }, [companyOnly, searchParams, setSearchParams])

  const isEditing = activeTab === 'company' ? companyEditing : profileEditing
  const setEditing = activeTab === 'company' ? setCompanyEditing : setProfileEditing
  const editLabel = activeTab === 'company' ? 'Редактировать компанию' : 'Редактировать профиль'

  return (
    <div className="space-y-5">
      <PageHeader
        title={companyOnly ? 'Компания' : 'Кабинет'}
        description={
          companyOnly
            ? 'Компания вышла из ассоциации. Доступна только карточка компании.'
            : 'Личные данные и информация о вашей компании.'
        }
        actions={
          !isEditing ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              {editLabel}
            </Button>
          ) : null
        }
      />

      {companyOnly ? (
        <CabinetCompanyPanel isEditing={companyEditing} onEditingChange={setCompanyEditing} />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setProfileEditing(false)
            setCompanyEditing(false)
            setSearchParams(value === 'company' ? { tab: 'company' } : {}, { replace: true })
          }}
        >
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

          <TabsContent value="profile">
            <CabinetProfilePanel isEditing={profileEditing} onEditingChange={setProfileEditing} />
          </TabsContent>
          <TabsContent value="company">
            <CabinetCompanyPanel isEditing={companyEditing} onEditingChange={setCompanyEditing} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
