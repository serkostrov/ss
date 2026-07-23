import DOMPurify from 'dompurify'

import { cn } from '@shared/lib/utils'
import { contentViewerClassName } from './content-viewer'

type RichTextViewerProps = {
  html: string
  className?: string
}

function RichTextViewer({ html, className }: RichTextViewerProps) {
  const safeHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  })

  return (
    <div
      className={cn(contentViewerClassName, className)}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}

export { RichTextViewer }
export type { RichTextViewerProps }
