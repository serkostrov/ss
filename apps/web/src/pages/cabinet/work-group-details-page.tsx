import { useParams } from 'react-router-dom'

import { CabinetWorkGroupDetailsPanel } from '@features/cabinet'
import { ErrorState } from '@shared/ui'

export function CabinetWorkGroupDetailsPage() {
  const { id } = useParams<{ id: string }>()

  if (!id) {
    return <ErrorState title="Группа не указана" />
  }

  return <CabinetWorkGroupDetailsPanel workGroupId={id} />
}
