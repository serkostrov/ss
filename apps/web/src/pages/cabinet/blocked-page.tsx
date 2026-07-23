import { Navigate } from 'react-router-dom'
import { Ban } from 'lucide-react'

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

export function CabinetBlockedPage() {
  const { profile } = useAuth()

  if (profile?.status === 'pending') {
    return <Navigate to={routes.cabinet.pending} replace />
  }

  if (profile?.status === 'confirmed') {
    return <Navigate to={routes.cabinet.root} replace />
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Ban className="size-5" aria-hidden />
        </div>
        <CardTitle>Доступ ограничен</CardTitle>
        <CardDescription>Учётная запись заблокирована админом ассоциации.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Материалы и голосования недоступны</AlertTitle>
          <AlertDescription>
            {profile?.email
              ? `Аккаунт ${profile.email} не может пользоваться кабинетом.`
              : 'Обратитесь к админу ассоциации для уточнения статуса.'}
          </AlertDescription>
        </Alert>
        <LogoutButton variant="outline" />
      </CardContent>
    </Card>
  )
}
