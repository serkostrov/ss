import { Building2, UserRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui'

import { CabinetCompanyPanel } from './cabinet-company-panel'
import { CabinetProfilePanel } from './cabinet-profile-panel'

export function CabinetAccountPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'company' ? 'company' : 'profile'

  return (
    <div className="space-y-5">
      <PageHeader title="Кабинет" description="Личные данные и информация о вашей компании." />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
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
          <CabinetProfilePanel />
        </TabsContent>
        <TabsContent value="company">
          <CabinetCompanyPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
