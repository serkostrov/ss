import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'

/**
 * Defense in depth against Vite fs.deny bypasses that leak .env / keys
 * when the dev or preview server is reachable on the network.
 */
export function isSensitiveRequestUrl(url: string): boolean {
  const pathOnly = (url.split('?')[0] ?? '').replace(/%00/gi, '')
  let decoded = pathOnly
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded.replace(/\+/g, '%2B'))
      if (next === decoded) break
      decoded = next
    } catch {
      break
    }
  }

  const normalized = decoded
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\\/g, '/')
    .replace(/::[^/]*$/u, '')
    .replace(/\/\.(?=\/|$)/g, '/')
    .replace(/\/+$/g, '')
    .toLowerCase()

  return normalized.split('/').some((segment) => {
    const name = segment.replace(/[.]+$/g, '')
    return (
      name === '.env' ||
      name.startsWith('.env.') ||
      name === '.git' ||
      name.endsWith('.pem') ||
      name.endsWith('.crt') ||
      name.endsWith('.key')
    )
  })
}

function deny(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction): void {
  if (isSensitiveRequestUrl(req.url ?? '')) {
    res.statusCode = 403
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Forbidden')
    return
  }
  next()
}

export function blockSensitiveFilesPlugin(): Plugin {
  return {
    name: 'block-sensitive-files',
    configureServer(server) {
      server.middlewares.use(deny)
    },
    configurePreviewServer(server) {
      server.middlewares.use(deny)
    },
  }
}
