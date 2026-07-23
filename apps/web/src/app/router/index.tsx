import { Navigate, createBrowserRouter } from 'react-router-dom'

import { RouteErrorBoundary } from '@app/error-boundary'
import { RequireAuth, RequireGuest, RequireMemberStatus, RequireRole } from '@app/guards'
import {
  AdminLayout,
  AuthLayout,
  CabinetLayout,
  PublicLayout,
  RootLayout,
} from '@app/layouts'
import * as pages from '@app/router/lazy-pages'
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
          {
            element: <RequireAuth />,
            children: [
              { path: routes.updatePassword, element: <pages.UpdatePasswordPage /> },
            ],
          },
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
                  { path: "registrations", element: <pages.AdminRegistrationsPage /> },
                  { path: "levels", element: <Navigate to={routes.admin.settings} replace /> },
                  { path: "companies", element: <pages.AdminCompaniesPage /> },
                  { path: "companies/:id", element: <pages.AdminCompanyDetailsPage /> },
                  { path: "representatives", element: <pages.AdminRepresentativesPage /> },
                  { path: "representatives/:id", element: <pages.AdminRepresentativeDetailsPage /> },
                  { path: "work-groups", element: <pages.AdminWorkGroupsPage /> },
                  { path: "work-groups/:id", element: <pages.AdminWorkGroupDetailsPage /> },
                  { path: "messages", element: <pages.AdminMessagesPage /> },
                  { path: "materials", element: <pages.AdminMaterialsPage /> },
                  { path: "materials/:id", element: <pages.AdminMaterialDetailsPage /> },
                  { path: "polls", element: <pages.AdminPollsPage /> },
                  { path: "polls/:id", element: <pages.AdminPollDetailsPage /> },
                  { path: "staff", element: <pages.AdminStaffPage /> },
                  { path: "audit", element: <pages.AdminAuditPage /> },
                  { path: "settings", element: <pages.AdminSettingsPage /> },
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
                  { path: "pending", element: <pages.CabinetPendingPage /> },
                  { path: "blocked", element: <pages.CabinetBlockedPage /> },
                  {
                    element: <RequireMemberStatus status="confirmed" />,
                    children: [
                      { path: "company", element: <pages.CabinetCompanyPage /> },
                      { path: "directory", element: <pages.CabinetDirectoryPage /> },
                      { path: "materials", element: <pages.CabinetMaterialsPage /> },
                      { path: "materials/:slug", element: <pages.CabinetMaterialDetailsPage /> },
                      { path: "polls", element: <pages.CabinetPollsPage /> },
                      { path: "polls/:id", element: <pages.CabinetPollDetailsPage /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: "*", element: <pages.NotFoundPage /> },
    ],
  },
])
