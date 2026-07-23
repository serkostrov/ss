import { AppErrorBoundary } from '@app/error-boundary'

import { AuthProvider } from './auth-provider'
import { QueryProvider } from './query-provider'
import { AppRouterProvider } from './router-provider'
import { ThemeProvider } from './theme-provider'
import { ToastProvider } from './toast-provider'

/**
 * Root provider tree (outer → inner):
 * ErrorBoundary → Theme → Query → Toast → Auth → Router(+Suspense)
 */
export function AppProviders() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>
              <AppRouterProvider />
            </AuthProvider>
          </ToastProvider>
        </QueryProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}
