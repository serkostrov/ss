import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@app/styles/index.css'

function renderFatalError(root: HTMLElement, error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to start application'
  root.innerHTML = `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;padding:24px;line-height:1.5;color:#7f1d1d;background:#fef2f2;min-height:100vh;margin:0">${message}</pre>`
}

async function bootstrap() {
  const rootElement = document.getElementById('root')

  if (!rootElement) {
    throw new Error('Root element #root not found')
  }

  try {
    const { getClientEnv } = await import('@shared/config/env')
    getClientEnv()

    const { App } = await import('@app/index')

    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (error) {
    renderFatalError(rootElement, error)
    console.error(error)
  }
}

void bootstrap()
