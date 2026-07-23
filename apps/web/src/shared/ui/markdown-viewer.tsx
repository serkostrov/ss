import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@shared/lib/utils'
import { contentViewerClassName } from './content-viewer'

type MarkdownViewerProps = {
  content: string
  className?: string
}

function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  return (
    <div className={cn(contentViewerClassName, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

export { MarkdownViewer }
export type { MarkdownViewerProps }
