import { cn } from '@shared/lib/utils'

/** Shared typography for HTML / Markdown content viewers (no typography plugin). */
const contentViewerClassName = cn(
  'max-w-none text-sm leading-relaxed text-foreground',
  '[&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold',
  '[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold',
  '[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-medium',
  '[&_p]:mb-3 [&_p]:last:mb-0',
  '[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:mb-1',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
  '[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
  '[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md',
)

export { contentViewerClassName }
