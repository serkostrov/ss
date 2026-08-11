import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

function lazyNamed<T extends Record<string, ComponentType>>(
  factory: () => Promise<T>,
  exportName: keyof T,
): LazyExoticComponent<ComponentType> {
  return lazy(async () => {
    const module = await factory()
    return { default: module[exportName] as ComponentType }
  })
}

/** Public */
export const HomePage = lazyNamed(() => import('@pages/public/home-page'), 'HomePage')

/** Auth */
export const LoginPage = lazyNamed(() => import('@pages/auth/login-page'), 'LoginPage')
export const RegisterPage = lazyNamed(() => import('@pages/auth/register-page'), 'RegisterPage')
export const ResetPasswordPage = lazyNamed(
  () => import('@pages/auth/reset-password-page'),
  'ResetPasswordPage',
)
export const UpdatePasswordPage = lazyNamed(
  () => import('@pages/auth/update-password-page'),
  'UpdatePasswordPage',
)

/** Errors */
export const NotFoundPage = lazyNamed(() => import('@pages/errors/not-found-page'), 'NotFoundPage')
export const ForbiddenPage = lazyNamed(
  () => import('@pages/errors/forbidden-page'),
  'ForbiddenPage',
)
export const UnauthorizedPage = lazyNamed(
  () => import('@pages/errors/unauthorized-page'),
  'UnauthorizedPage',
)

/** Admin — code-split zone */
export const AdminDashboardPage = lazyNamed(
  () => import('@pages/admin/dashboard-page'),
  'AdminDashboardPage',
)
export const AdminRegistrationsPage = lazyNamed(
  () => import('@pages/admin/registrations-page'),
  'AdminRegistrationsPage',
)
export const AdminCompaniesPage = lazyNamed(
  () => import('@pages/admin/companies-page'),
  'AdminCompaniesPage',
)
export const AdminProductsPage = lazyNamed(
  () => import('@pages/admin/products-page'),
  'AdminProductsPage',
)
export const AdminProductDetailsPage = lazyNamed(
  () => import('@pages/admin/product-details-page'),
  'AdminProductDetailsPage',
)
export const AdminInvoicesPage = lazyNamed(
  () => import('@pages/admin/invoices-page'),
  'AdminInvoicesPage',
)
export const AdminInvoiceDetailsPage = lazyNamed(
  () => import('@pages/admin/invoice-details-page'),
  'AdminInvoiceDetailsPage',
)
export const AdminCompanyDetailsPage = lazyNamed(
  () => import('@pages/admin/company-details-page'),
  'AdminCompanyDetailsPage',
)
export const AdminRepresentativesPage = lazyNamed(
  () => import('@pages/admin/representatives-page'),
  'AdminRepresentativesPage',
)
export const AdminRepresentativeDetailsPage = lazyNamed(
  () => import('@pages/admin/representative-details-page'),
  'AdminRepresentativeDetailsPage',
)
export const AdminWorkGroupsPage = lazyNamed(
  () => import('@pages/admin/work-groups-page'),
  'AdminWorkGroupsPage',
)
export const AdminWorkGroupDetailsPage = lazyNamed(
  () => import('@pages/admin/work-group-details-page'),
  'AdminWorkGroupDetailsPage',
)
export const AdminMaterialsPage = lazyNamed(
  () => import('@pages/admin/materials-page'),
  'AdminMaterialsPage',
)
export const AdminMaterialDetailsPage = lazyNamed(
  () => import('@pages/admin/material-details-page'),
  'AdminMaterialDetailsPage',
)
export const AdminPollsPage = lazyNamed(() => import('@pages/admin/polls-page'), 'AdminPollsPage')
export const AdminPollDetailsPage = lazyNamed(
  () => import('@pages/admin/poll-details-page'),
  'AdminPollDetailsPage',
)
export const AdminAuditPage = lazyNamed(() => import('@pages/admin/audit-page'), 'AdminAuditPage')
export const AdminSettingsPage = lazyNamed(
  () => import('@pages/admin/settings-page'),
  'AdminSettingsPage',
)
export const AdminStaffPage = lazyNamed(() => import('@pages/admin/staff-page'), 'AdminStaffPage')
export const AdminNotificationsPage = lazyNamed(
  () => import('@pages/admin/notifications-page'),
  'AdminNotificationsPage',
)
export const AdminAccountPage = lazyNamed(
  () => import('@pages/admin/account-page'),
  'AdminAccountPage',
)

/** Cabinet — code-split zone */
export const CabinetHomePage = lazyNamed(
  () => import('@pages/cabinet/home-page'),
  'CabinetHomePage',
)
export const CabinetAccountPage = lazyNamed(
  () => import('@pages/cabinet/account-page'),
  'CabinetAccountPage',
)
export const CabinetPendingPage = lazyNamed(
  () => import('@pages/cabinet/pending-page'),
  'CabinetPendingPage',
)
export const CabinetBlockedPage = lazyNamed(
  () => import('@pages/cabinet/blocked-page'),
  'CabinetBlockedPage',
)
export const CabinetCompanyPage = lazyNamed(
  () => import('@pages/cabinet/company-page'),
  'CabinetCompanyPage',
)
export const CabinetDirectoryPage = lazyNamed(
  () => import('@pages/cabinet/directory-page'),
  'CabinetDirectoryPage',
)
export const CabinetDirectoryCompanyPage = lazyNamed(
  () => import('@pages/cabinet/directory-company-page'),
  'CabinetDirectoryCompanyPage',
)
export const CabinetProductsPage = lazyNamed(
  () => import('@pages/cabinet/products-page'),
  'CabinetProductsPage',
)
export const CabinetProductDetailsPage = lazyNamed(
  () => import('@pages/cabinet/product-details-page'),
  'CabinetProductDetailsPage',
)
export const CabinetInvoicesPage = lazyNamed(
  () => import('@pages/cabinet/invoices-page'),
  'CabinetInvoicesPage',
)
export const CabinetInvoiceDetailsPage = lazyNamed(
  () => import('@pages/cabinet/invoice-details-page'),
  'CabinetInvoiceDetailsPage',
)
export const CabinetMaterialsPage = lazyNamed(
  () => import('@pages/cabinet/materials-page'),
  'CabinetMaterialsPage',
)
export const CabinetMaterialDetailsPage = lazyNamed(
  () => import('@pages/cabinet/material-details-page'),
  'CabinetMaterialDetailsPage',
)
export const CabinetPollsPage = lazyNamed(
  () => import('@pages/cabinet/polls-page'),
  'CabinetPollsPage',
)
export const CabinetPollDetailsPage = lazyNamed(
  () => import('@pages/cabinet/poll-details-page'),
  'CabinetPollDetailsPage',
)
export const CabinetWorkGroupsPage = lazyNamed(
  () => import('@pages/cabinet/work-groups-page'),
  'CabinetWorkGroupsPage',
)
export const CabinetWorkGroupDetailsPage = lazyNamed(
  () => import('@pages/cabinet/work-group-details-page'),
  'CabinetWorkGroupDetailsPage',
)
export const CabinetNotificationsPage = lazyNamed(
  () => import('@pages/cabinet/notifications-page'),
  'CabinetNotificationsPage',
)
