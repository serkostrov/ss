import { Navigate, createBrowserRouter } from 'react-router-dom'

import { RouteErrorBoundary } from '@app/error-boundary'
import {
  RequireAuth,
  RequireGuest,
  RequireMemberStatus,
  RequireNonExitedCompany,
  RequireRole,
} from '@app/guards'
import { AdminLayout, AuthLayout, CabinetLayout, PublicLayout, RootLayout } from '@app/layouts'
import * as pages from '@app/router/lazy-pages'
import { RequireCabinetResource } from '@features/cabinet'
import { routes } from '@shared/config'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: routes.home, element: <pages.HomePage /> },
          { path: routes.unauthorized, element: <pages.UnauthorizedPage /> },
          { path: routes.forbidden, element: <pages.ForbiddenPage /> },
          { path: routes.notFound, element: <pages.NotFoundPage /> },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          {
            element: <RequireGuest />,
            children: [
              { path: routes.login, element: <pages.LoginPage /> },
              { path: routes.register, element: <pages.RegisterPage /> },
              { path: routes.resetPassword, element: <pages.ResetPasswordPage /> },
            ],
          },
          { path: routes.updatePassword, element: <pages.UpdatePasswordPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: routes.admin.root,
            element: <RequireRole role="admin" />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { index: true, element: <pages.AdminDashboardPage /> },
                  { path: 'registrations', element: <pages.AdminRegistrationsPage /> },
                  { path: 'levels', element: <Navigate to={routes.admin.settings} replace /> },
                  { path: 'companies', element: <pages.AdminCompaniesPage /> },
                  { path: 'companies/:id', element: <pages.AdminCompanyDetailsPage /> },
                  { path: 'products', element: <pages.AdminProductsPage /> },
                  { path: 'products/:id', element: <pages.AdminProductDetailsPage /> },
                  { path: 'invoices', element: <pages.AdminInvoicesPage /> },
                  { path: 'invoices/:id', element: <pages.AdminInvoiceDetailsPage /> },
                  { path: 'representatives', element: <pages.AdminRepresentativesPage /> },
                  {
                    path: 'representatives/:id',
                    element: <pages.AdminRepresentativeDetailsPage />,
                  },
                  { path: 'work-groups', element: <pages.AdminWorkGroupsPage /> },
                  { path: 'work-groups/:id', element: <pages.AdminWorkGroupDetailsPage /> },
                  { path: 'materials', element: <pages.AdminMaterialsPage /> },
                  { path: 'materials/:id', element: <pages.AdminMaterialDetailsPage /> },
                  { path: 'polls', element: <pages.AdminPollsPage /> },
                  { path: 'polls/:id', element: <pages.AdminPollDetailsPage /> },
                  { path: 'staff', element: <pages.AdminStaffPage /> },
                  { path: 'notifications', element: <pages.AdminNotificationsPage /> },
                  { path: 'audit', element: <pages.AdminAuditPage /> },
                  { path: 'settings', element: <pages.AdminSettingsPage /> },
                  { path: 'account', element: <pages.AdminAccountPage /> },
                ],
              },
            ],
          },
          {
            path: routes.cabinet.root,
            element: <RequireRole role="member" />,
            children: [
              {
                element: <CabinetLayout />,
                children: [
                  { index: true, element: <pages.CabinetHomePage /> },
                  { path: 'pending', element: <pages.CabinetPendingPage /> },
                  { path: 'blocked', element: <pages.CabinetBlockedPage /> },
                  {
                    element: <RequireMemberStatus status="confirmed" />,
                    children: [
                      { path: 'account', element: <pages.CabinetAccountPage /> },
                      {
                        path: 'company',
                        element: <Navigate to={`${routes.cabinet.account}?tab=company`} replace />,
                      },
                      {
                        element: <RequireNonExitedCompany />,
                        children: [
                          { path: 'notifications', element: <pages.CabinetNotificationsPage /> },
                          {
                            path: 'directory',
                            element: (
                              <RequireCabinetResource resource="directory">
                                <pages.CabinetDirectoryPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'directory/:id',
                            element: (
                              <RequireCabinetResource resource="directory">
                                <pages.CabinetDirectoryCompanyPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'products',
                            element: (
                              <RequireCabinetResource resource="products">
                                <pages.CabinetProductsPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'products/:id',
                            element: (
                              <RequireCabinetResource resource="products">
                                <pages.CabinetProductDetailsPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'invoices',
                            element: (
                              <RequireCabinetResource resource="invoices">
                                <pages.CabinetInvoicesPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'invoices/:id',
                            element: (
                              <RequireCabinetResource resource="invoices">
                                <pages.CabinetInvoiceDetailsPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'materials',
                            element: (
                              <RequireCabinetResource resource="materials">
                                <pages.CabinetMaterialsPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'materials/:slug',
                            element: (
                              <RequireCabinetResource resource="materials">
                                <pages.CabinetMaterialDetailsPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'polls',
                            element: (
                              <RequireCabinetResource resource="polls">
                                <pages.CabinetPollsPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'polls/:id',
                            element: (
                              <RequireCabinetResource resource="polls">
                                <pages.CabinetPollDetailsPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'work-groups',
                            element: (
                              <RequireCabinetResource resource="work_groups">
                                <pages.CabinetWorkGroupsPage />
                              </RequireCabinetResource>
                            ),
                          },
                          {
                            path: 'work-groups/:id',
                            element: (
                              <RequireCabinetResource resource="work_groups">
                                <pages.CabinetWorkGroupDetailsPage />
                              </RequireCabinetResource>
                            ),
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <pages.NotFoundPage /> },
    ],
  },
])
