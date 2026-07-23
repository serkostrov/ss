import { Navigate } from 'react-router-dom'
import { Clock3 } from 'lucide-react'

import { useAuth } from '@app/providers'
import { LogoutButton } from '@features/auth'
import { routes } from '@shared/config'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui'

export function CabinetPendingPage() {
  const { profile } = useAuth()

  if (profile?.status === 'blocked') {
    return <Navigate to={routes.cabinet.blocked} replace />
  }

  if (profile?.status === 'confirmed') {
    return <Navigate to={routes.cabinet.root} replace />
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Clock3 className="size-5" aria-hidden />
        </div>
        <CardTitle>Заявка на рассмотрении</CardTitle>
        <CardDescription>
          Админ ассоциации проверяет данные. Доступ к материалам и голосованиям откроется после
          подтверждения.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          {profile?.fullName ? (
            <p>
              <span className="text-muted-foreground">ФИО: </span>
              {profile.fullName}
            </p>
          ) : null}
          {profile?.email ? (
            <p>
              <span className="text-muted-foreground">Email: </span>
              {profile.email}
            </p>
          ) : null}
          {profile?.companyNameHint ? (
            <p>
              <span className="text-muted-foreground">Компания (из заявки): </span>
              {profile.companyNameHint}
            </p>
          ) : null}
        </div>
        <Alert>
          <AlertTitle>Что дальше?</AlertTitle>
          <AlertDescription>
            Обычно рассмотрение занимает 1–2 рабочих дня. После подтверждения откроется личный
            кабинет с материалами вашего уровня участия.
          </AlertDescription>
        </Alert>
        <LogoutButton variant="outline" />
      </CardContent>
    </Card>
  )
}
