import { useTheme } from 'next-themes'
import { Toaster as SonnerToaster } from 'sonner'
import type { ComponentProps } from 'react'

import { appConfig } from '@shared/config'

type ToasterProps = ComponentProps<typeof SonnerToaster>

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'light' } = useTheme()

  return (
    <SonnerToaster
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position={appConfig.toast.position}
      duration={appConfig.toast.durationMs}
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}
