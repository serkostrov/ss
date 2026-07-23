import { Component, type ErrorInfo, type ReactNode } from 'react'

import { ErrorFallback } from '@shared/ui'

type AppErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

type AppErrorBoundaryState = {
  error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)

    if (import.meta.env.DEV) {
      console.error('[AppErrorBoundary]', error, info.componentStack)
    }

    // Hook for future observability (Sentry, etc.)
  }

  private handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <ErrorFallback
          error={error}
          onReset={this.handleReset}
          title="Ошибка приложения"
          description="Интерфейс столкнулся с ошибкой. Можно попробовать восстановить состояние или перейти на главную."
        />
      )
    }

    return this.props.children
  }
}
