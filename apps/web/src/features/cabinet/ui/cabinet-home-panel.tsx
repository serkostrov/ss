import { Link } from 'react-router-dom'
import { Building2, FileText, ShieldAlert, Vote } from 'lucide-react'

import { useAuth } from '@app/providers'
import { routes } from '@shared/config'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@shared/ui'

import { useCabinetMaterials } from '../model/use-cabinet-materials'

export function CabinetHomePanel() {
  const { profile } = useAuth()
  const materials = useCabinetMaterials()
  const membership = profile?.membership

  const companyActive = membership?.accessStatus === 'active'
  const hasLevel = Boolean(membership?.participationLevelId)

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile?.fullName ? `Здравствуйте, ${profile.fullName}` : 'Личный кабинет'}
        description="Материалы и голосования Ассоциации, доступные вашей компании."
      />

      {!membership ? (
        <Alert>
          <AlertTitle>Профиль не привязан к компании</AlertTitle>
          <AlertDescription>
            Обратитесь к админу ассоциации — без представителя и компании материалы недоступны.
          </AlertDescription>
        </Alert>
      ) : null}

      {membership && !companyActive ? (
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>Доступ компании ограничен</AlertTitle>
          <AlertDescription>
            Статус компании «{membership.companyName}»: {membership.accessStatus}. Материалы скрыты
            до восстановления доступа.
          </AlertDescription>
        </Alert>
      ) : null}

      {membership && companyActive && !hasLevel ? (
        <Alert>
          <AlertTitle>Не назначен уровень участия</AlertTitle>
          <AlertDescription>
            Для компании «{membership.companyName}» ещё не указан уровень — разделы материалов
            появятся после назначения.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Компания
            </CardTitle>
            <CardDescription>Данные через связанного представителя</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {membership ? (
              <>
                <p>
                  <span className="text-muted-foreground">Название: </span>
                  {membership.companyName}
                </p>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Статус:</span>
                  {companyActive ? (
                    <StatusBadge status="active" label="Активна" />
                  ) : (
                    <StatusBadge status="blocked" label={membership.accessStatus} />
                  )}
                </p>
                <p>
                  <span className="text-muted-foreground">Уровень: </span>
                  {membership.participationLevelName ?? 'не назначен'}
                </p>
                {membership.representativeName ? (
                  <p>
                    <span className="text-muted-foreground">Представитель: </span>
                    {membership.representativeName}
                  </p>
                ) : null}
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link to={routes.cabinet.company}>Редактировать компанию</Link>
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                {profile?.companyNameHint
                  ? `Указано при регистрации: ${profile.companyNameHint}`
                  : 'Нет данных о компании'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" />
              Материалы
            </CardTitle>
            <CardDescription>Только разделы вашего уровня</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {materials.isLoading ? <LoadingState label="Загрузка…" /> : null}
            {!materials.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Доступно разделов: {(materials.data ?? []).length}
              </p>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link to={routes.cabinet.materials}>Открыть материалы</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Vote className="size-4" />
              Голосования
            </CardTitle>
            <CardDescription>Активные опросы Ассоциации</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to={routes.cabinet.polls}>Перейти к голосованиям</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Участники ассоциации
            </CardTitle>
            <CardDescription>Компании и представители</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to={routes.cabinet.directory}>Открыть справочник</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
