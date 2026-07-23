import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui'

type PagePlaceholderProps = {
  title: string
  description?: string
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Раздел подготовлен. Бизнес-логика будет добавлена позже.</p>
      </CardContent>
    </Card>
  )
}
