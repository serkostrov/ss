import { CabinetProductsPanel, cabinetProductsLinks } from '@features/cabinet'

export function CabinetProductsPage() {
  const links = cabinetProductsLinks()
  return <CabinetProductsPanel companyTo={links.companyTo} productTo={links.productTo} />
}
